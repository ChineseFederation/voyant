import { describe, expect, it, vi } from "vitest"
import { createAuthBasePathFetcher } from "./client.js"
import {
  fetchMcpConsentClient,
  McpConsentError,
  submitMcpConsentDecision,
} from "./mcp-consent-client.js"

const BASE_URL = "/api"

function adminShellFetcher(transport: (url: string, init?: RequestInit) => Promise<Response>) {
  return createAuthBasePathFetcher(transport, {
    baseUrl: BASE_URL,
    authBasePath: "/auth/admin",
    sharedPaths: ["/me", "/status", "/shell-bootstrap"],
  })
}

describe("MCP consent requests through the admin shell fetcher", () => {
  it("routes consent and client lookup through exactly one admin realm", async () => {
    const transport = vi.fn(async (url: string) =>
      url.includes("public-client")
        ? Response.json({ client_name: "ChatGPT" })
        : Response.json({ redirectURI: "https://chatgpt.com/cb?code=1" }),
    )
    const fetcher = adminShellFetcher(transport)

    await fetchMcpConsentClient({ baseUrl: BASE_URL, fetcher, clientId: "client_abc" })
    await submitMcpConsentDecision({
      baseUrl: BASE_URL,
      fetcher,
      accept: true,
      oauthQuery: "client_id=abc&sig=xyz",
    })

    const urls = transport.mock.calls.map(([url]) => url)
    expect(urls).toEqual([
      "/api/auth/admin/oauth2/public-client?client_id=client_abc",
      "/api/auth/admin/oauth2/consent",
    ])
    for (const url of urls) {
      expect(url.split("/").filter((segment) => segment === "admin")).toHaveLength(1)
    }
  })

  it("preserves the signed OAuth query byte for byte", async () => {
    const oauthQuery =
      "client_id=abc&ba_param=client_id&ba_param=scope&scope=mcp%3Aread&sig=deadbeef"
    const transport = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ redirectURI: "https://claude.ai/cb" }),
    )

    await submitMcpConsentDecision({
      baseUrl: BASE_URL,
      fetcher: adminShellFetcher(transport),
      accept: true,
      oauthQuery,
    })

    const body = JSON.parse(String(transport.mock.calls[0]?.[1]?.body)) as { oauth_query: string }
    expect(body.oauth_query).toBe(oauthQuery)
    expect(new URLSearchParams(body.oauth_query).getAll("ba_param")).toEqual(["client_id", "scope"])
  })

  it("retains response status and detail when consent fails", async () => {
    const transport = vi.fn(async () =>
      Response.json({ error: "invalid_signature" }, { status: 400 }),
    )

    const error = await submitMcpConsentDecision({
      baseUrl: BASE_URL,
      fetcher: adminShellFetcher(transport),
      accept: true,
      oauthQuery: "client_id=abc&sig=tampered",
    }).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(McpConsentError)
    expect((error as McpConsentError).diagnostic).toBe("400 invalid_signature")
  })
})
