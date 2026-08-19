import { createAuthBasePathFetcher } from "@voyant-travel/auth-react/client"
import { describe, expect, it, vi } from "vitest"
import { listMcpConnectors, revokeMcpConnector, toMcpConnector } from "./mcp-connectors.js"

const consent = {
  id: "consent_1",
  clientId: "client_abc",
  scopes: ["mcp:read"],
  createdAt: "2026-07-29T10:00:00.000Z",
}

function adminShellFetcher(transport: (url: string, init?: RequestInit) => Promise<Response>) {
  return createAuthBasePathFetcher(transport, {
    baseUrl: "/api",
    authBasePath: "/auth/admin",
    sharedPaths: ["/me", "/status", "/shell-bootstrap"],
  })
}

describe("toMcpConnector", () => {
  it("marks a connector writable only when the grant includes mcp:write", () => {
    expect(toMcpConnector(consent, { name: "Claude" }).canWrite).toBe(false)
    expect(
      toMcpConnector({ ...consent, scopes: ["mcp:read", "mcp:write"] }, { name: "Claude" })
        .canWrite,
    ).toBe(true)
  })

  it("accepts either the name or client_name field from the client record", () => {
    expect(toMcpConnector(consent, { name: "Claude" }).name).toBe("Claude")
    expect(toMcpConnector(consent, { client_name: "ChatGPT" }).name).toBe("ChatGPT")
  })

  it("falls back to no name when the client registered without one", () => {
    expect(toMcpConnector(consent, null).name).toBeNull()
    expect(toMcpConnector(consent, { name: "   " }).name).toBeNull()
  })
})

describe("listMcpConnectors", () => {
  it("resolves each consent to its registered client name", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes("get-consents")
        ? Response.json([consent])
        : Response.json({ name: "Claude Desktop" }),
    )

    await expect(listMcpConnectors("/api", adminShellFetcher(fetcher))).resolves.toEqual([
      expect.objectContaining({ id: "consent_1", name: "Claude Desktop", canWrite: false }),
    ])
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/auth/admin/oauth2/get-consents",
      "/api/auth/admin/oauth2/get-client?client_id=client_abc",
    ])
  })

  it("still lists a connector whose client lookup fails", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes("get-consents") ? Response.json([consent]) : new Response("", { status: 500 }),
    )

    const connectors = await listMcpConnectors("/api", adminShellFetcher(fetcher))

    // Hiding a live grant because a name lookup failed would keep the operator
    // from revoking something that still has access.
    expect(connectors).toHaveLength(1)
    expect(connectors[0]?.name).toBeNull()
    expect(connectors[0]?.clientId).toBe("client_abc")
  })

  it("throws when the consent list itself cannot be read", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 401 }))

    await expect(listMcpConnectors("/api", adminShellFetcher(fetcher))).rejects.toThrow()
  })
})

describe("revokeMcpConnector", () => {
  it("posts the consent id to the delete endpoint", async () => {
    const fetcher = vi.fn(async () => Response.json({}))

    await revokeMcpConnector("/api", adminShellFetcher(fetcher), "consent_1")

    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/admin/oauth2/delete-consent",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ id: "consent_1" }) }),
    )
  })

  it("surfaces a failed revoke instead of reporting success", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 404 }))

    await expect(
      revokeMcpConnector("/api", adminShellFetcher(fetcher), "consent_1"),
    ).rejects.toThrow()
  })
})
