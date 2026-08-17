import { describe, expect, it, vi } from "vitest"
import { createAuthBasePathFetcher } from "./client.js"
import {
  fetchMcpConsentClient,
  McpConsentError,
  submitMcpConsentDecision,
} from "./mcp-consent-client.js"

const BASE_URL = "/api"

/**
 * The genuine article from the admin shell, not a stand-in.
 *
 * A stub fetcher accepts whichever URL the caller happens to build, which is
 * exactly how `/api/auth/admin/admin/oauth2/consent` shipped: the old tests
 * asserted the string the component produced instead of the string the shell
 * would actually request.
 */
function adminShellFetcher(transport: (url: string, init?: RequestInit) => Promise<Response>) {
  return createAuthBasePathFetcher(transport, {
    baseUrl: BASE_URL,
    authBasePath: "/auth/admin",
    sharedPaths: ["/me", "/status", "/shell-bootstrap"],
  })
}

/** A transport with the fetcher's own signature, so the recorded call is typed. */
function stubTransport(respond: (url: string, init?: RequestInit) => Response) {
  return vi.fn((url: string, init?: RequestInit) => Promise.resolve(respond(url, init)))
}

function countRealmSegments(url: string): number {
  return url.split("/").filter((segment) => segment === "admin").length
}

describe("MCP consent requests through the admin shell fetcher", () => {
  it("reaches the admin OAuth consent endpoint with exactly one realm segment", async () => {
    const transport = stubTransport(() =>
      Response.json({ redirectURI: "https://claude.ai/cb?code=1" }),
    )

    const redirect = await submitMcpConsentDecision({
      baseUrl: BASE_URL,
      fetcher: adminShellFetcher(transport),
      accept: true,
      oauthQuery: "client_id=abc&sig=xyz",
    })

    const url = transport.mock.calls[0]?.[0] ?? ""
    expect(url).toBe("/api/auth/admin/oauth2/consent")
    expect(countRealmSegments(url)).toBe(1)
    expect(redirect).toBe("https://claude.ai/cb?code=1")
  })

  it("reaches the public-client lookup with exactly one realm segment", async () => {
    const transport = stubTransport(() => Response.json({ client_name: "ChatGPT" }))

    const client = await fetchMcpConsentClient({
      baseUrl: BASE_URL,
      fetcher: adminShellFetcher(transport),
      clientId: "client_abc",
    })

    const url = transport.mock.calls[0]?.[0] ?? ""
    expect(url).toBe("/api/auth/admin/oauth2/public-client?client_id=client_abc")
    expect(countRealmSegments(url)).toBe(1)
    expect(client?.client_name).toBe("ChatGPT")
  })

  it("posts the signed query verbatim, repeated parameters and order intact", async () => {
    // The authorization server signs one `ba_param` entry per signed parameter.
    // Anything that parses this into an object drops all but the last, and the
    // signature check then fails with `invalid_signature`.
    const oauthQuery =
      "response_type=code&client_id=abc&scope=mcp%3Aread+mcp%3Awrite+offline_access" +
      "&ba_param=ba_iat&ba_param=client_id&ba_param=scope&ba_param=state&sig=deadbeef"
    const transport = stubTransport(() => Response.json({ redirectURI: "https://claude.ai/cb" }))

    await submitMcpConsentDecision({
      baseUrl: BASE_URL,
      fetcher: adminShellFetcher(transport),
      accept: true,
      oauthQuery,
    })

    const body = JSON.parse(String(transport.mock.calls[0]?.[1]?.body)) as { oauth_query: string }
    expect(body.oauth_query).toBe(oauthQuery)
    expect(new URLSearchParams(body.oauth_query).getAll("ba_param")).toEqual([
      "ba_iat",
      "client_id",
      "scope",
      "state",
    ])
  })

  it("carries the status and server detail off a failed decision", async () => {
    const transport = stubTransport(() =>
      Response.json({ error: "invalid_signature" }, { status: 400 }),
    )

    const error = await submitMcpConsentDecision({
      baseUrl: BASE_URL,
      fetcher: adminShellFetcher(transport),
      accept: true,
      oauthQuery: "client_id=abc&sig=tampered",
    }).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(McpConsentError)
    expect((error as McpConsentError).status).toBe(400)
    expect((error as McpConsentError).detail).toBe("invalid_signature")
    expect((error as McpConsentError).diagnostic).toBe("400 invalid_signature")
  })

  it("distinguishes a routing 404 from a rejected decision", async () => {
    // The failure this whole change exists to stop looked identical to every
    // other failure. It must not any more.
    const transport = stubTransport(() => new Response("Not Found", { status: 404 }))

    const error = (await submitMcpConsentDecision({
      baseUrl: BASE_URL,
      fetcher: adminShellFetcher(transport),
      accept: true,
      oauthQuery: "client_id=abc",
    }).catch((thrown: unknown) => thrown)) as McpConsentError

    expect(error.status).toBe(404)
    expect(error.diagnostic).toContain("404")
  })

  it("reports a 2xx response that carries no redirect instead of hanging", async () => {
    const transport = stubTransport(() => Response.json({}))

    const error = (await submitMcpConsentDecision({
      baseUrl: BASE_URL,
      fetcher: adminShellFetcher(transport),
      accept: false,
      oauthQuery: "client_id=abc",
    }).catch((thrown: unknown) => thrown)) as McpConsentError

    expect(error).toBeInstanceOf(McpConsentError)
    expect(error.status).toBe(200)
  })

  it("falls back to no client name rather than blocking the grant", async () => {
    const transport = stubTransport(() => new Response("", { status: 401 }))

    await expect(
      fetchMcpConsentClient({
        baseUrl: BASE_URL,
        fetcher: adminShellFetcher(transport),
        clientId: "client_abc",
      }),
    ).resolves.toBeNull()
  })
})
