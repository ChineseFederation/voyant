// agent-quality: file-size exception -- owner: auth; this factory suite keeps shared Better Auth mocks and realm-isolation assertions together.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CreateBetterAuthOptions } from "../../src/server.js"

type BetterAuthConfig = {
  basePath?: string
  secret?: string
  databaseHooks?: unknown
  plugins: Array<{
    id?: string
    resolver?: Record<string, (...args: string[]) => Promise<boolean>>
  }>
  socialProviders?: Record<string, unknown>
  advanced: {
    cookiePrefix?: string
    crossSubDomainCookies?: {
      enabled: boolean
      domain?: string
    }
    defaultCookieAttributes?: {
      domain?: string
      sameSite?: string
    }
    useSecureCookies: boolean
  }
  databaseHooks: {
    user: {
      create: {
        before: (
          user?: Record<string, unknown>,
          context?: { path?: string } | null,
        ) => Promise<undefined | { data: Record<string, unknown> }>
        after: (user: Record<string, unknown>, context?: { path?: string } | null) => Promise<void>
      }
    }
  }
}

const {
  betterAuthMock,
  createLocalMemberAccessPluginMock,
  drizzleAdapterMock,
  isCustomerSessionActiveMock,
  isFirstAuthUserMock,
  provisionCurrentUserProfileMock,
} = vi.hoisted(() => ({
  betterAuthMock: vi.fn((config: Record<string, unknown>) => ({ config })),
  createLocalMemberAccessPluginMock: vi.fn((resolver: Record<string, unknown>) => ({
    id: "voyant-local-member-access",
    resolver,
  })),
  drizzleAdapterMock: vi.fn(() => ({ adapter: "drizzle" })),
  isCustomerSessionActiveMock: vi.fn(async () => true),
  isFirstAuthUserMock: vi.fn(async () => false),
  provisionCurrentUserProfileMock: vi.fn(async () => undefined),
}))

vi.mock("@better-auth/api-key", () => ({
  apiKey: vi.fn((options: Record<string, unknown>) => ({ id: "apiKey", options })),
}))

vi.mock("@voyant-travel/db", () => ({
  getDb: vi.fn(() => ({ id: "default-db" })),
}))

vi.mock("@voyant-travel/db/schema/iam", () => ({
  apikeyTable: { name: "apikey" },
  authAccount: { name: "account" },
  authSession: { name: "session" },
  authUser: { name: "user" },
  authVerification: { name: "verification" },
  customerAuthAccount: { name: "customerAccount" },
  customerAuthInvitation: { name: "customerInvitation" },
  customerAuthMember: { name: "customerMember" },
  customerAuthOrganization: { name: "customerOrganization" },
  customerAuthSession: { name: "customerSession" },
  customerAuthUser: { name: "customerUser" },
  customerAuthVerification: { name: "customerVerification" },
  jwksTable: { name: "jwks" },
  oauthAccessTokenTable: { name: "oauthAccessToken" },
  oauthClientTable: { name: "oauthClient" },
  oauthConsentTable: { name: "oauthConsent" },
  oauthRefreshTokenTable: { name: "oauthRefreshToken" },
  userProfilesTable: { name: "userProfiles" },
}))

vi.mock("better-auth", () => ({
  betterAuth: betterAuthMock,
}))

vi.mock("better-auth/api", () => ({
  APIError: class APIError extends Error {},
  createAuthMiddleware: vi.fn((handler: unknown) => handler),
  getSessionFromCtx: vi.fn(async () => null),
}))

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: drizzleAdapterMock,
}))

vi.mock("better-auth/cookies", () => ({
  deleteSessionCookie: vi.fn(),
}))

vi.mock("better-auth/plugins", () => ({
  emailOTP: vi.fn((options: Record<string, unknown>) => ({ id: "emailOTP", options })),
  organization: vi.fn((options: Record<string, unknown>) => ({ id: "organization", options })),
  bearer: vi.fn((options?: Record<string, unknown>) => ({ id: "bearer", options })),
}))

vi.mock("../../src/local-member-access.js", () => ({
  createLocalMemberAccessPlugin: createLocalMemberAccessPluginMock,
  isCustomerSessionActive: isCustomerSessionActiveMock,
  isLocalMemberDeactivated: vi.fn(async () => false),
  isLocalMemberEmailDeactivated: vi.fn(async () => false),
  isLocalMemberSessionActive: vi.fn(async () => true),
}))

vi.mock("../../src/workspace.js", () => ({
  isFirstAuthUser: isFirstAuthUserMock,
  provisionCurrentUserProfile: provisionCurrentUserProfileMock,
}))

describe("createBetterAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function latestBetterAuthConfig(): BetterAuthConfig {
    return betterAuthMock.mock.calls.at(-1)?.[0] as BetterAuthConfig
  }

  function createDbWithUserCount(count: number) {
    const from = vi.fn(async () => [{ count }])
    const select = vi.fn(() => ({ from }))
    return {
      db: { select },
      from,
      select,
    }
  }

  it("isolates the customer realm from admin tables, cookies, and plugins", async () => {
    const { createCustomerBetterAuth } = await import("../../src/server.js")

    createCustomerBetterAuth({
      db: { id: "db" } as never,
      secret: "c".repeat(32),
      baseURL: "https://shop.example.com",
      methods: {
        socialProviders: {
          google: { clientId: "google-id", clientSecret: "google-secret" },
          facebook: { clientId: "facebook-id", clientSecret: "facebook-secret" },
          apple: { clientId: "apple-id", clientSecret: "apple-secret" },
        },
      },
    })

    const config = latestBetterAuthConfig()
    expect(config.basePath).toBe("/auth/customer")
    expect(config.advanced).toMatchObject({ cookiePrefix: "voyant-customer" })
    expect(config.databaseHooks).toBeUndefined()
    expect(config.plugins.some((plugin) => plugin.id === "apiKey")).toBe(false)
    expect(config.plugins).toContainEqual(
      expect.objectContaining({ id: "voyant-local-member-access" }),
    )
    const accessPlugin = config.plugins.find((plugin) => plugin.id === "voyant-local-member-access")
    await expect(
      accessPlugin?.resolver?.isSessionActive?.("customer-session", "customer-user"),
    ).resolves.toBe(true)
    expect(isCustomerSessionActiveMock).toHaveBeenCalledWith(
      { id: "db" },
      "customer-session",
      "customer-user",
    )
    expect(config.plugins).toContainEqual(
      expect.objectContaining({
        id: "organization",
        options: expect.objectContaining({
          allowUserToCreateOrganization: false,
          disableOrganizationDeletion: true,
          invitationLimit: 0,
          requireEmailVerificationOnInvitation: true,
        }),
      }),
    )
    // Bearer enables direct (cross-origin / native) clients to authenticate with
    // an Authorization: Bearer <token> header instead of a cross-site cookie.
    expect(config.plugins).toContainEqual(expect.objectContaining({ id: "bearer" }))
    expect(config.socialProviders).toEqual(
      expect.objectContaining({
        google: expect.any(Object),
        facebook: expect.any(Object),
        apple: expect.any(Object),
      }),
    )
    expect(drizzleAdapterMock).toHaveBeenLastCalledWith(
      { id: "db" },
      expect.objectContaining({
        schema: expect.objectContaining({
          user: { name: "customerUser" },
          session: { name: "customerSession" },
          account: { name: "customerAccount" },
          verification: { name: "customerVerification" },
          organization: { name: "customerOrganization" },
          member: { name: "customerMember" },
          invitation: { name: "customerInvitation" },
        }),
      }),
    )
  })

  it("rejects extra schema collisions with reserved customer realm models", async () => {
    const { createCustomerBetterAuth } = await import("../../src/server.js")

    expect(() =>
      createCustomerBetterAuth({
        db: { id: "db" } as never,
        secret: "c".repeat(32),
        baseURL: "https://shop.example.com",
        extraSchema: { organization: { name: "attackerOrganization" } } as never,
      }),
    ).toThrow("extraSchema cannot override reserved auth model: organization")
  })

  it("defaults secure cookies on outside explicit local development", async () => {
    const { createBetterAuth } = await import("../../src/server.js")

    createBetterAuth({
      db: { id: "db" } as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
    })

    expect(latestBetterAuthConfig().advanced.useSecureCookies).toBe(true)
  })

  it("defaults secure cookies off in explicit local development", async () => {
    vi.stubEnv("NODE_ENV", "development")
    const { createBetterAuth } = await import("../../src/server.js")

    createBetterAuth({
      db: { id: "db" } as never,
      secret: "x".repeat(32),
      baseURL: "http://localhost:3000",
    })

    expect(latestBetterAuthConfig().advanced.useSecureCookies).toBe(false)
  })

  it("lets consumers override secure cookie handling for local HTTP", async () => {
    const { createBetterAuth } = await import("../../src/server.js")

    createBetterAuth({
      db: { id: "db" } as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      advanced: {
        useSecureCookies: false,
      },
    })

    expect(latestBetterAuthConfig().advanced.useSecureCookies).toBe(false)
  })

  it("forwards Better Auth advanced cookie options", async () => {
    const { createBetterAuth } = await import("../../src/server.js")

    createBetterAuth({
      db: { id: "db" } as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      advanced: {
        crossSubDomainCookies: {
          enabled: true,
          domain: ".example.com",
        },
        defaultCookieAttributes: {
          domain: ".example.com",
          sameSite: "lax",
        },
      },
    })

    expect(latestBetterAuthConfig().advanced).toMatchObject({
      crossSubDomainCookies: {
        enabled: true,
        domain: ".example.com",
      },
      defaultCookieAttributes: {
        domain: ".example.com",
        sameSite: "lax",
      },
      useSecureCookies: true,
    })
  })

  it("forwards Better Auth user options and keeps Voyant's default change-email setting", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const user = {
      additionalFields: {
        surfaces: {
          type: "string",
          required: false,
          input: true,
        },
      },
      deleteUser: {
        enabled: true,
      },
    } satisfies NonNullable<CreateBetterAuthOptions["user"]>

    createBetterAuth({
      db: { id: "db" } as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      user,
    })

    expect(betterAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: {
          ...user,
          changeEmail: {
            enabled: true,
          },
        },
      }),
    )
  })

  it("lets consumers override the default change-email setting", async () => {
    const { createBetterAuth } = await import("../../src/server.js")

    createBetterAuth({
      db: { id: "db" } as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      user: {
        changeEmail: {
          enabled: false,
        },
      },
    })

    expect(betterAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: {
          changeEmail: {
            enabled: false,
          },
        },
      }),
    )
  })

  it("merges extra Better Auth plugin tables into the Drizzle adapter schema", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const passkeyTable = { name: "passkey" }

    createBetterAuth({
      db: { id: "db" } as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      extraSchema: {
        passkey: passkeyTable,
      } as never,
    })

    const [, adapterConfig] = drizzleAdapterMock.mock.calls[0] as [
      unknown,
      { schema: Record<string, unknown> },
    ]

    expect(adapterConfig.schema).toMatchObject({
      user: { name: "user" },
      session: { name: "session" },
      account: { name: "account" },
      verification: { name: "verification" },
      apikey: { name: "apikey" },
      passkey: passkeyTable,
    })
  })

  it("uses secondary storage for Better Auth rate limits when provided", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const secondaryStorage = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    }

    createBetterAuth({
      db: { id: "db" } as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      secondaryStorage,
    })

    expect(betterAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        secondaryStorage,
        rateLimit: expect.objectContaining({
          enabled: true,
          storage: "secondary-storage",
        }),
      }),
    )
  })

  it("requires the realm-specific admin secret without legacy or claims fallbacks", async () => {
    const { getAuthSecret } = await import("../../src/server.js")
    const originalAdminAuthSecret = process.env.BETTER_AUTH_ADMIN_SECRET
    const originalBetterAuthSecret = process.env.BETTER_AUTH_SECRET
    try {
      delete process.env.BETTER_AUTH_ADMIN_SECRET
      process.env.BETTER_AUTH_SECRET = "b".repeat(40)
      expect(() => getAuthSecret()).toThrow(/BETTER_AUTH_ADMIN_SECRET/)
    } finally {
      if (originalAdminAuthSecret === undefined) delete process.env.BETTER_AUTH_ADMIN_SECRET
      else process.env.BETTER_AUTH_ADMIN_SECRET = originalAdminAuthSecret
      if (originalBetterAuthSecret === undefined) delete process.env.BETTER_AUTH_SECRET
      else process.env.BETTER_AUTH_SECRET = originalBetterAuthSecret
    }
  })

  it("defaults customer auth only from the customer realm secret", async () => {
    const { createCustomerBetterAuth } = await import("../../src/server.js")
    vi.stubEnv("BETTER_AUTH_ADMIN_SECRET", "a".repeat(40))
    vi.stubEnv("BETTER_AUTH_CUSTOMER_SECRET", "c".repeat(40))

    createCustomerBetterAuth({
      db: { id: "db" } as never,
      baseURL: "https://shop.example.com",
    })

    expect(latestBetterAuthConfig().secret).toBe("c".repeat(40))
  })

  it("does not fall back to the admin secret for customer auth", async () => {
    const { createCustomerBetterAuth } = await import("../../src/server.js")
    vi.stubEnv("BETTER_AUTH_ADMIN_SECRET", "a".repeat(40))
    vi.stubEnv("BETTER_AUTH_CUSTOMER_SECRET", "")

    expect(() =>
      createCustomerBetterAuth({
        db: { id: "db" } as never,
        baseURL: "https://shop.example.com",
      }),
    ).toThrow(/BETTER_AUTH_CUSTOMER_SECRET/)
  })

  it("preserves consumer plugins alongside Voyant's required auth plugins", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const jwtPlugin = { id: "jwt" }
    const customPlugin = { id: "custom", schema: { customTable: { name: "customTable" } } }

    createBetterAuth({
      db: { id: "db" } as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      plugins: [jwtPlugin, customPlugin] as never,
      extraSchema: {
        passkey: { name: "passkey" },
        customTable: { name: "customTable" },
      } as never,
    })

    expect(betterAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: [
          expect.objectContaining({ id: "apiKey" }),
          expect.objectContaining({ id: "emailOTP" }),
          expect.objectContaining({ id: "voyant-local-member-access" }),
          jwtPlugin,
          customPlugin,
        ],
      }),
    )
  })

  it("keeps the default signup block for admin users once any user exists", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const { db } = createDbWithUserCount(1)

    createBetterAuth({
      db: db as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
    })

    await expect(latestBetterAuthConfig().databaseHooks.user.create.before()).rejects.toThrow(
      "Sign-up is disabled. Ask an admin to invite you.",
    )
  })

  it("does not apply the default signup block to explicit non-admin surfaces", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const { db, select } = createDbWithUserCount(1)

    createBetterAuth({
      db: db as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
    })

    await expect(
      latestBetterAuthConfig().databaseHooks.user.create.before({
        surfaces: ["storefront"],
      }),
    ).resolves.toBeUndefined()
    expect(select).not.toHaveBeenCalled()
  })

  it("stamps configured customer surfaces on phone OTP self-signups before the signup block", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const { db, select } = createDbWithUserCount(1)

    createBetterAuth({
      db: db as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      customerSignupSurfaces: ["storefront"],
    })

    await expect(
      latestBetterAuthConfig().databaseHooks.user.create.before(
        {
          phoneNumber: "+40700000001",
          surfaces: ["admin"],
        },
        { path: "/auth/phone-number/verify" },
      ),
    ).resolves.toEqual({
      data: {
        phoneNumber: "+40700000001",
        surfaces: ["storefront"],
      },
    })
    expect(select).not.toHaveBeenCalled()
  })

  it("stamps configured customer surfaces on email OTP self-signups before the signup block", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const { db, select } = createDbWithUserCount(1)

    createBetterAuth({
      db: db as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      customerSignupSurfaces: ["storefront", "storefront", " "],
    })

    await expect(
      latestBetterAuthConfig().databaseHooks.user.create.before(
        {
          email: "ana@example.com",
          surfaces: ["admin"],
        },
        { path: "/sign-in/email-otp" },
      ),
    ).resolves.toEqual({
      data: {
        email: "ana@example.com",
        surfaces: ["storefront"],
      },
    })
    expect(select).not.toHaveBeenCalled()
  })

  it("stamps configured customer surfaces on email/password self-signups before the signup block", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const { db, select } = createDbWithUserCount(1)

    createBetterAuth({
      db: db as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      customerSignupSurfaces: ["customer"],
    })

    await expect(
      latestBetterAuthConfig().databaseHooks.user.create.before(
        {
          email: "ana@example.com",
          surfaces: ["admin"],
        },
        { path: "/auth/sign-up/email" },
      ),
    ).resolves.toEqual({
      data: {
        email: "ana@example.com",
        surfaces: ["customer"],
      },
    })
    expect(select).not.toHaveBeenCalled()
  })

  it("does not stamp customer surfaces on non-customer signup endpoints", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const { db } = createDbWithUserCount(1)

    createBetterAuth({
      db: db as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      customerSignupSurfaces: ["storefront"],
    })

    await expect(
      latestBetterAuthConfig().databaseHooks.user.create.before(
        {
          surfaces: ["admin"],
        },
        { path: "/auth/sign-in/email" },
      ),
    ).rejects.toThrow("Sign-up is disabled. Ask an admin to invite you.")
  })

  it("does not provision workspace profiles for customer self-signups", async () => {
    const { createBetterAuth } = await import("../../src/server.js")

    createBetterAuth({
      db: { id: "db" } as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      customerSignupSurfaces: ["customer"],
    })

    await latestBetterAuthConfig().databaseHooks.user.create.after(
      { id: "user_1", name: "Ana Customer", image: null },
      { path: "/auth/sign-up/email" },
    )

    expect(isFirstAuthUserMock).not.toHaveBeenCalled()
    expect(provisionCurrentUserProfileMock).not.toHaveBeenCalled()
  })

  it("still provisions workspace profiles for admin signups", async () => {
    const { createBetterAuth } = await import("../../src/server.js")

    createBetterAuth({
      db: { id: "db" } as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
    })

    await latestBetterAuthConfig().databaseHooks.user.create.after(
      { id: "user_1", name: "Ana Admin", image: null },
      { path: "/auth/sign-up/email" },
    )

    expect(isFirstAuthUserMock).toHaveBeenCalled()
    expect(provisionCurrentUserProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user_1",
        name: "Ana Admin",
      }),
    )
  })

  it("treats blank surface array entries as missing surfaces for the signup block", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const { db } = createDbWithUserCount(1)

    createBetterAuth({
      db: db as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
    })

    await expect(
      latestBetterAuthConfig().databaseHooks.user.create.before({
        surfaces: ["", "  "],
      }),
    ).rejects.toThrow("Sign-up is disabled. Ask an admin to invite you.")
  })

  it("lets consumers customize the surfaces guarded by the signup block", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const { db, select } = createDbWithUserCount(1)

    createBetterAuth({
      db: db as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      disableSignupWhenUsersExist: {
        surfaces: ["staff"],
      },
    })

    await expect(
      latestBetterAuthConfig().databaseHooks.user.create.before({
        surfaces: ["admin"],
      }),
    ).resolves.toBeUndefined()
    expect(select).not.toHaveBeenCalled()

    await expect(
      latestBetterAuthConfig().databaseHooks.user.create.before({
        surfaces: ["staff"],
      }),
    ).rejects.toThrow("Sign-up is disabled. Ask an admin to invite you.")
  })

  it("lets consumers disable the bundled signup block", async () => {
    const { createBetterAuth } = await import("../../src/server.js")
    const { db, select } = createDbWithUserCount(1)

    createBetterAuth({
      db: db as never,
      secret: "x".repeat(32),
      baseURL: "https://auth.example.com",
      disableSignupWhenUsersExist: {
        enabled: false,
      },
    })

    await expect(
      latestBetterAuthConfig().databaseHooks.user.create.before(),
    ).resolves.toBeUndefined()
    expect(select).not.toHaveBeenCalled()
  })
})
