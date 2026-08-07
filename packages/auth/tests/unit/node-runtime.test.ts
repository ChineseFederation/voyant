// agent-quality: file-size exception -- existing auth runtime tests are extended here to keep request-auth regressions colocated.
import { describe, expect, it, vi } from "vitest"

import {
  buildBetterAuthCookieAdvancedOptions,
  createOperatorAuthNodeRuntime,
  isCustomerCorsSurface,
} from "../../src/node-runtime.js"
import {
  createLocalStorefrontCorsOriginResolver,
  createLocalStorefrontCustomerAuthResolver,
  STOREFRONT_KEY_HEADER,
  STOREFRONT_ORIGIN_HEADER,
} from "../../src/storefront-customer-auth-resolver.js"
import type {
  StorefrontChannelBindingDto,
  StorefrontDto,
  StorefrontRuntimeProvider,
} from "../../src/storefront-runtime-port.js"

describe("buildBetterAuthCookieAdvancedOptions", () => {
  it("leaves Better Auth cookie defaults untouched when the domain is unset", () => {
    expect(buildBetterAuthCookieAdvancedOptions({})).toBeUndefined()
    expect(buildBetterAuthCookieAdvancedOptions({ AUTH_COOKIE_DOMAIN: "   " })).toBeUndefined()
  })

  it("enables cross-subdomain cookies for the configured domain", () => {
    expect(buildBetterAuthCookieAdvancedOptions({ AUTH_COOKIE_DOMAIN: " .example.com " })).toEqual({
      crossSubDomainCookies: {
        enabled: true,
        domain: ".example.com",
      },
      defaultCookieAttributes: {
        domain: ".example.com",
      },
    })
  })
})

describe("createOperatorAuthNodeRuntime", () => {
  const onboardingProvider = () => ({
    getCapabilities: vi.fn(),
    createBusinessAccount: vi.fn(),
    requestBusinessAccount: vi.fn(),
    listRequests: vi.fn(),
    cancelRequest: vi.fn(),
    approveRequest: vi.fn(),
    rejectRequest: vi.fn(),
    provisionBusinessAccount: vi.fn(),
  })

  it.each([
    {
      path: "/auth/customer/business-accounts",
      body: {
        idempotencyKey: "open-policy-key",
        profile: { name: "Acme", legalName: null, taxId: null, website: null },
      },
      businessOnboarding: "invite-only" as const,
    },
    {
      path: "/auth/customer/business-account-requests",
      body: {
        idempotencyKey: "request-policy-key",
        profile: { name: "Acme", legalName: null, taxId: null, website: null },
      },
      businessOnboarding: "open" as const,
    },
  ])("fails closed when $path is inconsistent with policy", async (testCase) => {
    const provider = onboardingProvider()
    const dispose = vi.fn(async () => {})
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase: () => ({ db: {} as never, dispose }),
      customerBusinessAccountOnboarding: provider,
      resolveCustomerAuthContext: async () => ({
        baseURL: "https://shop.example.com",
        invitationAcceptBaseURL: "https://shop.example.com",
        trustedOrigins: ["https://shop.example.com"],
        methods: { emailCode: true, emailPassword: true },
        accountPolicy: {
          allowedKinds: ["business"],
          personalSignup: "disabled",
          businessOnboarding: testCase.businessOnboarding,
        },
      }),
    })
    const response = await runtime.handler.fetch(
      new Request(`https://shop.example.com${testCase.path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(testCase.body),
      }),
      {
        DATABASE_URL: "postgres://unused",
        BETTER_AUTH_CUSTOMER_SECRET: "customer-secret-with-at-least-32-characters",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-secret-with-at-least-32-characters",
      },
      { waitUntil: vi.fn() } as never,
    )
    expect(response.status).toBe(403)
    expect(provider.createBusinessAccount).not.toHaveBeenCalled()
    expect(provider.requestBusinessAccount).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("fails the invitation facade closed when business accounts are disabled", async () => {
    const openDatabase = vi.fn(() => ({ db: {} as never, dispose: async () => {} }))
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase,
      resolveCustomerAuthContext: async () => ({
        baseURL: "https://shop.example.com",
        trustedOrigins: ["https://shop.example.com"],
        methods: { emailCode: true, emailPassword: true },
      }),
    })
    const response = await runtime.handler.fetch(
      new Request("https://shop.example.com/auth/customer/business-account-invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationId: "invitation-disabled" }),
      }),
      {
        DATABASE_URL: "postgres://unused",
        BETTER_AUTH_CUSTOMER_SECRET: "customer-secret-with-at-least-32-characters",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-secret-with-at-least-32-characters",
      },
      { waitUntil: vi.fn() } as never,
    )
    expect(response.status).toBe(404)
  })
  it("surfaces active managed modules in bootstrap status", async () => {
    const openDatabase = vi.fn(() => {
      throw new Error("managed bootstrap status must not open the database")
    })
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      activeModules: ["catalog", "storefront"],
      appName: "auth-test",
      authMode: "voyant-cloud",
      reporter: { captureException: vi.fn() },
      openDatabase,
    })

    const response = await runtime.handler.fetch(
      new Request("https://admin.example.com/auth/bootstrap-status"),
      {
        DATABASE_URL: "postgres://unused",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
      },
      { waitUntil: vi.fn() } as never,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      hasUsers: true,
      authMode: "voyant-cloud",
      modules: ["catalog", "storefront"],
    })
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it("keeps the shell bootstrap private and rejects unauthenticated requests", async () => {
    const resolver = vi.fn()
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      activeModules: ["catalog"],
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      resolveShellBootstrap: resolver,
    })

    const response = await runtime.handler.fetch(
      new Request("https://localhost/auth/shell-bootstrap"),
      {
        DATABASE_URL: "postgres://unused",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
        VOYANT_OPERATOR_BROWSER_EVIDENCE: "1",
      },
      { waitUntil: vi.fn() } as never,
    )

    expect(response.status).toBe(401)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("vary")).toBe("Cookie, Authorization")
    expect(resolver).not.toHaveBeenCalled()
  })

  it("exposes only the canonical admin cloud start route", async () => {
    const openDatabase = vi.fn(() => {
      throw new Error("cloud start route must not open the database")
    })
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "voyant-cloud",
      reporter: { captureException: vi.fn() },
      openDatabase,
    })
    const env = {
      DATABASE_URL: "postgres://unused",
      SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret-with-32-characters",
    }

    const canonical = await runtime.handler.fetch(
      new Request("https://admin.example.com/auth/admin/cloud/start"),
      env,
      { waitUntil: vi.fn() } as never,
    )
    const legacy = await runtime.handler.fetch(
      new Request("https://admin.example.com/auth/cloud/start"),
      env,
      { waitUntil: vi.fn() } as never,
    )

    expect(canonical.status).toBe(501)
    expect(legacy.status).toBe(404)
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it("rejects existing customer sessions when the customer realm is disabled", async () => {
    const openDatabase = vi.fn(() => {
      throw new Error("the disabled customer realm must not open the database")
    })
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase,
    })

    await expect(
      runtime.resolveAuthRequest(
        new Request("https://store.example.com/v1/public/customer/profile", {
          headers: { cookie: "voyant-customer.session_token=existing-session" },
        }),
        {
          DATABASE_URL: "postgres://unused",
          SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
          VOYANT_CUSTOMER_AUTH_MODE: "disabled",
        },
      ),
    ).resolves.toBeNull()
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it("classifies the exact public root as customer auth and rejects it before DB when disabled", async () => {
    const openDatabase = vi.fn(() => {
      throw new Error("the disabled customer realm must not open the database")
    })
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase,
    })

    await expect(
      runtime.resolveAuthRequest(new Request("https://store.example.com/v1/public"), {
        DATABASE_URL: "postgres://unused",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
        VOYANT_CUSTOMER_AUTH_MODE: "disabled",
      }),
    ).resolves.toBeNull()
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it("reports disabled customer status without opening the database", async () => {
    const openDatabase = vi.fn(() => {
      throw new Error("disabled customer status must not open the database")
    })
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase,
    })

    const response = await runtime.handler.fetch(
      new Request("https://store.example.com/auth/customer/status"),
      {
        DATABASE_URL: "postgres://unused",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
        VOYANT_CUSTOMER_AUTH_MODE: "disabled",
      },
      { waitUntil: vi.fn() } as never,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ authenticated: false, disabled: true })
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it("awaits managed customer auth context for the public configuration", async () => {
    const resolveCustomerAuthContext = vi.fn(async () => {
      await Promise.resolve()
      return {
        baseURL: "https://shop.example.com",
        publicApiBaseURL: "https://shop.example.com/api",
        trustedOrigins: ["https://shop.example.com"],
        methods: {
          emailCode: true,
          emailPassword: false,
          socialProviders: {
            google: { clientId: "google-id", clientSecret: "google-secret" },
          },
        },
      }
    })
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "voyant-cloud",
      reporter: { captureException: vi.fn() },
      resolveCustomerAuthContext,
    })

    const response = await runtime.handler.fetch(
      new Request("https://runtime.internal/auth/customer/config"),
      {
        DATABASE_URL: "postgres://unused",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
      },
      { waitUntil: vi.fn() } as never,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      accountPolicy: {
        allowedKinds: ["personal"],
        personalSignup: "open",
        businessOnboarding: "disabled",
      },
      methods: {
        emailCode: true,
        emailPassword: false,
        google: true,
        facebook: false,
        apple: false,
      },
    })
    expect(resolveCustomerAuthContext).toHaveBeenCalledOnce()
  })

  it.each([
    {
      label: "non-origin base URL",
      context: {
        baseURL: "https://shop.example.com/tenant",
        publicApiBaseURL: "https://shop.example.com/api",
        trustedOrigins: ["https://shop.example.com"],
      },
    },
    {
      label: "non-API public URL",
      context: {
        baseURL: "https://shop.example.com",
        publicApiBaseURL: "https://evil.example.com/callback",
        trustedOrigins: ["https://shop.example.com"],
      },
    },
    {
      label: "trusted origin that is not an absolute HTTP(S) URL",
      context: {
        baseURL: "https://shop.example.com",
        publicApiBaseURL: "https://shop.example.com/api",
        trustedOrigins: ["shop.example.com"],
      },
    },
  ])("fails closed for a broker context with $label", async ({ context }) => {
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "voyant-cloud",
      reporter: { captureException: vi.fn() },
      resolveCustomerAuthContext: async () => ({
        ...context,
        methods: { emailCode: true, emailPassword: true },
      }),
    })

    const response = await runtime.handler.fetch(
      new Request("https://runtime.internal/auth/customer/config"),
      {
        DATABASE_URL: "postgres://unused",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
      },
      { waitUntil: vi.fn() } as never,
    )

    expect(response.status).toBe(500)
  })

  // `APP_URL` is documented (and shipped) as the API base — `http://host/api` —
  // and it feeds the env trusted-origin allowlist. An origin check only compares
  // origins, so the path is narrowed away rather than rejected; rejecting it
  // turned every public read into a 500 (voyant#4261).
  it("narrows a trusted origin that carries a path to its origin", async () => {
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "voyant-cloud",
      reporter: { captureException: vi.fn() },
      resolveCustomerAuthContext: async () => ({
        baseURL: "https://shop.example.com",
        publicApiBaseURL: "https://shop.example.com/api",
        trustedOrigins: ["https://shop.example.com/api", "https://shop.example.com"],
        methods: { emailCode: true, emailPassword: true },
      }),
    })

    const response = await runtime.handler.fetch(
      new Request("https://runtime.internal/auth/customer/config"),
      {
        DATABASE_URL: "postgres://unused",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
      },
      { waitUntil: vi.fn() } as never,
    )

    expect(response.status).toBe(200)
  })

  it("awaits managed customer auth context for public API session resolution", async () => {
    const contextError = new Error("customer context broker unavailable")
    const resolveCustomerAuthContext = vi.fn(async () => {
      await Promise.resolve()
      throw contextError
    })
    const dispose = vi.fn(async () => {})
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "voyant-cloud",
      reporter: { captureException: vi.fn() },
      openDatabase: () => ({ db: {} as never, dispose }),
      resolveCustomerAuthContext,
    })
    const request = new Request("https://runtime.internal/v1/public/customer/profile")

    await expect(
      runtime.resolveAuthRequest(request, {
        DATABASE_URL: "postgres://unused",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
        BETTER_AUTH_CUSTOMER_SECRET: "customer-secret",
      }),
    ).rejects.toBe(contextError)
    expect(resolveCustomerAuthContext).toHaveBeenCalledWith(expect.anything(), request)
    expect(dispose).toHaveBeenCalledOnce()
  })

  it.each([
    "/auth/customer/status",
    "/auth/customer/sign-in/email",
  ])("awaits managed customer auth context for %s", async (pathname) => {
    const contextError = new Error("customer context broker unavailable")
    const resolveCustomerAuthContext = vi.fn(async () => {
      await Promise.resolve()
      throw contextError
    })
    const dispose = vi.fn(async () => {})
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "voyant-cloud",
      reporter: { captureException: vi.fn() },
      openDatabase: () => ({ db: {} as never, dispose }),
      resolveCustomerAuthContext,
    })

    const response = await runtime.handler.fetch(
      new Request(`https://runtime.internal${pathname}`),
      {
        DATABASE_URL: "postgres://unused",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
        BETTER_AUTH_CUSTOMER_SECRET: "customer-secret",
      },
      { waitUntil: vi.fn() } as never,
    )

    expect(response.status).toBe(500)
    expect(resolveCustomerAuthContext).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("fails closed for paths that only contain a public-surface substring", async () => {
    const openDatabase = vi.fn(() => {
      throw new Error("ambiguous paths must not open the database")
    })
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase,
    })

    await expect(
      runtime.resolveAuthRequest(new Request("https://admin.example.com/not-v1/public/profile"), {
        DATABASE_URL: "postgres://unused",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
      }),
    ).resolves.toBeNull()
    expect(openDatabase).not.toHaveBeenCalled()
  })

  it("does not accept the legacy Better Auth secret for admin sessions", async () => {
    const dispose = vi.fn(async () => {})
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase: () => ({ db: {} as never, dispose }),
    })
    const legacyEnv = {
      DATABASE_URL: "postgres://unused",
      SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
      BETTER_AUTH_SECRET: "legacy-admin-secret",
    }

    await expect(
      runtime.resolveAuthRequest(
        new Request("https://admin.example.com/v1/admin/profile"),
        legacyEnv,
      ),
    ).rejects.toThrow("Admin auth requires BETTER_AUTH_ADMIN_SECRET")
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("requires a customer secret instead of deriving one from the admin realm", async () => {
    const dispose = vi.fn(async () => {})
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase: () => ({ db: {} as never, dispose }),
    })

    await expect(
      runtime.resolveAuthRequest(new Request("https://store.example.com/v1/public/profile"), {
        DATABASE_URL: "postgres://unused",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-session-claims-secret",
        BETTER_AUTH_ADMIN_SECRET: "admin-secret",
      }),
    ).rejects.toThrow("Customer auth requires BETTER_AUTH_CUSTOMER_SECRET")
    expect(dispose).toHaveBeenCalledOnce()
  })
})

describe("createOperatorAuthNodeRuntime storefront customer-auth failures", () => {
  const STOREFRONT: StorefrontDto = {
    id: "sf_1",
    name: "Shop",
    slug: "shop",
    hostingKind: "external",
    siteId: null,
    allowedOrigins: ["https://shop.example.com"],
    methods: {
      emailCode: true,
      emailPassword: false,
      google: false,
      facebook: false,
      apple: false,
    },
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

  function fakeProvider(
    resolveStorefrontByApiKey?: () => Promise<unknown>,
  ): StorefrontRuntimeProvider {
    const provider: Partial<StorefrontRuntimeProvider> = {
      resolveStorefrontByApiKey:
        resolveStorefrontByApiKey ?? (async () => ({ storefront: STOREFRONT, key: null })),
      resolveProviderCredentials: async () => ({}),
    }
    return provider as StorefrontRuntimeProvider
  }

  function makeRuntime(provider: StorefrontRuntimeProvider) {
    return createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase: () => ({ db: {} as never, dispose: async () => {} }),
      resolveCustomerAuthContext: createLocalStorefrontCustomerAuthResolver({
        provider,
        resolveStorefrontChannelBinding: async () => ACTIVE_BINDING,
        openResolveContext: async () => ({
          context: { bindings: {}, db: {} as never },
          dispose: async () => {},
        }),
      }),
    })
  }

  const ENV = {
    DATABASE_URL: "postgres://unused",
    BETTER_AUTH_CUSTOMER_SECRET: "customer-secret-with-at-least-32-characters",
    SESSION_CLAIMS_ADMIN_SECRET: "admin-secret-with-at-least-32-characters",
  }

  async function configRequest(headers: Record<string, string>) {
    return makeRuntime(fakeProvider()).handler.fetch(
      new Request("https://shop.example.com/auth/customer/config", { headers }),
      ENV,
      { waitUntil: vi.fn() } as never,
    )
  }

  it("returns 401 when the storefront key is missing", async () => {
    const response = await configRequest({ [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com" })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "unauthorized" })
  })

  it("returns 401 when the storefront origin header is missing", async () => {
    const response = await configRequest({ [STOREFRONT_KEY_HEADER]: "vpk_token" })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "unauthorized" })
  })

  it("returns 401 for an unknown or revoked key without leaking it", async () => {
    const response = await makeRuntime(fakeProvider(async () => null)).handler.fetch(
      new Request("https://shop.example.com/auth/customer/config", {
        headers: {
          [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com",
          [STOREFRONT_KEY_HEADER]: "vpk_secret_value",
        },
      }),
      ENV,
      { waitUntil: vi.fn() } as never,
    )
    expect(response.status).toBe(401)
    const body = await response.text()
    expect(JSON.parse(body)).toEqual({ error: "unauthorized" })
    expect(body).not.toContain("vpk_secret_value")
  })

  it("returns 403 for a known key presented from a disallowed origin", async () => {
    const response = await configRequest({
      [STOREFRONT_ORIGIN_HEADER]: "https://evil.example.com",
      [STOREFRONT_KEY_HEADER]: "vpk_token",
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "forbidden" })
  })

  it("returns 403 when a valid storefront has no active channel binding", async () => {
    const response = await createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase: () => ({ db: {} as never, dispose: async () => {} }),
      resolveCustomerAuthContext: createLocalStorefrontCustomerAuthResolver({
        provider: fakeProvider(),
        resolveStorefrontChannelBinding: async () => null,
        openResolveContext: async () => ({
          context: { bindings: {}, db: {} as never },
          dispose: async () => {},
        }),
      }),
    }).handler.fetch(
      new Request("https://shop.example.com/auth/customer/config", {
        headers: {
          [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com",
          [STOREFRONT_KEY_HEADER]: "vpk_token",
        },
      }),
      ENV,
      { waitUntil: vi.fn() } as never,
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "forbidden" })
  })

  it("still resolves a valid key + allowed origin (200 path unaffected)", async () => {
    const response = await configRequest({
      [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com",
      [STOREFRONT_KEY_HEADER]: "vpk_token",
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      methods: { emailCode: true, emailPassword: false },
    })
  })

  it.each([
    { label: "missing key", headers: { [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com" } },
    {
      label: "unknown/revoked key",
      headers: {
        [STOREFRONT_ORIGIN_HEADER]: "https://shop.example.com",
        [STOREFRONT_KEY_HEADER]: "vpk_secret_value",
      },
      resolveStorefrontByApiKey: async () => null,
    },
    {
      label: "disallowed origin",
      headers: {
        [STOREFRONT_ORIGIN_HEADER]: "https://evil.example.com",
        [STOREFRONT_KEY_HEADER]: "vpk_token",
      },
    },
  ])("maps a public-API storefront resolver failure ($label) to unauthorized (null → 401)", async ({
    headers,
    resolveStorefrontByApiKey,
  }) => {
    // On /v1/public/*, a storefront key/origin failure must resolve to
    // "unauthorized" (null) so the framework returns 401 — never a 500.
    const result = await makeRuntime(fakeProvider(resolveStorefrontByApiKey)).resolveAuthRequest(
      new Request("https://shop.example.com/v1/public/catalog", { headers }),
      ENV,
    )
    expect(result).toBeNull()
  })

  it("propagates a genuine (non-resolver) fault on the public API path", async () => {
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase: () => ({ db: {} as never, dispose: async () => {} }),
      resolveCustomerAuthContext: async () => {
        throw new Error("customer context broker unavailable")
      },
    })
    await expect(
      runtime.resolveAuthRequest(new Request("https://shop.example.com/v1/public/catalog"), ENV),
    ).rejects.toThrow("customer context broker unavailable")
  })
})

describe("isCustomerCorsSurface", () => {
  it("matches the customer public API and customer auth routes (with or without /api)", () => {
    for (const url of [
      "https://api.example.com/v1/public",
      "https://api.example.com/v1/public/catalog/items",
      "https://api.example.com/api/v1/public/catalog/items",
      "https://api.example.com/auth/customer",
      "https://api.example.com/auth/customer/sign-in/email",
      "https://api.example.com/api/auth/customer/sign-in/email",
    ]) {
      expect(isCustomerCorsSurface(url)).toBe(true)
    }
  })

  it("excludes admin/dash and unrelated surfaces", () => {
    for (const url of [
      "https://api.example.com/v1/admin/catalog",
      "https://api.example.com/auth/admin/sign-in/email",
      "https://api.example.com/health",
      "https://api.example.com/not-v1/public/x",
    ]) {
      expect(isCustomerCorsSurface(url)).toBe(false)
    }
  })
})

describe("createOperatorAuthNodeRuntime customer dynamic CORS", () => {
  const STOREFRONT: StorefrontDto = {
    id: "sf_cors",
    name: "Shop",
    slug: "shop",
    hostingKind: "external",
    siteId: null,
    allowedOrigins: ["https://shop.example.com", "https://*.example.com"],
    methods: {
      emailCode: true,
      emailPassword: false,
      google: false,
      facebook: false,
      apple: false,
    },
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
    storefrontId: "sf_cors",
    channelId: "chan_web",
    channelName: "Web",
    channelStatus: "active",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  }

  function corsProvider(): StorefrontRuntimeProvider {
    const provider: Partial<StorefrontRuntimeProvider> = {
      resolveStorefrontByApiKey: async (_context: unknown, token: string) =>
        token ? { storefront: STOREFRONT, key: null } : null,
      resolveStorefrontByOrigin: async (_context: unknown, origin: string) =>
        ["https://shop.example.com", "https://preview.example.com"].includes(origin)
          ? STOREFRONT
          : null,
      resolveProviderCredentials: async () => ({}),
    }
    return provider as StorefrontRuntimeProvider
  }

  function makeRuntime() {
    return createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase: () => ({ db: {} as never, dispose: async () => {} }),
      resolveCustomerCorsOrigin: createLocalStorefrontCorsOriginResolver({
        provider: corsProvider(),
        resolveStorefrontChannelBinding: async () => ACTIVE_BINDING,
        openResolveContext: async () => ({
          context: { bindings: {}, db: {} as never },
          dispose: async () => {},
        }),
      }),
    })
  }

  const ENV = { DATABASE_URL: "postgres://unused", SESSION_CLAIMS_ADMIN_SECRET: "x".repeat(32) }

  it("echoes an allowed origin for a keyed public-API request", async () => {
    const runtime = makeRuntime()
    const origin = await runtime.resolveCustomerCorsOrigin(
      new Request("https://api.example.com/v1/public/catalog", {
        headers: { origin: "https://shop.example.com", [STOREFRONT_KEY_HEADER]: "vpk_token" },
      }),
      ENV,
    )
    expect(origin).toBe("https://shop.example.com")
  })

  it("authorizes a keyless preflight by declared origin", async () => {
    const runtime = makeRuntime()
    const origin = await runtime.resolveCustomerCorsOrigin(
      new Request("https://api.example.com/auth/customer/sign-in/email", {
        method: "OPTIONS",
        headers: { origin: "https://preview.example.com" },
      }),
      ENV,
    )
    expect(origin).toBe("https://preview.example.com")
  })

  it("returns null for a disallowed origin", async () => {
    const runtime = makeRuntime()
    expect(
      await runtime.resolveCustomerCorsOrigin(
        new Request("https://api.example.com/v1/public/catalog", {
          headers: { origin: "https://evil.com", [STOREFRONT_KEY_HEADER]: "vpk_token" },
        }),
        ENV,
      ),
    ).toBeNull()
  })

  it("does not authorize admin surfaces (static allowlist only)", async () => {
    const runtime = makeRuntime()
    expect(
      await runtime.resolveCustomerCorsOrigin(
        new Request("https://api.example.com/v1/admin/catalog", {
          headers: { origin: "https://shop.example.com", [STOREFRONT_KEY_HEADER]: "vpk_token" },
        }),
        ENV,
      ),
    ).toBeNull()
  })

  it("returns null when the customer realm is disabled", async () => {
    const runtime = makeRuntime()
    expect(
      await runtime.resolveCustomerCorsOrigin(
        new Request("https://api.example.com/v1/public/catalog", {
          headers: { origin: "https://shop.example.com", [STOREFRONT_KEY_HEADER]: "vpk_token" },
        }),
        { ...ENV, VOYANT_CUSTOMER_AUTH_MODE: "disabled" },
      ),
    ).toBeNull()
  })

  it("returns null when no CORS authorizer is wired", async () => {
    const runtime = createOperatorAuthNodeRuntime({
      accessCatalog: { resources: [], presets: [] },
      appName: "auth-test",
      authMode: "local",
      reporter: { captureException: vi.fn() },
      openDatabase: () => ({ db: {} as never, dispose: async () => {} }),
    })
    expect(
      await runtime.resolveCustomerCorsOrigin(
        new Request("https://api.example.com/v1/public/catalog", {
          headers: { origin: "https://shop.example.com", [STOREFRONT_KEY_HEADER]: "vpk_token" },
        }),
        ENV,
      ),
    ).toBeNull()
  })
})
