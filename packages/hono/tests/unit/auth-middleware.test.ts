import { signSessionClaims } from "@voyant-travel/utils/session-claims"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import { sha256Base64Url } from "../../src/auth/crypto.js"
import { requireCustomerBuyerContext } from "../../src/auth/require-customer-buyer.js"
import { requireAuth } from "../../src/middleware/auth.js"
import { handleApiError } from "../../src/middleware/error-boundary.js"
import type { VoyantBindings } from "../../src/types.js"

const TEST_ENV: VoyantBindings = { DATABASE_URL: "postgres://test" }

describe("requireAuth API keys", () => {
  it.each([
    ["/v1/admin/profile", "SESSION_CLAIMS_ADMIN_SECRET", "staff"],
    ["/v1/public/account", "SESSION_CLAIMS_CUSTOMER_SECRET", "customer"],
  ] as const)("binds session claims on %s to its realm", async (path, secretName, actor) => {
    const secret = `${actor}-session-claims-secret-with-32-characters`
    const token = await signSessionClaims("user_123", "session_123", secret)
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never),
    )
    app.get(path, (c) =>
      c.json({
        actor: c.get("actor"),
        audience: c.get("audience"),
        realm: c.get("realm"),
        userId: c.get("userId"),
      }),
    )

    const response = await app.fetch(
      new Request(`http://example.com${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { ...TEST_ENV, [secretName]: secret },
      mockExecutionCtx(),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      actor,
      audience: actor,
      realm: actor === "staff" ? "admin" : "customer",
      userId: "user_123",
    })
  })

  it.each([
    ["customer", "/v1/admin/profile"],
    ["admin", "/v1/public/account"],
  ] as const)("does not accept a %s session on the other realm", async (tokenRealm, path) => {
    const adminSecret = "admin-session-claims-secret-with-32-characters"
    const customerSecret = "customer-session-claims-secret-with-32-characters"
    const token = await signSessionClaims(
      "user_123",
      "session_123",
      tokenRealm === "admin" ? adminSecret : customerSecret,
    )
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never),
    )
    app.get(path, (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request(`http://example.com${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      {
        ...TEST_ENV,
        SESSION_CLAIMS_ADMIN_SECRET: adminSecret,
        SESSION_CLAIMS_CUSTOMER_SECRET: customerSecret,
      },
      mockExecutionCtx(),
    )

    expect(response.status).toBe(401)
  })

  it("rejects bearer sessions when both realms share the same signing root", async () => {
    const sharedSecret = "shared-session-claims-secret-with-32-characters"
    const token = await signSessionClaims("user_123", "session_123", sharedSecret)
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never),
    )
    app.get("/v1/admin/profile", (c) => c.json({ ok: true }))
    app.get("/v1/public/profile", (c) => c.json({ ok: true }))

    for (const path of ["/v1/admin/profile", "/v1/public/profile"]) {
      const response = await app.fetch(
        new Request(`http://example.com${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        {
          ...TEST_ENV,
          SESSION_CLAIMS_ADMIN_SECRET: sharedSecret,
          SESSION_CLAIMS_CUSTOMER_SECRET: sharedSecret,
        },
        mockExecutionCtx(),
      )
      expect(response.status).toBe(401)
    }
  })

  it("rejects bearer sessions signed with a short realm root", async () => {
    const shortSecret = "too-short"
    const token = await signSessionClaims("user_123", "session_123", shortSecret)
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never),
    )
    app.get("/v1/admin/profile", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/v1/admin/profile", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { ...TEST_ENV, SESSION_CLAIMS_ADMIN_SECRET: shortSecret },
      mockExecutionCtx(),
    )

    expect(response.status).toBe(401)
  })

  it("skips session-claims auth on ambiguous routes", async () => {
    const secret = "admin-session-claims-secret-with-32-characters"
    const token = await signSessionClaims("user_123", "session_123", secret)
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never),
    )
    app.get("/secure", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/secure", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { ...TEST_ENV, SESSION_CLAIMS_ADMIN_SECRET: secret },
      mockExecutionCtx(),
    )

    expect(response.status).toBe(401)
  })

  it("matches public paths under a configured deployment base path", async () => {
    const dbFactory = vi.fn(() => ({}) as never)
    const app = new Hono()
    app.use(
      "*",
      requireAuth(dbFactory, {
        basePath: "/api",
        publicPaths: ["/v1/public/media"],
      }),
    )
    app.get("/api/v1/public/media/:key", (c) =>
      c.json({ actor: c.get("actor") ?? null, guest: c.get("isAnonymousRequest") }),
    )

    const response = await app.fetch(
      new Request("http://example.com/api/v1/public/media/product.jpg"),
      TEST_ENV,
      mockExecutionCtx(),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ actor: null, guest: true })
    expect(dbFactory).not.toHaveBeenCalled()
  })

  it("continues an optional customer-auth path as an explicit guest without a session", async () => {
    const resolve = vi.fn(() => null)
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never, {
        publicPaths: ["/v1/public/bookings"],
        optionalCustomerAuthPaths: ["/v1/public/bookings"],
        auth: { resolve },
      }),
    )
    app.post("/v1/public/bookings/overview", (c) =>
      c.json({
        actor: c.get("actor") ?? null,
        realm: c.get("realm") ?? null,
        userId: c.get("userId") ?? null,
        guest: c.get("isAnonymousRequest"),
      }),
    )

    const response = await app.request("/v1/public/bookings/overview", { method: "POST" }, TEST_ENV)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ actor: null, realm: null, userId: null, guest: true })
    expect(resolve).toHaveBeenCalledOnce()
  })

  it("resolves a valid customer session on an optional customer-auth path", async () => {
    const resolve = vi.fn(() => ({
      userId: "customer_123",
      sessionId: "session_123",
      actor: "customer" as const,
      realm: "customer" as const,
    }))
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never, {
        publicPaths: ["/v1/public/bookings"],
        optionalCustomerAuthPaths: ["/v1/public/bookings"],
        auth: { resolve },
      }),
    )
    app.post("/v1/public/bookings/overview", (c) =>
      c.json({
        actor: c.get("actor"),
        realm: c.get("realm"),
        userId: c.get("userId"),
        guest: c.get("isAnonymousRequest") ?? false,
      }),
    )

    const response = await app.request("/v1/public/bookings/overview", { method: "POST" }, TEST_ENV)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      actor: "customer",
      realm: "customer",
      userId: "customer_123",
      guest: false,
    })
  })

  it("requires a selected buyer for a customer session-claims bearer on mixed checkout", async () => {
    const secret = "customer-session-claims-secret-with-32-characters"
    const token = await signSessionClaims("customer_123", "session_123", secret)
    const app = new Hono().onError(handleApiError)
    app.use(
      "*",
      requireAuth(() => ({}) as never, {
        publicPaths: ["/v1/public/bookings"],
        optionalCustomerAuthPaths: ["/v1/public/bookings"],
      }),
    )
    app.post("/v1/public/bookings/overview", (c) => {
      requireCustomerBuyerContext(c)
      return c.json({ ok: true })
    })

    const response = await app.fetch(
      new Request("http://example.com/v1/public/bookings/overview", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
      { ...TEST_ENV, SESSION_CLAIMS_CUSTOMER_SECRET: secret },
      mockExecutionCtx(),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        code: "forbidden",
        error: "A customer buyer account must be selected",
      }),
    )
  })

  it("authenticates comma-separated internal API keys with scoped staff context", async () => {
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never),
    )
    app.get("/secure", (c) =>
      c.json({
        callerType: c.get("callerType"),
        actor: c.get("actor"),
        audience: c.get("audience"),
        scopes: c.get("scopes"),
        isInternalRequest: c.get("isInternalRequest"),
      }),
    )

    const response = await app.fetch(
      new Request("http://example.com/secure", {
        headers: { Authorization: "Bearer new-key" },
      }),
      {
        ...TEST_ENV,
        INTERNAL_API_KEY: "old-key, new-key",
        INTERNAL_API_KEY_SCOPES: "products:read,bookings:write",
      },
      mockExecutionCtx(),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      callerType: "internal",
      actor: "staff",
      audience: "staff",
      scopes: ["products:read", "bookings:write"],
      isInternalRequest: true,
    })
  })

  it("accepts Max acting-user attribution only with the trusted internal key", async () => {
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => makeCloudActorDb("local_auth_user_123")),
    )
    app.get("/secure", (c) =>
      c.json({
        callerType: c.get("callerType"),
        userId: c.get("userId"),
        principalSubtype: c.get("principalSubtype"),
      }),
    )

    const response = await app.fetch(
      new Request("http://example.com/secure", {
        headers: {
          Authorization: "Bearer managed-max-key",
          "x-voyant-acting-user-id": "user_01KQ9J3M7KE6FNHQPYJJ7VYBF1",
        },
      }),
      {
        ...TEST_ENV,
        INTERNAL_API_KEY: "managed-max-key",
        VOYANT_CLOUD_DEPLOYMENT_ID: "deployment_current",
      },
      mockExecutionCtx(),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      callerType: "internal",
      userId: "local_auth_user_123",
      principalSubtype: "max",
    })
  })

  it("rejects a trusted acting-user assertion with no active local mirror link", async () => {
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => makeCloudActorDb(null)),
    )
    app.get("/secure", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/secure", {
        headers: {
          Authorization: "Bearer managed-max-key",
          "x-voyant-acting-user-id": "user_unknown",
        },
      }),
      {
        ...TEST_ENV,
        INTERNAL_API_KEY: "managed-max-key",
        VOYANT_CLOUD_DEPLOYMENT_ID: "deployment_current",
      },
      mockExecutionCtx(),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Invalid acting user" })
  })

  it.each([
    "",
    "user!invalid",
    `user_${"x".repeat(200)}`,
  ])("rejects a malformed trusted acting-user assertion (%j)", async (assertion) => {
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => makeCloudActorDb("local_auth_user_123")),
    )
    app.get("/secure", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/secure", {
        headers: {
          Authorization: "Bearer managed-max-key",
          "x-voyant-acting-user-id": assertion,
        },
      }),
      {
        ...TEST_ENV,
        INTERNAL_API_KEY: "managed-max-key",
        VOYANT_CLOUD_DEPLOYMENT_ID: "deployment_current",
      },
      mockExecutionCtx(),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Invalid acting user" })
  })

  it("rejects acting-user attribution when the active deployment is unavailable", async () => {
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => makeCloudActorDb("local_auth_user_123")),
    )
    app.get("/secure", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/secure", {
        headers: {
          Authorization: "Bearer managed-max-key",
          "x-voyant-acting-user-id": "user_01KQ9J3M7KE6FNHQPYJJ7VYBF1",
        },
      }),
      { ...TEST_ENV, INTERNAL_API_KEY: "managed-max-key" },
      mockExecutionCtx(),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Invalid acting user" })
  })

  it("ignores acting-user attribution on an ordinary API key", async () => {
    const token = "voy_test_api_key"
    const row = makeApiKeyRow({
      key: await sha256Base64Url(token),
      referenceId: "organization_123",
    })
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => makeApiKeyDb(row)),
    )
    app.get("/secure", (c) =>
      c.json({
        callerType: c.get("callerType"),
        userId: c.get("userId") ?? null,
        principalSubtype: c.get("principalSubtype") ?? null,
      }),
    )

    const response = await app.fetch(
      new Request("http://example.com/secure", {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-voyant-acting-user-id": "user_spoofed",
        },
      }),
      TEST_ENV,
      mockExecutionCtx(),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      callerType: "api_key",
      userId: null,
      principalSubtype: null,
    })
  })

  it("defaults a custom resolver audience to its authenticated actor", async () => {
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never, {
        auth: {
          resolve: () => ({ userId: "user_123", actor: "partner", realm: "customer" }),
        },
      }),
    )
    app.get("/v1/public/secure", (c) =>
      c.json({
        userId: c.get("userId"),
        actor: c.get("actor"),
        audience: c.get("audience"),
      }),
    )

    const response = await app.fetch(
      new Request("http://example.com/v1/public/secure"),
      TEST_ENV,
      mockExecutionCtx(),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      userId: "user_123",
      actor: "partner",
      audience: "partner",
    })
  })

  it("rejects a custom resolver identity that omits its realm", async () => {
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never, {
        // Simulate an untyped JavaScript adapter bypassing the TypeScript contract.
        auth: { resolve: () => ({ userId: "user_123", actor: "staff" }) as never },
      }),
    )
    app.get("/v1/admin/profile", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/v1/admin/profile"),
      TEST_ENV,
      mockExecutionCtx(),
    )

    expect(response.status).toBe(401)
  })

  it.each([
    ["/v1/admin/profile", { userId: "user_123", actor: "customer", realm: "customer" }],
    ["/v1/public/profile", { userId: "user_123", actor: "staff", realm: "admin" }],
  ] as const)("rejects a custom resolver identity from the wrong realm on %s", async (path, auth) => {
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never, {
        auth: { resolve: () => auth },
      }),
    )
    app.get(path, (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request(`http://example.com${path}`),
      TEST_ENV,
      mockExecutionCtx(),
    )

    expect(response.status).toBe(401)
  })

  it("lets app auth integrations reject an otherwise valid API key", async () => {
    const token = "voy_test_api_key"
    const row = makeApiKeyRow({
      key: await sha256Base64Url(token),
      referenceId: "user_123",
    })
    const validateApiKey = vi.fn().mockResolvedValue(false)

    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => makeApiKeyDb(row), {
        auth: {
          validateApiKey,
        },
      }),
    )
    app.get("/secure", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/secure", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      TEST_ENV,
      mockExecutionCtx(),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Invalid API key" })
    expect(validateApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: expect.objectContaining({
          id: "key_123",
          referenceId: "user_123",
        }),
      }),
    )
  })

  it("continues API key auth when the app validator accepts the key", async () => {
    const token = "voy_test_api_key"
    const row = makeApiKeyRow({
      key: await sha256Base64Url(token),
      referenceId: "user_123",
    })

    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => makeApiKeyDb(row), {
        auth: {
          validateApiKey: vi.fn().mockResolvedValue(true),
        },
      }),
    )
    app.get("/secure", (c) =>
      c.json({
        callerType: c.get("callerType"),
        apiKeyId: c.get("apiKeyId"),
      }),
    )

    const response = await app.fetch(
      new Request("http://example.com/secure", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      TEST_ENV,
      mockExecutionCtx(),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      callerType: "api_key",
      apiKeyId: "key_123",
    })
  })

  it("lets app auth integrations customize the final unauthenticated response", async () => {
    const onUnauthorized = vi.fn(
      () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://login.example.test/start" },
        }),
    )
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => ({}) as never, {
        auth: { onUnauthorized },
      }),
    )
    app.get("/secure", (c) => c.json({ ok: true }))

    const response = await app.fetch(
      new Request("http://example.com/secure", {
        headers: { Accept: "text/html" },
      }),
      TEST_ENV,
      mockExecutionCtx(),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("https://login.example.test/start")
    expect(onUnauthorized).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.any(Request),
        env: TEST_ENV,
      }),
    )
  })
})

function makeApiKeyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "key_123",
    configId: "default",
    name: "Automation",
    start: "voy_ab",
    prefix: "voy_",
    key: "hash",
    referenceId: "user_123",
    refillInterval: null,
    refillAmount: null,
    lastRefillAt: null,
    enabled: true,
    rateLimitEnabled: false,
    rateLimitTimeWindow: null,
    rateLimitMax: null,
    requestCount: 0,
    remaining: null,
    lastRequest: null,
    createdAt: new Date("2026-05-16T00:00:00.000Z"),
    updatedAt: new Date("2026-05-16T00:00:00.000Z"),
    expiresAt: null,
    permissions: JSON.stringify({ "*": ["*"] }),
    metadata: null,
    ...overrides,
  }
}

function makeApiKeyDb(row: Record<string, unknown>) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [row],
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: async () => {},
      }),
    }),
  } as never
}

/**
 * voyant#4625 §4 — a storefront SECRET key authenticates `/v1/admin/*`,
 * replacing the deployment admin key, and the deployment key it replaces is
 * deprecated behind a switch rather than deleted (self-host consumes this from
 * npm and cannot be migrated on its behalf).
 */
describe("requireAuth storefront secret keys on the admin surface", () => {
  const SECRET = "vsk_admin_secret_key"
  const publicApiKeyRow = (scopes: Record<string, string[]> | null) => ({
    id: "sfk_1",
    kind: "secret",
    scopes,
    tokenHash: "hash",
    tokenPreview: "vsk_abc123",
    name: null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  function adminApp(row: Record<string, unknown> | null) {
    const app = new Hono()
    app.use(
      "*",
      requireAuth(
        () =>
          ({
            select: () => ({
              from: () => ({ where: () => ({ limit: async () => (row ? [row] : []) }) }),
            }),
            update: () => ({ set: () => ({ where: async () => {} }) }),
          }) as never,
      ),
    )
    app.get("/v1/admin/bookings", (c) =>
      c.json({
        actor: c.get("actor"),
        realm: c.get("realm"),
        callerType: c.get("callerType"),
        publicApiKeyKind: c.get("publicApiKeyKind") ?? null,
        scopes: c.get("scopes") ?? null,
      }),
    )
    app.get("/v1/public/catalog", (c) => c.json({ actor: c.get("actor") ?? null }))
    return app
  }

  const request = (path: string, headers: Record<string, string>) =>
    new Request(`http://example.com${path}`, { headers })

  it("admits a secret key as staff on the admin realm, carrying its scopes", async () => {
    const app = adminApp(publicApiKeyRow({ bookings: ["read"] }))
    const response = await app.fetch(
      request("/v1/admin/bookings", { "x-api-key": SECRET }),
      TEST_ENV,
      mockExecutionCtx(),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      actor: "staff",
      realm: "admin",
      callerType: "api_key",
      publicApiKeyKind: "secret",
      scopes: ["bookings:read"],
    })
  })

  it("accepts the same key as a bearer token", async () => {
    const app = adminApp(publicApiKeyRow({ bookings: ["read"] }))
    const response = await app.fetch(
      request("/v1/admin/bookings", { authorization: `Bearer ${SECRET}` }),
      TEST_ENV,
      mockExecutionCtx(),
    )
    expect(response.status).toBe(200)
  })

  it("gives a pre-scopes key the commerce default, never the unrestricted grant", async () => {
    const app = adminApp(publicApiKeyRow(null))
    const response = await app.fetch(
      request("/v1/admin/bookings", { "x-api-key": SECRET }),
      TEST_ENV,
      mockExecutionCtx(),
    )
    const body = (await response.json()) as { scopes: string[] }
    expect(body.scopes).toContain("bookings:read")
    expect(body.scopes).not.toContain("*")
  })

  it("401s a secret key that resolves to no row", async () => {
    const app = adminApp(null)
    const response = await app.fetch(
      request("/v1/admin/bookings", { "x-api-key": SECRET }),
      TEST_ENV,
      mockExecutionCtx(),
    )
    expect(response.status).toBe(401)
  })

  it("never admits a PUBLISHABLE key on the admin surface", async () => {
    const app = adminApp(publicApiKeyRow({ bookings: ["read"] }))
    const response = await app.fetch(
      request("/v1/admin/bookings", { "x-api-key": "vpk_browser_key" }),
      TEST_ENV,
      mockExecutionCtx(),
    )
    expect(response.status).toBe(401)
  })

  it("leaves the public surface to the customer-auth resolver", async () => {
    // Admitting a secret key here too would skip the resolution that derives
    // the storefront channel, handing the request a public context with no
    // storefront behind it.
    const app = adminApp(publicApiKeyRow({ bookings: ["read"] }))
    const response = await app.fetch(
      request("/v1/public/catalog", { "x-api-key": SECRET }),
      TEST_ENV,
      mockExecutionCtx(),
    )
    expect(response.status).toBe(401)
  })
})

describe("requireAuth deployment API key deprecation", () => {
  const token = "voy_deployment_key"

  async function call(env: VoyantBindings, path: string) {
    const row = makeApiKeyRow({ key: await sha256Base64Url(token), referenceId: "org_1" })
    const app = new Hono()
    app.use(
      "*",
      requireAuth(() => makeApiKeyDb(row)),
    )
    app.get(path, (c) => c.json({ ok: true }))
    return app.fetch(
      new Request(`http://example.com${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
      mockExecutionCtx(),
    )
  }

  it("keeps working by default — the compatibility window is open", async () => {
    expect((await call(TEST_ENV, "/v1/admin/bookings")).status).toBe(200)
  })

  it("stops authenticating the admin surface once the deployment closes the window", async () => {
    const response = await call(
      { ...TEST_ENV, VOYANT_DEPLOYMENT_API_KEY_MODE: "disabled" },
      "/v1/admin/bookings",
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: "deployment_api_key_disabled" })
  })

  it("closing the window does not touch non-admin surfaces", async () => {
    const response = await call(
      { ...TEST_ENV, VOYANT_DEPLOYMENT_API_KEY_MODE: "disabled" },
      "/v1/some-legacy-route",
    )
    expect(response.status).toBe(200)
  })
})

function makeCloudActorDb(userId: string | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (userId ? [{ userId }] : []),
        }),
      }),
    }),
  } as never
}

function mockExecutionCtx(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
  }
}
