import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import { StorefrontInputError } from "../../src/storefront-origins.js"
import { createStorefrontAdminRoutes } from "../../src/storefront-routes.js"
import type {
  IssuedStorefrontApiKeyDto,
  StorefrontApiKeyDto,
  StorefrontChannelBindingProvider,
  StorefrontDto,
  StorefrontRuntimeProvider,
} from "../../src/storefront-runtime-port.js"

const STOREFRONT: StorefrontDto = {
  id: "storefront_1",
  organizationId: "org_actor",
  name: "Web",
  slug: "web",
  hostingKind: "external",
  siteId: null,
  allowedOrigins: ["https://shop.example"],
  methods: { emailCode: true, emailPassword: false, google: false, facebook: false, apple: false },
  accountPolicy: {
    allowedKinds: ["personal"],
    personalSignup: "open",
    businessOnboarding: "disabled",
  },
  hostOnlyCookies: true,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
}

const API_KEY: StorefrontApiKeyDto = {
  id: "key_1",
  storefrontId: "storefront_1",
  kind: "publishable",
  tokenPreview: "vpk_ab12",
  name: "Web",
  lastUsedAt: null,
  revokedAt: null,
  createdAt: "2026-07-15T00:00:00.000Z",
}

const ISSUED_KEY: IssuedStorefrontApiKeyDto = { ...API_KEY, token: "vpk-test-one-time-secret" }

const CHANNEL_BINDING = {
  storefrontId: STOREFRONT.id,
  channelId: "channels_1",
  channelName: "Retail",
  channelStatus: "active",
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
}

function runtime(): StorefrontRuntimeProvider {
  return {
    listStorefronts: vi.fn(async () => [STOREFRONT]),
    getStorefront: vi.fn(async () => STOREFRONT),
    createStorefront: vi.fn(async () => STOREFRONT),
    updateStorefront: vi.fn(async () => STOREFRONT),
    deleteStorefront: vi.fn(async () => undefined),
    setAllowedOrigins: vi.fn(async () => STOREFRONT),
    listApiKeys: vi.fn(async () => [API_KEY]),
    issueApiKey: vi.fn(async () => ISSUED_KEY),
    rotateApiKey: vi.fn(async () => ISSUED_KEY),
    revokeApiKey: vi.fn(async () => undefined),
    resolveStorefrontByApiKey: vi.fn(async () => null),
    updateAccountPolicy: vi.fn(async () => STOREFRONT),
    updateMethods: vi.fn(async () => {
      throw new StorefrontInputError("Enable at least one customer authentication method.")
    }),
    listProviderCredentials: vi.fn(async () => [
      { provider: "google", configured: true, updatedAt: "2026-07-15T00:00:00.000Z" },
      { provider: "facebook", configured: false, updatedAt: null },
      { provider: "apple", configured: false, updatedAt: null },
    ]),
    putProviderCredential: vi.fn(async () => undefined),
    deleteProviderCredential: vi.fn(async () => undefined),
    resolveProviderCredentials: vi.fn(async () => ({})),
  }
}

function channelBindingProvider(): StorefrontChannelBindingProvider {
  return {
    listStorefrontChannelBindings: vi.fn(async () => ({
      [STOREFRONT.id]: CHANNEL_BINDING,
    })),
    getStorefrontChannelBinding: vi.fn(async () => CHANNEL_BINDING),
    setStorefrontChannelBinding: vi.fn(async () => CHANNEL_BINDING),
    clearStorefrontChannelBinding: vi.fn(async () => undefined),
  }
}

function app(
  provider: StorefrontRuntimeProvider,
  options: {
    authenticated?: boolean
    organizationId?: string | null
    scopes?: string[]
    businessAccounts?: boolean
    channelBinding?: StorefrontChannelBindingProvider | null
  } = {},
) {
  const {
    authenticated = true,
    organizationId = "org_actor",
    scopes = ["storefronts:read", "storefronts:write"],
    businessAccounts = true,
    channelBinding = null,
  } = options
  const hono = new Hono<{
    Bindings: Record<string, unknown>
    Variables: {
      userId?: string
      organizationId?: string | null
      scopes?: string[] | null
      db: never
    }
  }>()
  hono.use("*", async (c, next) => {
    if (authenticated) c.set("userId", "user_actor")
    c.set("organizationId", organizationId)
    c.set("scopes", scopes)
    c.set("db", {} as never)
    await next()
  })
  hono.route(
    "/v1/admin/storefronts",
    createStorefrontAdminRoutes(provider, { businessAccounts, channelBinding }),
  )
  return hono
}

describe("storefront admin routes", () => {
  it("lists storefronts scoped to the session organization", async () => {
    const provider = runtime()
    const response = await app(provider).request("/v1/admin/storefronts/storefronts")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [expect.objectContaining({ id: "storefront_1" })],
    })
    expect(provider.listStorefronts).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_actor" }),
    )
  })

  it("requires an authenticated user before calling the port", async () => {
    const provider = runtime()
    const response = await app(provider, { authenticated: false }).request(
      "/v1/admin/storefronts/storefronts",
    )

    expect(response.status).toBe(401)
    expect(provider.listStorefronts).not.toHaveBeenCalled()
  })

  it("rejects requests without an active operator organization", async () => {
    const provider = runtime()
    const response = await app(provider, { organizationId: null }).request(
      "/v1/admin/storefronts/storefronts",
    )

    expect(response.status).toBe(403)
    expect(provider.listStorefronts).not.toHaveBeenCalled()
  })

  it("reveals an issued key token exactly once and never in the list", async () => {
    const provider = runtime()
    const issued = await app(provider).request(
      "/v1/admin/storefronts/storefronts/storefront_1/keys",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "publishable", name: "Web" }),
      },
    )
    const listed = await app(provider).request(
      "/v1/admin/storefronts/storefronts/storefront_1/keys",
    )

    expect(issued.status).toBe(201)
    expect(await issued.json()).toEqual({
      data: expect.objectContaining({ token: "vpk-test-one-time-secret" }),
    })
    expect(JSON.stringify(await listed.json())).not.toContain("one-time-secret")
  })

  it("forbids writes without the storefronts:write scope", async () => {
    const provider = runtime()
    const response = await app(provider, { scopes: ["storefronts:read"] }).request(
      "/v1/admin/storefronts/storefronts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Web",
          slug: "web",
          hostingKind: "external",
          allowedOrigins: [],
          methods: {
            emailCode: true,
            emailPassword: false,
            google: false,
            facebook: false,
            apple: false,
          },
        }),
      },
    )

    expect(response.status).toBe(403)
    expect(provider.createStorefront).not.toHaveBeenCalled()
  })

  it("reports the business-account capability and provider management scope", async () => {
    const readOnly = await app(runtime(), {
      scopes: ["storefronts:read"],
      businessAccounts: false,
    }).request("/v1/admin/storefronts/capabilities")

    expect(readOnly.status).toBe(200)
    expect(await readOnly.json()).toEqual({
      data: { businessAccounts: false, manageProviders: false, channelBinding: false },
    })
  })

  it("composes channel bindings onto storefront reads when configured", async () => {
    const binding = channelBindingProvider()
    const response = await app(runtime(), { channelBinding: binding }).request(
      "/v1/admin/storefronts/storefronts",
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [expect.objectContaining({ channelBinding: CHANNEL_BINDING })],
    })
    expect(binding.listStorefrontChannelBindings).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_actor" }),
      [STOREFRONT.id],
    )
  })

  it("sets the channel binding through the configured composition provider", async () => {
    const binding = channelBindingProvider()
    const response = await app(runtime(), { channelBinding: binding }).request(
      "/v1/admin/storefronts/storefronts/storefront_1/channel-binding",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: "channels_1" }),
      },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: CHANNEL_BINDING })
    expect(binding.setStorefrontChannelBinding).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_actor" }),
      "storefront_1",
      { channelId: "channels_1" },
    )
  })

  it("returns 501 for channel binding routes when composition is not configured", async () => {
    const response = await app(runtime()).request(
      "/v1/admin/storefronts/storefronts/storefront_1/channel-binding",
    )

    expect(response.status).toBe(501)
    expect(await response.json()).toEqual({
      error: "Storefront channel binding is not configured",
    })
  })

  it("serializes storefront input errors as 400", async () => {
    const response = await app(runtime()).request(
      "/v1/admin/storefronts/storefronts/storefront_1/methods",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailCode: false,
          emailPassword: false,
          google: false,
          facebook: false,
          apple: false,
        }),
      },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "Enable at least one customer authentication method.",
    })
  })

  it("passes only the credential bundle to the port and never returns it", async () => {
    const provider = runtime()
    const response = await app(provider).request(
      "/v1/admin/storefronts/storefronts/storefront_1/provider-credentials/google",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "id", clientSecret: "secret" }),
      },
    )

    expect(response.status).toBe(204)
    expect(provider.putProviderCredential).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_actor" }),
      "storefront_1",
      "google",
      { clientId: "id", clientSecret: "secret" },
    )
  })
})
