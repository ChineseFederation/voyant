import { describe, expect, it } from "vitest"

import type { CustomerAuthRuntimeContext } from "../../src/node-runtime.js"
import {
  createLocalPublicApiCorsOriginResolver,
  createLocalPublicApiCustomerAuthResolver,
  PUBLIC_API_KEY_HEADER,
  PUBLIC_API_ORIGIN_HEADER,
  type PublicApiChannelDiagnostic,
  PublicApiCustomerAuthResolutionError,
  resolvePublicApiRequestOrigin,
  withResolvedPublicApiChannel,
} from "../../src/public-api-customer-auth-resolver.js"
import { isPublicApiOriginAllowed } from "../../src/public-api-origins.js"
import type {
  CustomerAccountSettingsDto,
  PublicApiKeyDto,
  PublicApiRuntimeProvider,
  ResolvedCustomerAccountCredentials,
  ResolvedPublicApiChannel,
} from "../../src/public-api-runtime-port.js"

const KEY: PublicApiKeyDto = {
  id: "pak_1",
  kind: "publishable",
  scopes: null,
  tokenPreview: "vpk_ab12cd",
  name: null,
  allowedOrigins: ["https://shop.example.com", "https://*.example.com"],
  channelId: null,
  hostOnlyCookies: true,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
}

/**
 * Methods and buyer policy are the DEPLOYMENT's now, not the key's: a customer
 * who signs up on the website and returns through a mobile app is one account
 * (voyant#4624).
 */
const SETTINGS: CustomerAccountSettingsDto = {
  methods: { emailCode: true, emailPassword: false, google: true, facebook: false, apple: false },
  accountPolicy: {
    allowedKinds: ["personal"],
    personalSignup: "open",
    businessOnboarding: "disabled",
  },
  updatedAt: "2026-07-19T00:00:00.000Z",
}

const ACTIVE_CHANNEL: ResolvedPublicApiChannel = {
  channelId: "chan_web",
  channelName: "Web",
  channelStatus: "active",
  implicit: false,
}

function fakeProvider(overrides?: {
  resolveApiKeyByToken?: () => Promise<PublicApiKeyDto | null>
  resolveProviderCredentials?: () => Promise<ResolvedCustomerAccountCredentials>
  resolveApiKeysByOrigin?: (origin: string) => Promise<PublicApiKeyDto[]>
  getCustomerAccountSettings?: () => Promise<CustomerAccountSettingsDto>
}): PublicApiRuntimeProvider {
  const provider: Partial<PublicApiRuntimeProvider> = {
    async resolveApiKeyByToken() {
      return overrides?.resolveApiKeyByToken?.() ?? Promise.resolve(KEY)
    },
    async resolveApiKeysByOrigin(_context: unknown, origin: string) {
      if (overrides?.resolveApiKeysByOrigin) return overrides.resolveApiKeysByOrigin(origin)
      return isPublicApiOriginAllowed(origin, KEY.allowedOrigins) ? [KEY] : []
    },
    async getCustomerAccountSettings() {
      return overrides?.getCustomerAccountSettings?.() ?? Promise.resolve(SETTINGS)
    },
    async resolveProviderCredentials() {
      return (
        overrides?.resolveProviderCredentials?.() ??
        Promise.resolve({ google: { clientId: "g-id", clientSecret: "g-secret" } })
      )
    },
    // Unused by the resolver; present to satisfy the provider contract.
  }
  return provider as PublicApiRuntimeProvider
}

function makeResolver(
  provider: PublicApiRuntimeProvider,
  resolveChannelForKey?: (
    context: unknown,
    channelId: string | null,
  ) => Promise<ResolvedPublicApiChannel | null>,
) {
  let disposed = 0
  const resolver = createLocalPublicApiCustomerAuthResolver<{ KMS_PROVIDER?: string }>({
    provider,
    resolveChannelForKey: resolveChannelForKey ?? (async () => ACTIVE_CHANNEL),
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

describe("createLocalPublicApiCustomerAuthResolver", () => {
  it("resolves methods, trusted origins, policy, and decrypted social secrets", async () => {
    const { resolver, disposed } = makeResolver(fakeProvider())
    const context = await resolver(
      {},
      request({
        [PUBLIC_API_ORIGIN_HEADER]: "https://shop.example.com",
        [PUBLIC_API_KEY_HEADER]: "vpk_token",
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
      accountPolicy: SETTINGS.accountPolicy,
      publicChannel: {
        channelId: "chan_web",
        channelStatus: "active",
      },
    })
    expect(disposed()).toBe(1)
  })

  it("carries provider-composed storefront channel context", async () => {
    const resolveChannelForKey = async () => ACTIVE_CHANNEL
    const { resolver } = makeResolver(fakeProvider(), resolveChannelForKey)

    const context = await resolver(
      {},
      request({
        [PUBLIC_API_ORIGIN_HEADER]: "https://shop.example.com",
        [PUBLIC_API_KEY_HEADER]: "vpk_token",
      }),
    )

    expect(context.publicChannel).toEqual({
      channelId: "chan_web",
      channelStatus: "active",
    })
  })

  it("fails closed when the deployment has no active channel", async () => {
    const { resolver } = makeResolver(fakeProvider(), async () => null)

    const error = await rejection(
      resolver(
        {},
        request({
          [PUBLIC_API_ORIGIN_HEADER]: "https://shop.example.com",
          [PUBLIC_API_KEY_HEADER]: "vpk_token",
        }),
      ),
    )

    expect(error.reason).toBe("missing_channel")
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
          [PUBLIC_API_KEY_HEADER]: "vpk_token",
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
          [PUBLIC_API_ORIGIN_HEADER]: "https://shop.example.com",
          // A cross-origin proxy hop could carry a different browser Origin; the
          // BFF header must win so the server contract is unchanged.
          origin: "https://preview.example.com",
          [PUBLIC_API_KEY_HEADER]: "vpk_token",
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
        [PUBLIC_API_ORIGIN_HEADER]: "https://preview.example.com",
        [PUBLIC_API_KEY_HEADER]: "vpk_token",
      }),
    )
    expect(context.baseURL).toBe("https://preview.example.com")
  })

  async function rejection(
    promise: Promise<unknown>,
  ): Promise<PublicApiCustomerAuthResolutionError> {
    try {
      await promise
    } catch (error) {
      return error as PublicApiCustomerAuthResolutionError
    }
    throw new Error("expected the resolver to reject")
  }

  it("requires the origin header for a PUBLISHABLE key", async () => {
    const { resolver } = makeResolver(fakeProvider())
    const error = await rejection(resolver({}, request({ [PUBLIC_API_KEY_HEADER]: "vpk_token" })))
    expect(error).toBeInstanceOf(PublicApiCustomerAuthResolutionError)
    expect(error.message).toMatch(/origin/i)
    expect(error.reason).toBe("missing_origin")
    expect(error.status).toBe(401)
    expect(error.code).toBe("unauthorized")
  })

  // voyant#4625 §2: requiring an origin for BOTH kinds meant a genuine
  // server-to-server caller could not use the API at all — `vsk_` only worked
  // from a BFF forwarding a synthetic origin header.
  it("does NOT require an origin for a secret key, and derives one from the storefront", async () => {
    const { resolver } = makeResolver(fakeProvider())
    const context = await resolver({}, request({ [PUBLIC_API_KEY_HEADER]: "vsk_token" }))
    expect(context.baseURL).toBe("https://shop.example.com")
    expect(context.publicApiBaseURL).toBe("https://shop.example.com/api")
    expect(context.trustedOrigins).toEqual(["https://shop.example.com"])
  })

  it("still checks an origin a secret-key caller DOES present", async () => {
    // Only the requirement differs by kind, never the check: a BFF relaying a
    // browser origin must be relaying one this storefront declared.
    const { resolver } = makeResolver(fakeProvider())
    const error = await rejection(
      resolver(
        {},
        request({
          [PUBLIC_API_KEY_HEADER]: "vsk_token",
          [PUBLIC_API_ORIGIN_HEADER]: "https://evil.example.net",
        }),
      ),
    )
    expect(error.reason).toBe("origin_not_allowed")
    expect(error.status).toBe(403)
  })

  it("refuses a secret-key caller when the key declares no exact origin", async () => {
    // Every URL the customer-auth runtime builds needs a canonical origin, and
    // a wildcard names a family of hosts rather than an address.
    const wildcardOnly: PublicApiKeyDto = {
      ...KEY,
      kind: "secret",
      tokenPreview: "vsk_ab12cd",
      allowedOrigins: ["https://*.example.com"],
    }
    const { resolver } = makeResolver(
      fakeProvider({
        resolveApiKeyByToken: async () => wildcardOnly,
      }),
    )
    const error = await rejection(resolver({}, request({ [PUBLIC_API_KEY_HEADER]: "vsk_token" })))
    expect(error.reason).toBe("missing_origin")
  })

  it("requires an origin when no key kind is recognisable", async () => {
    // An unrecognised token is not a secret key, so it gets the stricter rule.
    const { resolver } = makeResolver(fakeProvider())
    const error = await rejection(resolver({}, request({ [PUBLIC_API_KEY_HEADER]: "nonsense" })))
    expect(error.reason).toBe("missing_origin")
  })

  it("requires the key header", async () => {
    const { resolver } = makeResolver(fakeProvider())
    const error = await rejection(
      resolver({}, request({ [PUBLIC_API_ORIGIN_HEADER]: "https://shop.example.com" })),
    )
    expect(error.message).toMatch(/key/i)
    expect(error.reason).toBe("missing_key")
    expect(error.status).toBe(401)
    // The message must not echo any presented key.
    expect(error.message).not.toMatch(/vpk_/)
  })

  it("rejects an unknown or revoked key", async () => {
    const { resolver, disposed } = makeResolver(
      fakeProvider({ resolveApiKeyByToken: async () => null }),
    )
    const error = await rejection(
      resolver(
        {},
        request({
          [PUBLIC_API_ORIGIN_HEADER]: "https://shop.example.com",
          [PUBLIC_API_KEY_HEADER]: "vpk_bad",
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
          [PUBLIC_API_ORIGIN_HEADER]: "https://evil.com",
          [PUBLIC_API_KEY_HEADER]: "vpk_token",
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

describe("withResolvedPublicApiChannel", () => {
  /** A managed host resolver: real credentials, never a channel. */
  const hostContext: CustomerAuthRuntimeContext = {
    baseURL: "https://shop.example.com",
    trustedOrigins: ["https://shop.example.com"],
    methods: { emailCode: true, emailPassword: false, socialProviders: {} },
  }

  function makeAugmented(options?: {
    provider?: PublicApiRuntimeProvider
    binding?: () => Promise<ResolvedPublicApiChannel | null>
    host?: () => Promise<CustomerAuthRuntimeContext>
  }) {
    const diagnostics: PublicApiChannelDiagnostic[] = []
    let disposed = 0
    const resolver = withResolvedPublicApiChannel<Record<string, never>>(
      options?.host ?? (async () => hostContext),
      {
        provider: options?.provider ?? fakeProvider(),
        resolveChannelForKey: options?.binding ?? (async () => ACTIVE_CHANNEL),
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
        async openResolveContext() {
          return {
            context: { bindings: {}, db: {} as never },
            dispose: async () => {
              disposed += 1
            },
          }
        },
      },
    )
    return { resolver, diagnostics, disposed: () => disposed }
  }

  const publicRequest = () =>
    request({
      [PUBLIC_API_ORIGIN_HEADER]: "https://shop.example.com",
      [PUBLIC_API_KEY_HEADER]: "vpk_token",
    })

  it("adds the public channel a managed host context never carries", async () => {
    const { resolver, diagnostics, disposed } = makeAugmented()

    const context = await resolver({}, publicRequest())

    expect(context.publicChannel).toEqual({
      channelId: "chan_web",
      channelStatus: "active",
    })
    // The host's own resolution is preserved verbatim.
    expect(context.baseURL).toBe("https://shop.example.com")
    expect(diagnostics).toEqual([
      {
        outcome: "resolved",
        origin: "https://shop.example.com",
        keyId: "pak_1",
        channelId: "chan_web",
        channelStatus: "active",
      },
    ])
    expect(disposed()).toBe(1)
  })

  it("leaves a host-provided channel untouched", async () => {
    const channel = { channelId: "chan_host", channelStatus: "active" }
    const { resolver, diagnostics } = makeAugmented({
      host: async () => ({ ...hostContext, publicChannel: channel }),
      binding: async () => {
        throw new Error("must not consult the binding when the host resolved one")
      },
    })

    const context = await resolver({}, publicRequest())

    expect(context.publicChannel).toEqual(channel)
    expect(diagnostics[0]?.outcome).toBe("host_provided")
  })

  it("falls back to the declared origin when the key is not resolvable locally", async () => {
    const { resolver, diagnostics } = makeAugmented({
      provider: fakeProvider({ resolveApiKeyByToken: async () => null }),
    })

    const context = await resolver({}, publicRequest())

    expect(context.publicChannel?.channelId).toBe("chan_web")
    expect(diagnostics[0]?.outcome).toBe("resolved")
  })

  it("reports the three no-channel states distinguishably and leaves the context alone", async () => {
    const unknownKey = makeAugmented({
      provider: fakeProvider({
        resolveApiKeyByToken: async () => null,
        resolveApiKeysByOrigin: async () => [],
      }),
    })
    const noBinding = makeAugmented({ binding: async () => null })
    const inactive = makeAugmented({
      binding: async () => ({ ...ACTIVE_CHANNEL, channelStatus: "archived" }),
    })

    for (const { resolver } of [unknownKey, noBinding, inactive]) {
      const context = await resolver({}, publicRequest())
      expect(context.publicChannel).toBeUndefined()
    }

    expect(unknownKey.diagnostics[0]?.outcome).toBe("key_not_resolved")
    expect(noBinding.diagnostics[0]).toMatchObject({
      outcome: "channel_missing",
      keyId: "pak_1",
    })
    expect(inactive.diagnostics[0]).toMatchObject({
      outcome: "channel_inactive",
      channelStatus: "archived",
    })
  })

  it("never turns a channel lookup fault into a failed sign-in", async () => {
    const { resolver, diagnostics, disposed } = makeAugmented({
      binding: async () => {
        throw new Error("channels table is unreachable")
      },
    })

    const context = await resolver({}, publicRequest())

    expect(context).toEqual(hostContext)
    expect(diagnostics[0]?.outcome).toBe("lookup_failed")
    expect(disposed()).toBe(1)
  })
})

describe("resolvePublicApiRequestOrigin", () => {
  it("prefers the BFF header, then falls back to the standard Origin header", () => {
    expect(
      resolvePublicApiRequestOrigin(
        request({
          [PUBLIC_API_ORIGIN_HEADER]: "https://shop.example.com",
          origin: "https://other.example.com",
        }),
      ),
    ).toBe("https://shop.example.com")
    expect(resolvePublicApiRequestOrigin(request({ origin: "https://shop.example.com" }))).toBe(
      "https://shop.example.com",
    )
    expect(resolvePublicApiRequestOrigin(request({}))).toBeNull()
  })
})

describe("createLocalPublicApiCorsOriginResolver", () => {
  function makeCorsResolver(
    provider: PublicApiRuntimeProvider,
    resolveChannelForKey: (
      context: unknown,
      channelId: string | null,
    ) => Promise<ResolvedPublicApiChannel | null> = async () => ACTIVE_CHANNEL,
  ) {
    let disposed = 0
    const resolver = createLocalPublicApiCorsOriginResolver<Record<string, never>>({
      provider,
      resolveChannelForKey,
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
        [PUBLIC_API_KEY_HEADER]: "vpk_token",
        origin: "https://shop.example.com",
      }),
    )
    expect(origin).toBe("https://shop.example.com")
    expect(disposed()).toBe(1)
  })

  // voyant#4625 §2: dynamic CORS exists so a BROWSER can talk to this
  // deployment with a publishable key. A secret key is server-only, and
  // server-to-server callers are not subject to CORS at all — so echoing an
  // origin for one would only ever help a browser that has a `vsk_` in it.
  it("never echoes an origin for a SECRET key, even from an allowed origin", async () => {
    const { resolver } = makeCorsResolver(fakeProvider())
    const origin = await resolver(
      {},
      request({ [PUBLIC_API_KEY_HEADER]: "vsk_token", origin: "https://shop.example.com" }),
    )
    expect(origin).toBeNull()
  })

  it("returns null for a valid key presented from a disallowed origin", async () => {
    const { resolver } = makeCorsResolver(fakeProvider())
    const origin = await resolver(
      {},
      request({ [PUBLIC_API_KEY_HEADER]: "vpk_token", origin: "https://evil.com" }),
    )
    expect(origin).toBeNull()
  })

  it("returns null for a valid key when the storefront channel binding is inactive", async () => {
    const { resolver } = makeCorsResolver(fakeProvider(), async () => ({
      ...ACTIVE_CHANNEL,
      channelStatus: "inactive",
    }))
    const origin = await resolver(
      {},
      request({
        [PUBLIC_API_KEY_HEADER]: "vpk_token",
        origin: "https://shop.example.com",
      }),
    )
    expect(origin).toBeNull()
  })

  it("returns null for an unknown key", async () => {
    const { resolver } = makeCorsResolver(fakeProvider({ resolveApiKeyByToken: async () => null }))
    const origin = await resolver(
      {},
      request({ [PUBLIC_API_KEY_HEADER]: "vpk_bad", origin: "https://shop.example.com" }),
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
    expect(await resolver({}, request({ [PUBLIC_API_KEY_HEADER]: "vpk_token" }))).toBeNull()
  })
})
