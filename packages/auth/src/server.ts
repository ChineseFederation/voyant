// agent-quality: file-size exception -- owner: auth; the Better Auth factory keeps realm table maps, plugin composition, and signup/cookie policy in one place so admin and customer realms cannot drift apart. Already over the limit before the MCP OAuth tables were registered here.
import { apiKey } from "@better-auth/api-key"
import { getDb } from "@voyant-travel/db"
import {
  apikeyTable,
  authAccount,
  authSession,
  authUser,
  authVerification,
  customerAuthAccount,
  customerAuthInvitation,
  customerAuthMember,
  customerAuthOrganization,
  customerAuthSession,
  customerAuthUser,
  customerAuthVerification,
  jwksTable,
  oauthAccessTokenTable,
  oauthClientTable,
  oauthConsentTable,
  oauthRefreshTokenTable,
} from "@voyant-travel/db/schema/iam"
import { type BetterAuthOptions, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { bearer, emailOTP, organization } from "better-auth/plugins"
import type { BetterAuthPlugin } from "better-auth/types"
import { sql } from "drizzle-orm"
import type { AnyPgTable } from "drizzle-orm/pg-core"
import {
  type CustomerBuyerAccountPolicy,
  normalizeCustomerBuyerAccountPolicy,
} from "./customer-buyer-accounts.js"
import {
  createLocalMemberAccessPlugin,
  isCustomerSessionActive,
  isLocalMemberDeactivated,
  isLocalMemberEmailDeactivated,
  isLocalMemberSessionActive,
} from "./local-member-access.js"
import { expandTrustedOrigins, getTrustedOrigins } from "./trusted-origins.js"
import { isFirstAuthUser, provisionCurrentUserProfile } from "./workspace.js"

export function getAuthSecret(realm: "admin" | "customer" = "admin"): string {
  const envName = realm === "customer" ? "BETTER_AUTH_CUSTOMER_SECRET" : "BETTER_AUTH_ADMIN_SECRET"
  const secret = process.env[envName] || ""

  if (!secret || secret.length < 32) {
    throw new Error(`Missing ${envName} with at least 32 characters`)
  }

  return secret
}

export type {
  AccountProfileUpdateHandler,
  ApiTokenRotationStore,
  BetterAuthApiTokenManagement,
  HandleAccountProfileRequestOptions,
  HandleApiTokenManagementRequestOptions,
  HandleOrganizationMembersRequestOptions,
  OrganizationMemberRecord,
  OrganizationMembersListHandler,
  OrganizationMembersListInput,
} from "./auth-facades.js"
export {
  handleAccountProfileRequest,
  handleApiTokenManagementRequest,
  handleOrganizationMembersRequest,
} from "./auth-facades.js"

type DefinedBetterAuthUserOptions<UserOptions extends BetterAuthOptions["user"]> =
  UserOptions extends undefined ? Record<PropertyKey, never> : NonNullable<UserOptions>

type ResolvedBetterAuthChangeEmail<UserOptions extends BetterAuthOptions["user"]> =
  DefinedBetterAuthUserOptions<UserOptions> extends { changeEmail?: infer ChangeEmail }
    ? ChangeEmail extends { enabled: infer Enabled }
      ? Omit<ChangeEmail, "enabled"> & { enabled: Enabled }
      : NonNullable<ChangeEmail> & { enabled: true }
    : { enabled: true }

type ResolvedBetterAuthUserOptions<UserOptions extends BetterAuthOptions["user"]> = Omit<
  DefinedBetterAuthUserOptions<UserOptions>,
  "changeEmail"
> & {
  changeEmail: ResolvedBetterAuthChangeEmail<UserOptions>
}

/**
 * The bundled plugins were previously spelled as a tuple of their concrete
 * `ReturnType`s. Better Auth's plugin types have since grown richer than the
 * `BetterAuthPlugin` constraint they must satisfy, so that tuple no longer
 * type-checks against `betterAuth<TOptions>` — and because it was already
 * unioned with `BetterAuthPlugin[]`, it bought no endpoint precision at any
 * call site. Widen to the constraint itself.
 */
type ResolvedBetterAuthPlugins<_Plugins extends BetterAuthPlugin[] | undefined> = BetterAuthPlugin[]

const DEFAULT_SIGNUP_BLOCK_SURFACES = ["admin"] as const
const CUSTOMER_SIGNUP_ENDPOINT_SUFFIXES = [
  "/sign-up/email",
  "/phone-number/verify",
  "/sign-in/email-otp",
] as const

export interface DisableSignupWhenUsersExistOptions {
  /**
   * Set to false when the consuming app owns all signup admission checks.
   *
   * Defaults to true.
   */
  enabled?: boolean
  /**
   * User surfaces that should keep the single-tenant signup guard. New users
   * with only other explicit surfaces can still be created by customer-facing
   * auth plugins such as phone OTP.
   *
   * Defaults to ["admin"]. Users without an explicit surfaces array are
   * treated as admin users for backward compatibility.
   */
  surfaces?: readonly string[]
}

type BetterAuthCreateBeforeResult =
  | boolean
  | undefined
  | {
      data: Record<string, unknown>
    }

type SignupBlockUserPayload = {
  surfaces?: unknown
}

type BetterAuthHookContext = {
  path?: string
}

function normalizeSignupBlockSurfaces(
  options: DisableSignupWhenUsersExistOptions | undefined,
): readonly string[] {
  return options?.surfaces ?? DEFAULT_SIGNUP_BLOCK_SURFACES
}

function isSignupBlockEnabled(options: DisableSignupWhenUsersExistOptions | undefined): boolean {
  return options?.enabled !== false
}

function normalizeSurfaceList(surfaces: readonly string[] | undefined): readonly string[] {
  if (!surfaces) return []

  const normalized = new Set<string>()
  for (const surface of surfaces) {
    const trimmed = surface.trim()
    if (trimmed.length > 0) {
      normalized.add(trimmed)
    }
  }
  return Array.from(normalized)
}

function signupBlockAppliesToUser(
  user: SignupBlockUserPayload | undefined,
  blockedSurfaces: readonly string[],
): boolean {
  if (blockedSurfaces.length === 0) return false

  const surfaces = user?.surfaces
  if (Array.isArray(surfaces)) {
    const explicitSurfaces = surfaces.filter(
      (surface): surface is string => typeof surface === "string" && surface.trim().length > 0,
    )
    if (explicitSurfaces.length > 0) {
      return explicitSurfaces.some((surface) => blockedSurfaces.includes(surface.trim()))
    }
  }

  if (typeof surfaces === "string" && surfaces.trim().length > 0) {
    return blockedSurfaces.includes(surfaces.trim())
  }

  return blockedSurfaces.includes("admin")
}

function isCustomerSignupCreate(context: BetterAuthHookContext | null | undefined): boolean {
  const path = context?.path
  if (!path) return false

  return CUSTOMER_SIGNUP_ENDPOINT_SUFFIXES.some((suffix) => path.endsWith(suffix))
}

function stampCustomerSignupSurfaces(
  user: SignupBlockUserPayload | undefined,
  context: BetterAuthHookContext | null | undefined,
  surfaces: readonly string[],
): SignupBlockUserPayload | undefined {
  if (surfaces.length === 0 || !isCustomerSignupCreate(context)) {
    return user
  }

  return {
    ...(user ?? {}),
    surfaces,
  }
}

type ResolvedCreateBetterAuthOptions<
  UserOptions extends BetterAuthOptions["user"],
  Plugins extends BetterAuthPlugin[] | undefined,
> = Omit<BetterAuthOptions, "plugins" | "user"> & {
  plugins: ResolvedBetterAuthPlugins<Plugins>
  user: ResolvedBetterAuthUserOptions<UserOptions>
}

export type BetterAuthDrizzleSchema = Record<string, AnyPgTable>

export type VoyantAuthRealm = "admin" | "customer"

export interface BetterAuthRealmTables {
  user: AnyPgTable
  session: AnyPgTable
  account: AnyPgTable
  verification: AnyPgTable
  apikey?: AnyPgTable
  /**
   * OAuth 2.1 authorization-server tables. Admin-realm only: the MCP connector
   * flow issues grants against staff identities, so the customer realm has no
   * authorization server of its own.
   */
  oauthClient?: AnyPgTable
  oauthAccessToken?: AnyPgTable
  oauthRefreshToken?: AnyPgTable
  oauthConsent?: AnyPgTable
  /** Signing keys for the JWT access tokens issued to MCP connectors. */
  jwks?: AnyPgTable
}

const ADMIN_AUTH_TABLES: BetterAuthRealmTables = {
  user: authUser,
  session: authSession,
  account: authAccount,
  verification: authVerification,
  apikey: apikeyTable,
  oauthClient: oauthClientTable,
  oauthAccessToken: oauthAccessTokenTable,
  oauthRefreshToken: oauthRefreshTokenTable,
  oauthConsent: oauthConsentTable,
  jwks: jwksTable,
}

const CUSTOMER_AUTH_TABLES = {
  user: customerAuthUser,
  session: customerAuthSession,
  account: customerAuthAccount,
  verification: customerAuthVerification,
  organization: customerAuthOrganization,
  member: customerAuthMember,
  invitation: customerAuthInvitation,
} satisfies BetterAuthRealmTables & BetterAuthDrizzleSchema

export interface CreateBetterAuthOptions<
  UserOptions extends BetterAuthOptions["user"] = BetterAuthOptions["user"],
  Plugins extends BetterAuthPlugin[] | undefined = BetterAuthPlugin[] | undefined,
> {
  db?: ReturnType<typeof getDb>
  secret?: string
  baseURL?: string
  basePath?: string
  trustedOrigins?: string[]
  /** Security realm. Existing callers default to the isolated admin realm. */
  realm?: VoyantAuthRealm
  /** Override only when an adapter owns a compatible Better Auth schema. */
  realmTables?: BetterAuthRealmTables
  /**
   * Additional Drizzle tables for Better Auth plugins. The consuming app owns
   * matching migrations for every table passed here.
   */
  extraSchema?: BetterAuthDrizzleSchema
  plugins?: Plugins
  user?: UserOptions
  /** Resolved credentials; the auth package never persists provider secrets. */
  socialProviders?: BetterAuthOptions["socialProviders"]
  emailCodeEnabled?: boolean
  emailPasswordEnabled?: boolean
  /**
   * Surfaces stamped on Better Auth customer self-signups before the bundled
   * single-tenant signup guard evaluates the new user. Applies to Better
   * Auth OTP signup endpoints that create a user as part of verification.
   *
   * Leave undefined to preserve Better Auth's raw user payload.
   */
  customerSignupSurfaces?: readonly string[]
  disableSignupWhenUsersExist?: DisableSignupWhenUsersExistOptions
  /** Called when a user requests a password reset. If not provided, logs to console. */
  sendResetPassword?: (data: {
    user: { email: string; name: string }
    url: string
    token: string
  }) => Promise<void>
  /** Called to send a verification OTP. If not provided, logs to console. */
  sendVerificationOTP?: (data: { email: string; otp: string; type: string }) => Promise<void>
  /**
   * Better Auth session cookie cache: session data rides in a short-lived
   * signed cookie. Enabled by default with a 5-minute TTL. Voyant still
   * validates local membership and session existence against Postgres so a
   * deleted session cannot be revived from the cookie cache. Pass `false` to
   * disable payload caching, or tune `maxAge` (seconds).
   */
  sessionCookieCache?: false | { maxAge?: number }
  /** Better Auth secondary storage, typically Redis/KV, used for distributed rate limits. */
  secondaryStorage?: BetterAuthOptions["secondaryStorage"]
  /** Better Auth rate-limit config. Defaults to secondary storage when present. */
  rateLimit?: BetterAuthOptions["rateLimit"]
  /**
   * Additional Better Auth advanced options. Voyant supplies secure cookies
   * by default except in explicit local development. Set
   * `advanced.useSecureCookies` to override that default.
   */
  advanced?: BetterAuthOptions["advanced"]
}

/**
 * Framework-agnostic Better Auth factory.
 *
 * Accepts optional overrides for db, secret, baseURL, trustedOrigins.
 * Does NOT depend on Next.js — safe to use in Hono workers, TanStack Start, etc.
 */
export function createBetterAuth<
  const UserOptions extends BetterAuthOptions["user"] = undefined,
  const Plugins extends BetterAuthPlugin[] | undefined = undefined,
>(options: CreateBetterAuthOptions<UserOptions, Plugins> = {}) {
  const realm = options.realm ?? "admin"
  const db = options.db ?? getDb("edge")
  const secret = options.secret ?? getAuthSecret(realm)
  const baseURL =
    options.baseURL ??
    process.env.BETTER_AUTH_URL ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  const trustedOrigins = expandTrustedOrigins(
    options.trustedOrigins ?? getTrustedOrigins(),
    baseURL,
  )
  const extraPlugins = options.plugins ?? []
  const realmTables =
    options.realmTables ?? (realm === "customer" ? CUSTOMER_AUTH_TABLES : ADMIN_AUTH_TABLES)
  const signupBlockSurfaces = normalizeSignupBlockSurfaces(options.disableSignupWhenUsersExist)
  const signupBlockEnabled = isSignupBlockEnabled(options.disableSignupWhenUsersExist)
  const customerSignupSurfaces = normalizeSurfaceList(options.customerSignupSurfaces)
  const reservedSchemaCollision = Object.keys(options.extraSchema ?? {}).find((modelName) =>
    Object.hasOwn(realmTables, modelName),
  )
  if (reservedSchemaCollision) {
    throw new Error(`extraSchema cannot override reserved auth model: ${reservedSchemaCollision}`)
  }
  const schema = {
    ...realmTables,
    ...(options.extraSchema ?? {}),
  } satisfies BetterAuthDrizzleSchema
  const rateLimit =
    options.rateLimit ??
    (options.secondaryStorage
      ? ({
          enabled: true,
          window: 60,
          max: 100,
          storage: "secondary-storage",
        } as BetterAuthOptions["rateLimit"])
      : undefined)

  const authOptions = {
    appName: "Voyant",
    baseURL,
    ...(options.basePath ? { basePath: options.basePath } : {}),
    secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    ...(options.secondaryStorage ? { secondaryStorage: options.secondaryStorage } : {}),
    ...(rateLimit ? { rateLimit } : {}),
    ...(options.sessionCookieCache === false
      ? {}
      : {
          session: {
            cookieCache: {
              enabled: true,
              maxAge: options.sessionCookieCache?.maxAge ?? 300,
            },
          },
        }),
    emailAndPassword: {
      enabled: options.emailPasswordEnabled !== false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      // eslint-disable-next-line @typescript-eslint/require-await -- owner: auth; existing suppression is intentional pending typed cleanup.
      sendResetPassword:
        options.sendResetPassword ??
        (async ({ user, url }) => {
          console.warn(
            `[Auth] No email provider configured — password reset for ${user.email}: ${url}`,
          )
        }),
    },
    emailVerification: {
      sendOnSignUp: false, // OTP plugin handles this
      autoSignInAfterVerification: true,
    },
    user: {
      ...options.user,
      changeEmail: {
        enabled: true,
        ...options.user?.changeEmail,
      },
    } as ResolvedBetterAuthUserOptions<UserOptions>,
    socialProviders: options.socialProviders ?? {},
    trustedOrigins,
    plugins: [
      ...(realm === "admin"
        ? [
            apiKey({
              defaultPrefix: "voy_",
              apiKeyHeaders: ["authorization"],
              requireName: true,
              keyExpiration: {
                defaultExpiresIn: null,
              },
            }),
          ]
        : []),
      ...(options.emailCodeEnabled === false
        ? []
        : [
            emailOTP({
              // eslint-disable-next-line @typescript-eslint/require-await -- owner: auth; existing suppression is intentional pending typed cleanup.
              sendVerificationOTP:
                options.sendVerificationOTP ??
                (async ({ email, otp, type }) => {
                  console.warn(`[Auth] OTP for ${email}: ${otp} (${type})`)
                }),
              otpLength: 6,
              expiresIn: 600,
              sendVerificationOnSignUp: true,
              changeEmail: {
                enabled: true,
              },
            }),
          ]),
      createLocalMemberAccessPlugin(
        realm === "admin"
          ? {
              isEmailDeactivated: (email) => isLocalMemberEmailDeactivated(db, email),
              isSessionActive: (sessionId, userId) =>
                isLocalMemberSessionActive(db, sessionId, userId),
              isUserDeactivated: (userId) => isLocalMemberDeactivated(db, userId),
            }
          : {
              isEmailDeactivated: async () => false,
              isSessionActive: (sessionId, userId) =>
                isCustomerSessionActive(db, sessionId, userId),
              isUserDeactivated: async () => false,
            },
      ),
      ...extraPlugins,
    ] as ResolvedBetterAuthPlugins<Plugins>,
    ...(realm === "admin"
      ? {
          databaseHooks: {
            user: {
              create: {
                // Single-tenant: once a user exists, reject any new-user creation.
                // Covers email sign-up AND social-provider sign-up (Google would
                // otherwise auto-create a user on first OAuth callback). Existing
                // social sign-ins still work because this hook only fires on CREATE.
                // Seed scripts do raw drizzle inserts, so they bypass this hook —
                // which is intentional.
                before: async (user, context): Promise<BetterAuthCreateBeforeResult> => {
                  const normalizedUser = stampCustomerSignupSurfaces(
                    user as SignupBlockUserPayload,
                    context as BetterAuthHookContext | null,
                    customerSignupSurfaces,
                  )

                  if (
                    !signupBlockEnabled ||
                    !signupBlockAppliesToUser(normalizedUser, signupBlockSurfaces)
                  ) {
                    if (normalizedUser === user) {
                      return
                    }
                    return { data: normalizedUser as Record<string, unknown> }
                  }

                  const [row] = await db
                    .select({ count: sql<number>`count(*)::int` })
                    .from(realmTables.user)
                  if ((row?.count ?? 0) > 0) {
                    throw new Error("Sign-up is disabled. Ask an admin to invite you.")
                  }

                  if (normalizedUser !== user) {
                    return { data: normalizedUser as Record<string, unknown> }
                  }
                },
                after: async (user, context) => {
                  if (
                    customerSignupSurfaces.length > 0 &&
                    isCustomerSignupCreate(context as BetterAuthHookContext | null)
                  ) {
                    return
                  }

                  // Single-tenant bootstrap: the very first user to register becomes
                  // the super-admin. Runs atomically after the `user` row is
                  // inserted, so a simple COUNT(*) = 1 check identifies them.
                  await provisionCurrentUserProfile(db, {
                    userId: user.id,
                    name: user.name,
                    image: user.image,
                    isSuperAdmin: await isFirstAuthUser(db),
                  })
                },
              },
            },
          },
        }
      : {}),
    advanced: {
      ...options.advanced,
      cookiePrefix:
        options.advanced?.cookiePrefix ??
        (realm === "customer" ? "voyant-customer" : "voyant-admin"),
      useSecureCookies:
        options.advanced?.useSecureCookies ?? process.env.NODE_ENV !== "development",
    },
  } as ResolvedCreateBetterAuthOptions<UserOptions, Plugins>

  return betterAuth<ResolvedCreateBetterAuthOptions<UserOptions, Plugins>>(authOptions)
}

export type CreateAdminBetterAuthOptions<
  UserOptions extends BetterAuthOptions["user"] = BetterAuthOptions["user"],
  Plugins extends BetterAuthPlugin[] | undefined = BetterAuthPlugin[] | undefined,
> = Omit<CreateBetterAuthOptions<UserOptions, Plugins>, "realm" | "realmTables">

export function createAdminBetterAuth<
  const UserOptions extends BetterAuthOptions["user"] = undefined,
  const Plugins extends BetterAuthPlugin[] | undefined = undefined,
>(options: CreateAdminBetterAuthOptions<UserOptions, Plugins> = {}) {
  return createBetterAuth({
    ...options,
    realm: "admin",
    realmTables: ADMIN_AUTH_TABLES,
    basePath: options.basePath ?? "/auth/admin",
  })
}

export interface CustomerAuthMethods {
  emailCode?: boolean
  emailPassword?: boolean
  /** Better Auth provider configs such as google, facebook, and apple. */
  socialProviders?: BetterAuthOptions["socialProviders"]
}

export type CreateCustomerBetterAuthOptions<
  UserOptions extends BetterAuthOptions["user"] = BetterAuthOptions["user"],
  Plugins extends BetterAuthPlugin[] | undefined = BetterAuthPlugin[] | undefined,
> = Omit<
  CreateBetterAuthOptions<UserOptions, Plugins>,
  | "realm"
  | "realmTables"
  | "customerSignupSurfaces"
  | "disableSignupWhenUsersExist"
  | "socialProviders"
  | "emailCodeEnabled"
  | "emailPasswordEnabled"
> & {
  methods?: CustomerAuthMethods
  accountPolicy?: CustomerBuyerAccountPolicy | null
  sendOrganizationInvitation?: (
    data: {
      id: string
      role: string
      email: string
      organization: { id: string; name: string; slug: string }
      invitation: {
        id: string
        email: string
        role: string
        organizationId: string
        inviterId: string
        status: string
        expiresAt: Date
      }
      inviter: {
        id: string
        role: string
        user: { id: string; name: string; email: string }
      }
    },
    request?: Request,
  ) => Promise<void>
}

/** Storefront realm factory with isolated tables, cookies, secret, and routes. */
export function createCustomerBetterAuth<
  const UserOptions extends BetterAuthOptions["user"] = undefined,
  const Plugins extends BetterAuthPlugin[] | undefined = undefined,
>(options: CreateCustomerBetterAuthOptions<UserOptions, Plugins> = {}) {
  const accountPolicy = normalizeCustomerBuyerAccountPolicy(options.accountPolicy)
  const customerOrganizationPlugin = organization({
    // A Better Auth organization is only the membership container. Public
    // creation cannot also create/link the canonical Relationships Organization,
    // so onboarding must go through the provider-neutral orchestration seam.
    allowUserToCreateOrganization: false,
    disableOrganizationDeletion: true,
    requireEmailVerificationOnInvitation: true,
    invitationLimit: options.sendOrganizationInvitation ? 100 : 0,
    ...(options.sendOrganizationInvitation
      ? { sendInvitationEmail: options.sendOrganizationInvitation }
      : {}),
    schema: {
      organization: {
        additionalFields: {
          relationshipOrganizationId: {
            type: "string",
            required: false,
            input: false,
          },
        },
      },
    },
  })

  return createBetterAuth({
    ...options,
    realm: "customer",
    realmTables: CUSTOMER_AUTH_TABLES,
    basePath: options.basePath ?? "/auth/customer",
    disableSignupWhenUsersExist: { enabled: false },
    emailCodeEnabled: options.methods?.emailCode ?? true,
    emailPasswordEnabled: options.methods?.emailPassword ?? true,
    socialProviders: options.methods?.socialProviders,
    user: {
      ...options.user,
      additionalFields: {
        ...options.user?.additionalFields,
        personalBuyerEntitlementEligible: {
          type: "boolean",
          required: true,
          input: false,
          defaultValue:
            accountPolicy.allowedKinds.includes("personal") &&
            accountPolicy.personalSignup === "open",
        },
        relationshipPersonId: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    extraSchema: options.extraSchema,
    // `bearer` lets a direct (cross-origin / native) client authenticate with an
    // `Authorization: Bearer <token>` header instead of a cookie: on sign-in
    // Better Auth returns the session token via `set-auth-token`, and the bearer
    // hook converts the presented token back into a session on later calls. The
    // BFF/same-origin path keeps using host-only cookies untouched. Direct
    // clients dodge third-party-cookie deprecation this way.
    plugins: [customerOrganizationPlugin, bearer(), ...(options.plugins ?? [])],
  })
}
