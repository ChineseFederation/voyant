import { describe, expect, it } from "vitest"

import {
  createLocalStorefrontCorsOriginResolver,
  createLocalStorefrontCustomerAuthResolver,
  resolveStorefrontRequestOrigin,
  STOREFRONT_KEY_HEADER,
  STOREFRONT_ORIGIN_HEADER,
  StorefrontCustomerAuthResolutionError,
} from "../../src/storefront-customer-auth-resolver.js"
import { isStorefrontOriginAllowed } from "../../src/storefront-origins.js"
import type {
  ResolvedStorefrontApiKey,
  ResolvedStorefrontProviderCredentials,
  StorefrontChannelBindingDto,
  StorefrontDto,
  StorefrontRuntimeProvider,
} from "../../src/storefront-runtime-port.js"

const STOREFRONT: StorefrontDto = {
  id: "sf_1",
  name: "Shop",
  slug: "shop",
  hostingKind: "external",
  siteId: null,
  allowedOrigins: ["https://shop.example.com", "https://*.example.com"],
  methods: { emailCode: true, emailPassword: false, google: true, facebook: false, apple: false },
  accountPolicy: {
    allowedKinds: ["personal"],
    personalSignup: "open",
    businessOnboarding: "disabled",
  },
  hostOnlyCookies: true,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
}

const ACTIVE_BINDING: StorefrontChannelBindingDto = {
  storefrontId: "sf_1",
  channelId: "chan_web",
  channelName: "Web",
  channelStatus: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}

function fakeProvider(overrides?: {
  resolveStorefrontByApiKey?: () => Promise<ResolvedStorefrontApiKey | null>
  resolveProviderCredentials?: () => Promise<ResolvedStorefrontProviderCredentials>
  resolveStorefrontByOrigin?: (origin: string) => Promise<StorefrontDto | null>
}): StorefrontRuntimeProvider {
  const provider: Partial<StorefrontRuntimeProvider> = {
    async resolveStorefrontByApiKey() {
      return (
        overrides?.resolveStorefrontByApiKey?.() ??
        Promise.resolve({
          storefront: STOREFRONT,
          key: {
            id: "sfk_1",
            storefrontId: "sf_1",
            kind: "publishable",
            tokenPreview: "vpk_ab12cd",
            name: null,
            lastUsedAt: null,
            revokedAt: null,
            createdAt: "2026-07-19T00:00:00.000Z",
          },
        })
      )
    },
    async resolveStorefrontByOrigin(_context: unknown, origin: string) {
      if (overrides?.resolveStorefrontByOrigin) return overrides.resolveStorefrontByOrigin(origin)
      return isStorefrontOriginAllowed(origin, STOREFRONT.allowedOrigins) ? STOREFRONT : null
    },
    async resolveProviderCredentials() {
      return (
        overrides?.resolveProviderCredentials?.() ??
        Promise.resolve({ google: { clientId: "g-id", clientSecret: "g-secret" } })
      )
    },
    // Unused by the resolver; present to satisfy the provider contract.
  }
  return provider as StorefrontRuntimeProvider
}

function makeResolver(
  provider: StorefrontRuntimeProvider,
  resolveStorefrontChannelBinding?: (
    context: unknown,
    storefrontId: string,
  ) => Promise<StorefrontChannelBindingDto | null>,
) {
  let disposed = 0
  const resolver = createLocalStorefrontCustomerAuthResolver<{ KMS_PROVIDER?: string }>({
    provider,
    resolveStorefrontChannelBinding:
      resolveStorefrontChannelBinding ?? (async () => ACTIVE_BINDING),
    async openResolveContext() {
      return {
        context: { bindings: {}, db: {} as never },
        dispose: async () => {
          disposed += 1
        },
      }
    },
  })
  return { resolver, disposed: () => disposed }
}

function request(headers: Record<string, string>): Request {
  return new Request("https://api.example.com/api/v1/public", { headers })
}

describe("createLocalStorefrontCustomerAuthResolver", () => {
  it("resolves methods, trusted origins, policy, and decrypted social secrets", async () => {
    const { resolver, disposed } = makeResolver(fakeProvider())
    const context = await resolver(
      {},
      request({
        [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com",
        [STOREFRONT_KEY_HEADER]: "vpk_token",
      }),
    )
    expect(context).toEqual({
      baseURL: "https://shop.example.com",
      publicApiBaseURL: "https://shop.example.com/api",
      invitationAcceptBaseURL: "https://shop.example.com",
      trustedOrigins: ["https://shop.example.com"],
      allowedOrigins: ["https://shop.example.com", "https://*.example.com"],
      methods: {
        emailCode: true,
        emailPassword: false,
        socialProviders: { google: { clientId: "g-id", clientSecret: "g-secret" } },
      },
      accountPolicy: STOREFRONT.accountPolicy,
      storefrontChannel: {
        storefrontId: "sf_1",
        channelId: "chan_web",
        channelStatus: "active",
      },
    })
    expect(disposed()).toBe(1)
  })

  it("carries provider-composed storefront channel context", async () => {
    const resolveStorefrontChannelBinding = async () => ACTIVE_BINDING
    const { resolver } = makeResolver(fakeProvider(), resolveStorefrontChannelBinding)

    const context = await resolver(
      {},
      request({
        [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com",
        [STOREFRONT_KEY_HEADER]: "vpk_token",
      }),
    )

    expect(context.storefrontChannel).toEqual({
      storefrontId: "sf_1",
      channelId: "chan_web",
      channelStatus: "active",
    })
  })

  it("fails closed when the storefront has no active channel binding", async () => {
    const { resolver } = makeResolver(fakeProvider(), async () => null)

    const error = await rejection(
      resolver(
        {},
        request({
          [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com",
          [STOREFRONT_KEY_HEADER]: "vpk_token",
        }),
      ),
    )

    expect(error.reason).toBe("missing_channel_binding")
    expect(error.status).toBe(403)
    expect(error.code).toBe("forbidden")
  })

  it("falls back to the standard Origin header for a direct (non-BFF) client", async () => {
    const { resolver } = makeResolver(fakeProvider())
    const context = await resolver(
      {},
      new Request("https://api.example.com/api/v1/public", {
        headers: {
          origin: "https://shop.example.com",
          [STOREFRONT_KEY_HEADER]: "vpk_token",
        },
      }),
    )
    expect(context.baseURL).toBe("https://shop.example.com")
    expect(context.trustedOrigins).toEqual(["https://shop.example.com"])
  })

  it("prefers the explicit BFF origin header over the standard Origin header", async () => {
    const { resolver } = makeResolver(fakeProvider())
    const context = await resolver(
      {},
      new Request("https://api.example.com/api/v1/public", {
        headers: {
          [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com",
          // A cross-origin proxy hop could carry a different browser Origin; the
          // BFF header must win so the server contract is unchanged.
          origin: "https://preview.example.com",
          [STOREFRONT_KEY_HEADER]: "vpk_token",
        },
      }),
    )
    expect(context.baseURL).toBe("https://shop.example.com")
  })

  it("accepts a wildcard-matched origin", async () => {
    const { resolver } = makeResolver(fakeProvider())
    const context = await resolver(
      {},
      request({
        [STOREFRONT_ORIGIN_HEADER]: "https://preview.example.com",
        [STOREFRONT_KEY_HEADER]: "vpk_token",
      }),
    )
    expect(context.baseURL).toBe("https://preview.example.com")
  })

  async function rejection(
    promise: Promise<unknown>,
  ): Promise<StorefrontCustomerAuthResolutionError> {
    try {
      await promise
    } catch (error) {
      return error as StorefrontCustomerAuthResolutionError
    }
    throw new Error("expected the resolver to reject")
  }

  it("requires the origin header", async () => {
    const { resolver } = makeResolver(fakeProvider())
    const error = await rejection(resolver({}, request({ [STOREFRONT_KEY_HEADER]: "vpk_token" })))
    expect(error).toBeInstanceOf(StorefrontCustomerAuthResolutionError)
    expect(error.message).toMatch(/origin/i)
    expect(error.reason).toBe("missing_origin")
    expect(error.status).toBe(401)
    expect(error.code).toBe("unauthorized")
  })

  it("requires the key header", async () => {
    const { resolver } = makeResolver(fakeProvider())
    const error = await rejection(
      resolver({}, request({ [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com" })),
    )
    expect(error.message).toMatch(/key/i)
    expect(error.reason).toBe("missing_key")
    expect(error.status).toBe(401)
    // The message must not echo any presented key.
    expect(error.message).not.toMatch(/vpk_/)
  })

  it("rejects an unknown or revoked key", async () => {
    const { resolver, disposed } = makeResolver(
      fakeProvider({ resolveStorefrontByApiKey: async () => null }),
    )
    const error = await rejection(
      resolver(
        {},
        request({
          [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com",
          [STOREFRONT_KEY_HEADER]: "vpk_bad",
        }),
      ),
    )
    expect(error.message).toMatch(/unknown or revoked/i)
    expect(error.reason).toBe("unknown_key")
    expect(error.status).toBe(401)
    expect(error.message).not.toMatch(/vpk_bad/)
    expect(disposed()).toBe(1)
  })

  it("rejects an origin outside the declared allowlist as forbidden", async () => {
    const { resolver } = makeResolver(fakeProvider())
    const error = await rejection(
      resolver(
        {},
        request({
          [STOREFRONT_ORIGIN_HEADER]: "https://evil.com",
          [STOREFRONT_KEY_HEADER]: "vpk_token",
        }),
      ),
    )
    expect(error.message).toMatch(/declared allowed origin/i)
    expect(error.reason).toBe("origin_not_allowed")
    // A known key from a disallowed origin is a 403 (forbidden), not a 401.
    expect(error.status).toBe(403)
    expect(error.code).toBe("forbidden")
  })
})

describe("resolveStorefrontRequestOrigin", () => {
  it("prefers the BFF header, then falls back to the standard Origin header", () => {
    expect(
      resolveStorefrontRequestOrigin(
        request({
          [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com",
          origin: "https://other.example.com",
        }),
      ),
    ).toBe("https://shop.example.com")
    expect(resolveStorefrontRequestOrigin(request({ origin: "https://shop.example.com" }))).toBe(
      "https://shop.example.com",
    )
    expect(resolveStorefrontRequestOrigin(request({}))).toBeNull()
  })
})

describe("createLocalStorefrontCorsOriginResolver", () => {
  function makeCorsResolver(
    provider: StorefrontRuntimeProvider,
    resolveStorefrontChannelBinding: (
      context: unknown,
      storefrontId: string,
    ) => Promise<StorefrontChannelBindingDto | null> = async () => ACTIVE_BINDING,
  ) {
    let disposed = 0
    const resolver = createLocalStorefrontCorsOriginResolver<Record<string, never>>({
      provider,
      resolveStorefrontChannelBinding,
      async openResolveContext() {
        return {
          context: { bindings: {}, db: {} as never },
          dispose: async () => {
            disposed += 1
          },
        }
      },
    })
    return { resolver, disposed: () => disposed }
  }

  it("echoes the request origin for a valid key from an allowed origin", async () => {
    const { resolver, disposed } = makeCorsResolver(fakeProvider())
    const origin = await resolver(
      {},
      request({
        [STOREFRONT_KEY_HEADER]: "vpk_token",
        origin: "https://shop.example.com",
      }),
    )
    expect(origin).toBe("https://shop.example.com")
    expect(disposed()).toBe(1)
  })

  it("returns null for a valid key presented from a disallowed origin", async () => {
    const { resolver } = makeCorsResolver(fakeProvider())
    const origin = await resolver(
      {},
      request({ [STOREFRONT_KEY_HEADER]: "vpk_token", origin: "https://evil.com" }),
    )
    expect(origin).toBeNull()
  })

  it("returns null for a valid key when the storefront channel binding is inactive", async () => {
    const { resolver } = makeCorsResolver(fakeProvider(), async () => ({
      ...ACTIVE_BINDING,
      channelStatus: "inactive",
    }))
    const origin = await resolver(
      {},
      request({
        [STOREFRONT_KEY_HEADER]: "vpk_token",
        origin: "https://shop.example.com",
      }),
    )
    expect(origin).toBeNull()
  })

  it("returns null for an unknown key", async () => {
    const { resolver } = makeCorsResolver(
      fakeProvider({ resolveStorefrontByApiKey: async () => null }),
    )
    const origin = await resolver(
      {},
      request({ [STOREFRONT_KEY_HEADER]: "vpk_bad", origin: "https://shop.example.com" }),
    )
    expect(origin).toBeNull()
  })

  it("authorizes a keyless preflight by declared origin (exact + wildcard)", async () => {
    const { resolver } = makeCorsResolver(fakeProvider())
    expect(await resolver({}, request({ origin: "https://shop.example.com" }))).toBe(
      "https://shop.example.com",
    )
    // https://*.example.com wildcard authorizes a single-label sub-domain.
    expect(await resolver({}, request({ origin: "https://preview.example.com" }))).toBe(
      "https://preview.example.com",
    )
  })

  it("returns null for a keyless preflight from an origin no storefront allows", async () => {
    const { resolver } = makeCorsResolver(fakeProvider())
    expect(await resolver({}, request({ origin: "https://evil.com" }))).toBeNull()
  })

  it("returns null when no origin is present", async () => {
    const { resolver } = makeCorsResolver(fakeProvider())
    expect(await resolver({}, request({ [STOREFRONT_KEY_HEADER]: "vpk_token" }))).toBeNull()
  })
})
