import type { AccessCatalog } from "@voyant-travel/types/api-keys"
import { describe, expect, it, vi } from "vitest"

import {
  type ApiTokenRotationStore,
  type BetterAuthApiTokenManagement,
  handleApiTokenManagementRequest,
} from "../../src/server.js"

function createAuthMock(): BetterAuthApiTokenManagement {
  return {
    api: {
      getSession: vi.fn(async () => ({ user: { id: "user_123" } })),
      listApiKeys: vi.fn(async () => ({ apiKeys: [], total: 0, limit: 25, offset: 0 })),
      createApiKey: vi.fn(async ({ body }) => ({
        id: "key_123",
        key: "voy_secret",
        createdAt: "2026-05-11T00:00:00.000Z",
        ...body,
      })),
      updateApiKey: vi.fn(async ({ body }) => ({
        id: body.keyId,
        createdAt: "2026-05-11T00:00:00.000Z",
        ...body,
      })),
      deleteApiKey: vi.fn(async () => ({ success: true })),
    },
  }
}

const selectedCatalog: AccessCatalog = {
  resources: [
    {
      id: "bookings",
      unitId: "@voyant-travel/bookings",
      resource: "bookings",
      label: "Bookings",
      description: "Bookings",
      wildcard: "allow",
      actions: [
        { action: "read", label: "Read", description: "Read" },
        { action: "write", label: "Write", description: "Write" },
      ],
    },
    {
      id: "catalog",
      unitId: "@voyant-travel/catalog",
      resource: "catalog",
      label: "Catalog",
      description: "Catalog",
      wildcard: "allow",
      actions: [
        { action: "read", label: "Read", description: "Read" },
        { action: "search", label: "Search", description: "Search" },
      ],
    },
    {
      id: "products",
      unitId: "@voyant-travel/inventory",
      resource: "products",
      label: "Products",
      description: "Products",
      wildcard: "allow",
      actions: [{ action: "read", label: "Read", description: "Read" }],
    },
  ],
  presets: [
    {
      id: "agent-staff",
      kind: "api-token-grant",
      label: "Agent staff",
      description: "Agent staff",
      grants: ["bookings:read", "bookings:write"],
      audience: "staff",
    },
    {
      id: "public-catalog-reader",
      kind: "api-token-grant",
      label: "Public catalog reader",
      description: "Public catalog reader",
      grants: ["catalog:read", "catalog:search", "products:read"],
      audience: "customer",
    },
  ],
}

async function responseJson(response: Response | null): Promise<unknown> {
  expect(response).not.toBeNull()
  return response?.json()
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  let binary = ""
  for (const byte of new Uint8Array(hashBuffer)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function createRotationStore() {
  const row = {
    id: "key_123",
    configId: "default",
    name: "CMS sync",
    start: "voy_ol",
    prefix: "voy_",
    referenceId: "user_123",
    enabled: true,
    rateLimitEnabled: false,
    rateLimitTimeWindow: null,
    rateLimitMax: null,
    requestCount: 12,
    remaining: null,
    lastRequest: new Date("2026-05-11T00:00:00.000Z"),
    createdAt: new Date("2026-05-10T00:00:00.000Z"),
    updatedAt: new Date("2026-05-11T00:00:00.000Z"),
    expiresAt: null,
    permissions: JSON.stringify({ products: ["read"] }),
    metadata: JSON.stringify({ owner: "integrations" }),
  }
  const store: ApiTokenRotationStore = {
    getApiToken: vi.fn(async () => row as never),
    rotateApiTokenSecret: vi.fn(async (_keyId, rotation) => ({
      ...row,
      start: rotation.start,
      updatedAt: rotation.updatedAt,
      metadata: rotation.metadata,
    })),
  }
  return { row, store }
}

describe("handleApiTokenManagementRequest", () => {
  it("returns null for requests outside the facade", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/session"),
      auth,
    )

    expect(response).toBeNull()
    expect(auth.api.listApiKeys).not.toHaveBeenCalled()
  })

  it("lists API tokens through Better Auth's server API", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request(
        "https://example.com/auth/api-tokens?limit=10&offset=20&sortBy=createdAt&sortDirection=desc",
      ),
      auth,
    )

    expect(response?.status).toBe(200)
    expect(await responseJson(response)).toEqual({ apiKeys: [], total: 0, limit: 25, offset: 0 })
    expect(auth.api.listApiKeys).toHaveBeenCalledWith({
      query: { limit: 10, offset: 20, sortBy: "createdAt", sortDirection: "desc" },
      headers: expect.any(Headers),
    })
  })

  it("supports custom auth base paths", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/api/auth/api-tokens"),
      auth,
      { basePath: "/api/auth" },
    )

    expect(response?.status).toBe(200)
    expect(auth.api.listApiKeys).toHaveBeenCalled()
  })

  it("attaches the session user id when creating permissioned API tokens", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/api-tokens", {
        method: "POST",
        body: JSON.stringify({
          name: "CMS sync",
          permissions: { products: ["read"] },
          remaining: 100,
          ignored: true,
        }),
      }),
      auth,
      { accessCatalog: selectedCatalog },
    )

    expect(response?.status).toBe(201)
    expect(auth.api.getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) })
    expect(auth.api.createApiKey).toHaveBeenCalledWith({
      body: {
        name: "CMS sync",
        permissions: { products: ["read"] },
        remaining: 100,
        userId: "user_123",
      },
    })
    expect(await responseJson(response)).toMatchObject({
      id: "key_123",
      name: "CMS sync",
      userId: "user_123",
    })
  })

  it("attaches key id and session user id when updating API tokens", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/api-tokens/key%20123", {
        method: "POST",
        body: JSON.stringify({ enabled: false, permissions: { catalog: ["search"] } }),
      }),
      auth,
      { accessCatalog: selectedCatalog },
    )

    expect(response?.status).toBe(200)
    expect(auth.api.updateApiKey).toHaveBeenCalledWith({
      body: {
        enabled: false,
        permissions: { catalog: ["search"] },
        keyId: "key 123",
        userId: "user_123",
      },
    })
  })

  it("deletes API tokens with the request session headers", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/api-tokens/key_123", {
        method: "DELETE",
        body: JSON.stringify({ configId: "default" }),
      }),
      auth,
    )

    expect(response?.status).toBe(200)
    expect(await responseJson(response)).toEqual({ success: true })
    expect(auth.api.deleteApiKey).toHaveBeenCalledWith({
      body: { configId: "default", keyId: "key_123" },
      headers: expect.any(Headers),
    })
  })

  it("rotates API tokens while preserving id, permissions, usage metadata, and audit history", async () => {
    const auth = createAuthMock()
    const { store } = createRotationStore()
    const oldHash = await sha256Base64Url("voy_oldsecret")

    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/api-tokens/key_123/rotate", {
        method: "POST",
      }),
      auth,
      {
        rotationStore: store,
        generateApiTokenSecret: () => "voy_newsecret",
      },
    )

    expect(response?.status).toBe(200)
    expect(auth.api.updateApiKey).toHaveBeenCalledWith({
      body: {
        keyId: "key_123",
        enabled: true,
        userId: "user_123",
      },
    })
    expect(store.rotateApiTokenSecret).toHaveBeenCalledWith(
      "key_123",
      expect.objectContaining({
        keyHash: await sha256Base64Url("voy_newsecret"),
        start: "voy_ne",
      }),
    )
    expect(store.rotateApiTokenSecret).not.toHaveBeenCalledWith(
      "key_123",
      expect.objectContaining({ keyHash: oldHash }),
    )

    const body = (await responseJson(response)) as {
      id: string
      key: string
      requestCount: number
      permissions: Record<string, string[]>
      metadata: { voyant?: { apiToken?: { previousStarts?: string[]; rotationCount?: number } } }
    }
    expect(body).toMatchObject({
      id: "key_123",
      key: "voy_newsecret",
      requestCount: 12,
      permissions: { products: ["read"] },
    })
    expect(body.metadata.voyant?.apiToken?.rotationCount).toBe(1)
    expect(body.metadata.voyant?.apiToken?.previousStarts).toContain("voy_ol")
  })

  it("requires POST for API token rotation", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/api-tokens/key_123/rotate", { method: "GET" }),
      auth,
      { rotationStore: createRotationStore().store },
    )

    expect(response?.status).toBe(405)
    expect(response?.headers.get("Allow")).toBe("POST")
    expect(auth.api.updateApiKey).not.toHaveBeenCalled()
  })

  it("normalizes missing sessions to 401 responses", async () => {
    const auth = createAuthMock()
    vi.mocked(auth.api.getSession).mockResolvedValue(null)

    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/api-tokens", {
        method: "POST",
        body: JSON.stringify({ name: "CMS sync", permissions: { products: ["read"] } }),
      }),
      auth,
    )

    expect(response?.status).toBe(401)
    expect(await responseJson(response)).toEqual({ error: "Unauthorized" })
    expect(auth.api.createApiKey).not.toHaveBeenCalled()
  })

  it("rejects an unknown permission at mint time with 400", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/api-tokens", {
        method: "POST",
        body: JSON.stringify({ name: "typo", permissions: { bananas: ["read"] } }),
      }),
      auth,
    )

    expect(response?.status).toBe(400)
    expect(await responseJson(response)).toMatchObject({
      error: expect.stringContaining("bananas"),
    })
    expect(auth.api.createApiKey).not.toHaveBeenCalled()
  })

  it("rejects a known action on an unsupported selected resource pair", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/api-tokens", {
        method: "POST",
        body: JSON.stringify({ name: "invalid pair", permissions: { bookings: ["send"] } }),
      }),
      auth,
      { accessCatalog: selectedCatalog },
    )

    expect(response?.status).toBe(400)
    expect(auth.api.createApiKey).not.toHaveBeenCalled()
  })

  it("rejects an invalid audience at mint time with 400", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/api-tokens", {
        method: "POST",
        body: JSON.stringify({ name: "bad-aud", metadata: { audience: "robot" } }),
      }),
      auth,
    )

    expect(response?.status).toBe(400)
    expect(auth.api.createApiKey).not.toHaveBeenCalled()
  })

  it("resolves a grant preset into permissions + audience metadata", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/api-tokens", {
        method: "POST",
        body: JSON.stringify({ name: "public reader", grantPreset: "public-catalog-reader" }),
      }),
      auth,
      { accessCatalog: selectedCatalog },
    )

    expect(response?.status).toBe(201)
    const call = vi.mocked(auth.api.createApiKey).mock.calls[0]?.[0] as {
      body: {
        permissions: Record<string, string[]>
        metadata: { audience: string }
        userId: string
      }
    }
    expect(call.body.permissions).toMatchObject({ catalog: ["read", "search"], products: ["read"] })
    expect(call.body.metadata.audience).toBe("customer")
    expect(call.body.userId).toBe("user_123")
  })

  it("resolves a selected project grant preset", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/api-tokens", {
        method: "POST",
        body: JSON.stringify({ name: "staff agent", grantPreset: "agent-staff" }),
      }),
      auth,
      { accessCatalog: selectedCatalog },
    )

    expect(response?.status).toBe(201)
    const call = vi.mocked(auth.api.createApiKey).mock.calls[0]?.[0] as {
      body: { permissions: Record<string, string[]>; metadata: { audience: string } }
    }
    expect(call.body.permissions.bookings).toEqual(["read", "write"])
    expect(call.body.metadata.audience).toBe("staff")
  })

  it("returns 405 for facade paths with unsupported methods", async () => {
    const auth = createAuthMock()
    const response = await handleApiTokenManagementRequest(
      new Request("https://example.com/auth/api-tokens", { method: "PATCH" }),
      auth,
    )

    expect(response?.status).toBe(405)
    expect(response?.headers.get("Allow")).toBe("GET, POST")
    expect(await responseJson(response)).toEqual({ error: "Method not allowed" })
  })
})
