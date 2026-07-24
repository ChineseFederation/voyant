import { describe, expect, it } from "vitest"

import { assertStorageProviderConformance } from "../conformance.js"
import { createGatewayStorageProvider } from "./gateway.js"

interface StoredObject {
  bytes: Uint8Array
  contentType: string
  metadata?: Record<string, string>
}

/**
 * A tiny in-memory fake of the storage-gateway HTTP contract. Returns a `fetch`
 * implementation plus the calls it observed so tests can assert on headers.
 */
function createFakeGateway(options: { token?: string } = {}) {
  const expectedToken = options.token ?? "t"
  const store = new Map<string, StoredObject>()
  const calls: Array<{ method: string; url: string; authorization: string | null }> = []

  // A narrow adapter typed as the platform `fetch`, so no cast is needed to
  // hand it to the provider.
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const rawUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(rawUrl)
    const method = init?.method ?? "GET"
    const headers = new Headers(init?.headers)
    const authorization = headers.get("authorization")
    calls.push({ method, url: url.toString(), authorization })

    if (authorization !== `Bearer ${expectedToken}`) {
      return new Response("unauthorized", { status: 401 })
    }

    // /v1/objects/<encoded key...>[/signed-url]
    const prefix = "/v1/objects/"
    const rest = decodeURIComponent(url.pathname.slice(prefix.length))

    if (method === "POST" && rest.endsWith("/signed-url")) {
      const key = rest.slice(0, -"/signed-url".length)
      if (!store.has(key)) return new Response("not found", { status: 404 })
      return Response.json({ url: `${url.origin}/download/${encodeURIComponent(key)}?sig=abc` })
    }

    const key = rest

    if (method === "PUT") {
      const body = new Uint8Array(await bodyToArrayBuffer(init?.body))
      const rawMetadata = headers.get("x-voyant-metadata")
      const record: StoredObject = {
        bytes: body,
        contentType: headers.get("content-type") ?? "application/octet-stream",
      }
      if (rawMetadata) record.metadata = JSON.parse(rawMetadata)
      store.set(key, record)
      return Response.json({ key, url: `${url.origin}/objects/${encodeURIComponent(key)}` })
    }

    if (method === "GET") {
      const record = store.get(key)
      if (!record) return new Response("not found", { status: 404 })
      return new Response(record.bytes as BodyInit, { status: 200 })
    }

    if (method === "DELETE") {
      if (!store.has(key)) return new Response(null, { status: 404 })
      store.delete(key)
      return new Response(null, { status: 204 })
    }

    return new Response("method not allowed", { status: 405 })
  }

  return { fetch, calls, store }
}

async function bodyToArrayBuffer(body: BodyInit | null | undefined): Promise<ArrayBuffer> {
  if (body == null) return new ArrayBuffer(0)
  return new Response(body as BodyInit).arrayBuffer()
}

describe("createGatewayStorageProvider", () => {
  it("binds opaque backend identity to the workspace credential", async () => {
    const first = createGatewayStorageProvider({
      endpoint: "https://gateway.example",
      tier: "documents",
      token: "workspace-a-secret",
    })
    const second = createGatewayStorageProvider({
      endpoint: "https://gateway.example",
      tier: "documents",
      token: "workspace-b-secret",
    })

    const firstIdentity = await first.resolveBackendIdentity?.()
    expect(firstIdentity).toMatch(/^[a-f0-9]{64}$/)
    expect(await second.resolveBackendIdentity?.()).not.toBe(firstIdentity)
    expect(firstIdentity).not.toContain("workspace-a-secret")
  })

  it("uploads bytes and returns the gateway-issued key and url", async () => {
    const gateway = createFakeGateway()
    const provider = createGatewayStorageProvider({
      endpoint: "https://gw.test",
      token: "t",
      fetch: gateway.fetch,
    })

    const result = await provider.upload(new Uint8Array([1, 2, 3]), {
      key: "docs/report.pdf",
      contentType: "application/pdf",
      metadata: { owner: "workspace" },
    })

    expect(result).toEqual({
      key: "docs/report.pdf",
      url: "https://gw.test/objects/docs%2Freport.pdf",
    })
    const stored = gateway.store.get("docs/report.pdf")
    expect(stored?.bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(stored?.contentType).toBe("application/pdf")
    expect(stored?.metadata).toEqual({ owner: "workspace" })
  })

  it("round-trips bytes through get and returns null for a missing key", async () => {
    const gateway = createFakeGateway()
    const provider = createGatewayStorageProvider({
      endpoint: "https://gw.test",
      token: "t",
      fetch: gateway.fetch,
    })

    const bytes = new Uint8Array([9, 8, 7, 6])
    const { key } = await provider.upload(bytes, { key: "a/b/c.bin" })

    const fetched = await provider.get(key)
    expect(fetched).not.toBeNull()
    expect(new Uint8Array(fetched as ArrayBuffer)).toEqual(bytes)

    await expect(provider.get("missing/object")).resolves.toBeNull()
  })

  it("deletes an object and is a no-op for a missing key", async () => {
    const gateway = createFakeGateway()
    const provider = createGatewayStorageProvider({
      endpoint: "https://gw.test",
      token: "t",
      fetch: gateway.fetch,
    })

    await provider.upload(new Uint8Array([1]), { key: "temp/file" })
    await provider.delete("temp/file")
    await expect(provider.get("temp/file")).resolves.toBeNull()

    // No-op on an absent key: resolves without throwing.
    await expect(provider.delete("temp/file")).resolves.toBeUndefined()
  })

  it("returns a signed url for an object", async () => {
    const gateway = createFakeGateway()
    const provider = createGatewayStorageProvider({
      endpoint: "https://gw.test",
      token: "t",
      fetch: gateway.fetch,
    })

    await provider.upload(new Uint8Array([1]), { key: "docs/file.txt" })
    const url = await provider.signedUrl?.("docs/file.txt", 60)
    expect(url).toBe("https://gw.test/download/docs%2Ffile.txt?sig=abc")
  })

  it("sends Authorization: Bearer on every request", async () => {
    const gateway = createFakeGateway({ token: "test-bearer-token" })
    const provider = createGatewayStorageProvider({
      endpoint: "https://gw.test",
      token: "test-bearer-token",
      fetch: gateway.fetch,
    })

    await provider.upload(new Uint8Array([1]), { key: "k" })
    await provider.get("k")
    await provider.signedUrl?.("k", 30)
    await provider.delete("k")

    expect(gateway.calls).toHaveLength(4)
    for (const call of gateway.calls) {
      expect(call.authorization).toBe("Bearer test-bearer-token")
    }
  })

  it("throws a clear auth error on 401", async () => {
    const gateway = createFakeGateway({ token: "right" })
    const provider = createGatewayStorageProvider({
      endpoint: "https://gw.test",
      token: "wrong",
      fetch: gateway.fetch,
    })

    await expect(provider.upload(new Uint8Array([1]), { key: "k" })).rejects.toThrow(/401/)
  })

  it("uses the provided name and defaults to gateway", () => {
    const gateway = createFakeGateway()
    expect(
      createGatewayStorageProvider({
        endpoint: "https://gw.test",
        token: "t",
        fetch: gateway.fetch,
      }).name,
    ).toBe("gateway")
    expect(
      createGatewayStorageProvider({
        endpoint: "https://gw.test",
        token: "t",
        fetch: gateway.fetch,
        name: "documents",
      }).name,
    ).toBe("documents")
  })

  it("prefixes the tier on the wire but keeps caller keys un-prefixed", async () => {
    const gateway = createFakeGateway()
    const provider = createGatewayStorageProvider({
      endpoint: "https://gw.test",
      token: "t",
      fetch: gateway.fetch,
      tier: "media",
    })

    const result = await provider.upload(new Uint8Array([1, 2, 3]), {
      key: "uploads/media/x.png",
      contentType: "image/png",
    })

    // The caller sees its own key; the object is stored under the tier-prefixed
    // wire key (so the gateway can route to the media bucket).
    expect(result.key).toBe("uploads/media/x.png")
    expect(gateway.store.has("media/uploads/media/x.png")).toBe(true)
    expect(gateway.store.has("uploads/media/x.png")).toBe(false)

    // get/delete round-trip with the caller key — no double-prefix.
    const fetched = await provider.get(result.key)
    expect(new Uint8Array(fetched as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
    await provider.delete(result.key)
    expect(gateway.store.has("media/uploads/media/x.png")).toBe(false)
  })

  it("satisfies the portable storage provider conformance contract", async () => {
    const gateway = createFakeGateway()
    await assertStorageProviderConformance({
      createProvider: () =>
        createGatewayStorageProvider({
          endpoint: "https://gw.test",
          token: "t",
          fetch: gateway.fetch,
        }),
    })
  })
})
