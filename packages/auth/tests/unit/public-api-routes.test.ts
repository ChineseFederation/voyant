import { handleApiError } from "@voyant-travel/hono"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import { PublicApiInputError } from "../../src/public-api-origins.js"
import {
  createCustomerAccountsAdminRoutes,
  createPublicApiAdminRoutes,
} from "../../src/public-api-routes.js"
import type {
  CustomerAccountSettingsDto,
  IssuedPublicApiKeyDto,
  PublicApiChannelProvider,
  PublicApiKeyDto,
  PublicApiRuntimeProvider,
  ResolvedPublicApiChannel,
} from "../../src/public-api-runtime-port.js"

const KEY: PublicApiKeyDto = {
  id: "pak_1",
  kind: "publishable",
  // Publishable keys carry no scope grant — they are bounded by the capability
  // line, not by scopes (voyant#4625).
  scopes: null,
  tokenPreview: "vpk_ab12",
  name: "Web",
  allowedOrigins: ["https://shop.example"],
  channelId: null,
  hostOnlyCookies: true,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
}

const ISSUED: IssuedPublicApiKeyDto = { ...KEY, token: "vpk_plaintext" }

const SETTINGS: CustomerAccountSettingsDto = {
  methods: { emailCode: true, emailPassword: false, google: false, facebook: false, apple: false },
  accountPolicy: {
    allowedKinds: ["personal"],
    personalSignup: "open",
    businessOnboarding: "disabled",
  },
  updatedAt: "2026-07-15T00:00:00.000Z",
}

const DIRECT: ResolvedPublicApiChannel = {
  channelId: "chan_direct",
  channelName: "Direct",
  channelStatus: "active",
  implicit: true,
}

function runtime(overrides: Partial<PublicApiRuntimeProvider> = {}): PublicApiRuntimeProvider {
  return {
    listApiKeys: vi.fn(async () => [KEY]),
    getApiKey: vi.fn(async () => KEY),
    issueApiKey: vi.fn(async () => ISSUED),
    updateApiKey: vi.fn(async () => KEY),
    rotateApiKey: vi.fn(async () => ISSUED),
    revokeApiKey: vi.fn(async () => undefined),
    resolveApiKeyByToken: vi.fn(async () => KEY),
    resolveApiKeysByOrigin: vi.fn(async () => [KEY]),
    getCustomerAccountSettings: vi.fn(async () => SETTINGS),
    updateCustomerAccountSettings: vi.fn(async () => SETTINGS),
    listProviderCredentials: vi.fn(async () => [
      { provider: "google" as const, configured: false, updatedAt: null },
    ]),
    putProviderCredential: vi.fn(async () => undefined),
    deleteProviderCredential: vi.fn(async () => undefined),
    resolveProviderCredentials: vi.fn(async () => ({})),
    ...overrides,
  }
}

const channels: PublicApiChannelProvider = {
  resolveChannelForKey: vi.fn(async () => DIRECT),
  resolveChannelsForKeys: vi.fn(async (_context, ids) => new Map(ids.map((id) => [id, DIRECT]))),
}

/** Mount with a staff identity and an explicit scope set. */
function mount(
  routes: ReturnType<typeof createPublicApiAdminRoutes>,
  options: { userId?: string; scopes?: string[] } = {},
) {
  const app = new Hono()
  app.use("*", async (c, next) => {
    if (options.userId !== undefined) c.set("userId", options.userId)
    c.set("scopes", options.scopes ?? [])
    c.set("db", {} as never)
    await next()
  })
  app.route("/", routes as never)
  // The validation hook THROWS by design and the app-level handler is what
  // turns that into a 400. Mounting it here keeps the harness faithful to the
  // node runtime; without it a rejected body surfaces as a 500 that only the
  // test harness would ever produce.
  app.onError((error, c) => handleApiError(error, c, {}))
  return app
}

const STAFF = { userId: "usr_1", scopes: ["public-api-keys:read", "public-api-keys:write"] }
const STAFF_FULL = {
  userId: "usr_1",
  scopes: ["public-api-keys:read", "public-api-keys:write", "public-api-keys:delete"],
}

describe("public API admin routes", () => {
  it("lists keys with their resolved channel projected", async () => {
    const app = mount(createPublicApiAdminRoutes(runtime(), { channels }), STAFF)

    const response = await app.request("/keys")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [{ ...KEY, channel: DIRECT }],
    })
  })

  it("resolves the channel for the whole list in one batch", async () => {
    const provider = runtime({
      listApiKeys: vi.fn(async () => [KEY, { ...KEY, id: "pak_2" }, { ...KEY, id: "pak_3" }]),
    })
    const batched = {
      resolveChannelForKey: vi.fn(async () => DIRECT),
      resolveChannelsForKeys: vi.fn(
        async (_c: unknown, ids: readonly (string | null)[]) =>
          new Map(ids.map((id) => [id, DIRECT])),
      ),
    } as unknown as PublicApiChannelProvider

    await mount(createPublicApiAdminRoutes(provider, { channels: batched }), STAFF).request("/keys")

    // Three keys must not cost three channel lookups.
    expect(batched.resolveChannelsForKeys).toHaveBeenCalledTimes(1)
    expect(batched.resolveChannelForKey).not.toHaveBeenCalled()
  })

  it("returns keys unprojected when no channel provider is composed", async () => {
    const app = mount(createPublicApiAdminRoutes(runtime()), STAFF)

    expect(await (await app.request("/keys")).json()).toEqual({ data: [KEY] })
  })

  it("rejects an unauthenticated caller before touching the runtime", async () => {
    const provider = runtime()
    const app = mount(createPublicApiAdminRoutes(provider, { channels }), { scopes: [] })

    expect((await app.request("/keys")).status).toBe(401)
    expect(provider.listApiKeys).not.toHaveBeenCalled()
  })

  it("issues a key and returns its plaintext token exactly once", async () => {
    const app = mount(createPublicApiAdminRoutes(runtime(), { channels }), STAFF)

    const response = await app.request("/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "publishable", allowedOrigins: ["https://shop.example"] }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: ISSUED })
  })

  it("refuses to issue without the write scope", async () => {
    const provider = runtime()
    const app = mount(createPublicApiAdminRoutes(provider, { channels }), {
      userId: "usr_1",
      scopes: ["public-api-keys:read"],
    })

    const response = await app.request("/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "publishable", allowedOrigins: ["https://shop.example"] }),
    })

    expect(response.status).toBe(403)
    expect(provider.issueApiKey).not.toHaveBeenCalled()
  })

  it("requires the delete scope to revoke, not merely write", async () => {
    const provider = runtime()
    // Revoking takes a live frontend off the air; renaming a key does not. An
    // operator trusted to do the second is not automatically trusted with the
    // first, so `write` must not carry it.
    const writeOnly = mount(createPublicApiAdminRoutes(provider, { channels }), STAFF)

    expect((await writeOnly.request("/keys/pak_1", { method: "DELETE" })).status).toBe(403)
    expect(provider.revokeApiKey).not.toHaveBeenCalled()

    const withDelete = mount(createPublicApiAdminRoutes(provider, { channels }), STAFF_FULL)

    expect((await withDelete.request("/keys/pak_1", { method: "DELETE" })).status).toBe(204)
    expect(provider.revokeApiKey).toHaveBeenCalledWith(expect.anything(), "pak_1")
  })

  it("translates an input error into a 400 rather than a 500", async () => {
    const provider = runtime({
      issueApiKey: vi.fn(async () => {
        throw new PublicApiInputError("A publishable key requires at least one allowed origin.")
      }),
    })
    const app = mount(createPublicApiAdminRoutes(provider, { channels }), STAFF)

    const response = await app.request("/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "publishable" }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: "A publishable key requires at least one allowed origin.",
    })
  })

  it("rejects an unknown field on a write, because requests are closed", async () => {
    const app = mount(createPublicApiAdminRoutes(runtime(), { channels }), STAFF)

    const response = await app.request("/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "publishable", allowedOrigins: ["https://x.example"], nope: 1 }),
    })

    expect(response.status).toBe(400)
  })
})

describe("customer accounts admin routes", () => {
  const CA_STAFF = {
    userId: "usr_1",
    scopes: ["customer-accounts:read", "customer-accounts:write"],
  }

  it("reports the business-account capability from the composed runtime", async () => {
    const app = mount(
      createCustomerAccountsAdminRoutes(runtime(), { businessAccounts: true }) as never,
      CA_STAFF,
    )

    expect(await (await app.request("/capabilities")).json()).toEqual({
      data: { businessAccounts: true },
    })
  })

  it("returns the deployment settings", async () => {
    const app = mount(
      createCustomerAccountsAdminRoutes(runtime(), { businessAccounts: false }) as never,
      CA_STAFF,
    )

    expect(await (await app.request("/settings")).json()).toEqual({ data: SETTINGS })
  })

  it("updates methods and account policy independently", async () => {
    const provider = runtime()
    const app = mount(
      createCustomerAccountsAdminRoutes(provider, { businessAccounts: false }) as never,
      CA_STAFF,
    )

    await app.request("/settings/methods", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ methods: SETTINGS.methods }),
    })
    expect(provider.updateCustomerAccountSettings).toHaveBeenCalledWith(expect.anything(), {
      methods: SETTINGS.methods,
    })

    await app.request("/settings/account-policy", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountPolicy: SETTINGS.accountPolicy }),
    })
    expect(provider.updateCustomerAccountSettings).toHaveBeenCalledWith(expect.anything(), {
      accountPolicy: SETTINGS.accountPolicy,
    })
  })

  it("does not accept a public-api scope for a customer-accounts write", async () => {
    const provider = runtime()
    // The split exists so the two are separately grantable; a key-management
    // grant must not carry authority over how customers sign in.
    const app = mount(
      createCustomerAccountsAdminRoutes(provider, { businessAccounts: false }) as never,
      { userId: "usr_1", scopes: ["public-api-keys:write"] },
    )

    const response = await app.request("/settings/methods", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ methods: SETTINGS.methods }),
    })

    expect(response.status).toBe(403)
    expect(provider.updateCustomerAccountSettings).not.toHaveBeenCalled()
  })

  it("never returns a provider secret, only its status", async () => {
    const app = mount(
      createCustomerAccountsAdminRoutes(runtime(), { businessAccounts: false }) as never,
      CA_STAFF,
    )

    const body = await (await app.request("/provider-credentials")).json()

    expect(body).toEqual({ data: [{ provider: "google", configured: false, updatedAt: null }] })
    expect(JSON.stringify(body)).not.toContain("Secret")
  })
})
