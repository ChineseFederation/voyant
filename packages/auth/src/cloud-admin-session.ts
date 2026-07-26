import type { getDb } from "@voyant-travel/db"
import {
  authAccount,
  authUser,
  cloudAuthSessionLinks,
  cloudAuthUserLinks,
} from "@voyant-travel/db/schema/iam"
import { createAuthEndpoint } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import type { BetterAuthPlugin } from "better-auth/types"
import { and, eq } from "drizzle-orm"
import {
  markCloudAuthSessionRevalidated,
  markCloudAuthUserRevalidated,
  revokeCloudAuthUserAccess,
} from "./cloud-admin-session-revalidation-store.js"
import {
  type CloudAdminAssertion,
  type CloudAdminAuthExchangeConfig,
  type CloudAdminAuthRevalidateConfig,
  exchangeCloudAdminAuthCode,
  revalidateCloudAdminAuthAccess,
  verifyCloudAdminAuthCallback,
} from "./cloud-broker.js"
import { isFirstAuthUser, provisionCurrentUserProfile } from "./workspace.js"

export interface VoyantCloudAdminAuthPluginOptions {
  db: ReturnType<typeof getDb>
  cookieSecret: string
  /** Whether the externally visible callback is HTTPS, even behind an HTTP proxy hop. */
  secureStateCookie?: boolean
  exchange: CloudAdminAuthExchangeConfig
  fetch?: typeof fetch
  revalidateAfterSeconds?: number
  onUserProvisioning?: CloudAdminUserProvisioningHandler
}

export type VoyantCloudAdminSessionRevalidationInput = {
  db: ReturnType<typeof getDb>
  sessionId: string
  config: CloudAdminAuthRevalidateConfig
  fetch?: typeof fetch
  now?: Date
  revalidateAfterSeconds?: number
}

export type VoyantCloudAdminSessionRevalidationResult =
  | {
      ok: true
      status: "active" | "cached"
    }
  | {
      ok: false
      status: "revoked"
      reason?: string
    }

export type VoyantCloudAdminUserRevalidationInput = {
  db: ReturnType<typeof getDb>
  userId: string
  config: CloudAdminAuthRevalidateConfig
  fetch?: typeof fetch
  now?: Date
  revalidateAfterSeconds?: number
}

export type VoyantCloudAdminUserRevalidationResult =
  | {
      ok: true
      status: "active" | "cached"
    }
  | {
      ok: false
      status: "revoked"
      reason?: string
    }

const VOYANT_CLOUD_PROVIDER_ID = "voyant-cloud"
const DEFAULT_CLOUD_SESSION_REVALIDATE_AFTER_SECONDS = 15 * 60

type BetterAuthUserForCookie = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
  createdAt: Date
  updatedAt: Date
}

type BetterAuthSessionForCookie = {
  id: string
  token: string
  userId: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
  ipAddress?: string | null
  userAgent?: string | null
}

export type CloudAdminProvisionedUser = BetterAuthUserForCookie

export type CloudAdminUserProvisioningInput = {
  db: ReturnType<typeof getDb>
  assertion: CloudAdminAssertion
  user: CloudAdminProvisionedUser
  isNewUser: boolean
  provider: {
    providerId: typeof VOYANT_CLOUD_PROVIDER_ID
    providerAccountId: string
  }
}

export type CloudAdminUserProvisioningHandler = (
  input: CloudAdminUserProvisioningInput,
) => Promise<void> | void

export function createVoyantCloudAdminAuthPlugin(
  options: VoyantCloudAdminAuthPluginOptions,
): BetterAuthPlugin {
  return {
    id: "voyant-cloud-admin-auth",
    endpoints: {
      voyantCloudAdminAuthCallback: createAuthEndpoint(
        "/cloud/callback",
        { method: "GET", requireRequest: true },
        async (ctx) => {
          const callback = await verifyCloudAdminAuthCallback({
            requestUrl: ctx.request.url,
            cookieHeader: ctx.headers?.get("cookie") ?? ctx.request.headers.get("cookie"),
            cookieSecret: options.cookieSecret,
            secureCookie: options.secureStateCookie,
          })
          ctx.setHeader("Set-Cookie", callback.clearCookie)

          if (!callback.ok) {
            const status = callback.error === "cloud_error" ? 401 : 400
            return ctx.json(
              {
                error: callback.error,
                ...(callback.cloudError ? { cloudError: callback.cloudError } : {}),
              },
              { status },
            )
          }

          let assertion: CloudAdminAssertion
          try {
            assertion = await exchangeCloudAdminAuthCode({
              code: callback.code,
              state: callback.state,
              config: options.exchange,
              ...(options.fetch ? { fetch: options.fetch } : {}),
            })
          } catch (error) {
            ctx.context.logger.error("[auth/cloud/callback] Exchange error", error)
            return ctx.json({ error: "Voyant Cloud auth exchange failed" }, { status: 401 })
          }

          const user = await upsertVoyantCloudMirrorUser(options.db, assertion, {
            onUserProvisioning: options.onUserProvisioning,
          })
          const session = (await ctx.context.internalAdapter.createSession(
            user.id,
          )) as BetterAuthSessionForCookie
          await upsertVoyantCloudSessionLink(options.db, {
            assertion,
            session,
            revalidateAfterSeconds:
              options.revalidateAfterSeconds ?? DEFAULT_CLOUD_SESSION_REVALIDATE_AFTER_SECONDS,
          })
          await setSessionCookie(ctx, { session, user })

          throw ctx.redirect(callback.state.next)
        },
      ),
    },
  }
}

export async function revalidateVoyantCloudAdminAuthSession({
  db,
  sessionId,
  config,
  fetch,
  now = new Date(),
  revalidateAfterSeconds = DEFAULT_CLOUD_SESSION_REVALIDATE_AFTER_SECONDS,
}: VoyantCloudAdminSessionRevalidationInput): Promise<VoyantCloudAdminSessionRevalidationResult> {
  const [sessionLink] = await db
    .select()
    .from(cloudAuthSessionLinks)
    .where(eq(cloudAuthSessionLinks.sessionId, sessionId))
    .limit(1)

  if (!sessionLink || sessionLink.revokedAt) {
    return { ok: false, status: "revoked", reason: "missing_or_revoked_session" }
  }

  const currentDeploymentId = config.deploymentId.trim()
  const [userLink] = await db
    .select({
      deploymentId: cloudAuthUserLinks.deploymentId,
      revokedAt: cloudAuthUserLinks.revokedAt,
    })
    .from(cloudAuthUserLinks)
    .where(eq(cloudAuthUserLinks.userId, sessionLink.userId))
    .limit(1)

  // Staff access binds to cloud_auth_user_links.deployment_id. After a managed
  // deploy cutover that advances VOYANT_CLOUD_DEPLOYMENT_ID, a still-valid
  // session can be cached against the previous deployment id and strand
  // /v1/admin/* with 401 while /auth/me keeps working. Skip the revalidation
  // cache whenever either link still points at a different deployment so we
  // confirm platform access for the active runtime before retargeting.
  const deploymentDrifted =
    Boolean(currentDeploymentId) &&
    (sessionLink.deploymentId !== currentDeploymentId ||
      (userLink != null && !userLink.revokedAt && userLink.deploymentId !== currentDeploymentId))

  if (sessionLink.revalidateAfter > now && !deploymentDrifted) {
    return { ok: true, status: "cached" }
  }

  const revalidation = await revalidateCloudAdminAuthAccess({
    workosUserId: sessionLink.providerAccountId,
    config,
    ...(fetch ? { fetch } : {}),
  })

  if (revalidation.ok) {
    await markCloudAuthSessionRevalidated(db, {
      sessionId: sessionLink.sessionId,
      userId: sessionLink.userId,
      now,
      revalidateAfterSeconds,
      deploymentId: currentDeploymentId,
    })
    // Refresh the cached RBAC scopes so a permission change applied while the
    // member is signed in takes effect at the next revalidation, not only at
    // next login (member-rbac-rfc, voyant#2085). `undefined` ⇒ older platform
    // didn't send scopes; leave the column as-is.
    if (revalidation.scopes !== undefined) {
      await db
        .update(cloudAuthUserLinks)
        .set({ scopes: revalidation.scopes, updatedAt: now })
        .where(eq(cloudAuthUserLinks.userId, sessionLink.userId))
    }
    return { ok: true, status: "active" }
  }

  await revokeCloudAuthUserAccess(db, {
    sessionId: sessionLink.sessionId,
    userId: sessionLink.userId,
    now,
  })

  return {
    ok: false,
    status: "revoked",
    reason: revalidation.reason,
  }
}

export async function revalidateVoyantCloudAdminAuthUser({
  db,
  userId,
  config,
  fetch,
  now = new Date(),
  revalidateAfterSeconds = DEFAULT_CLOUD_SESSION_REVALIDATE_AFTER_SECONDS,
}: VoyantCloudAdminUserRevalidationInput): Promise<VoyantCloudAdminUserRevalidationResult> {
  const [userLink] = await db
    .select()
    .from(cloudAuthUserLinks)
    .where(eq(cloudAuthUserLinks.userId, userId))
    .limit(1)

  if (!userLink || userLink.revokedAt) {
    return { ok: false, status: "revoked", reason: "missing_or_revoked_user" }
  }

  const currentDeploymentId = config.deploymentId.trim()
  const deploymentDrifted =
    Boolean(currentDeploymentId) && userLink.deploymentId !== currentDeploymentId

  const nextRevalidationAt = userLink.lastRevalidatedAt
    ? new Date(userLink.lastRevalidatedAt.getTime() + revalidateAfterSeconds * 1000)
    : null
  if (nextRevalidationAt && nextRevalidationAt > now && !deploymentDrifted) {
    return { ok: true, status: "cached" }
  }

  const revalidation = await revalidateCloudAdminAuthAccess({
    workosUserId: userLink.providerAccountId,
    config,
    ...(fetch ? { fetch } : {}),
  })

  if (revalidation.ok) {
    await markCloudAuthUserRevalidated(db, {
      userId: userLink.userId,
      now,
      deploymentId: currentDeploymentId,
    })
    return { ok: true, status: "active" }
  }

  await revokeCloudAuthUserAccess(db, {
    userId: userLink.userId,
    now,
  })

  return {
    ok: false,
    status: "revoked",
    reason: revalidation.reason,
  }
}

async function upsertVoyantCloudMirrorUser(
  db: ReturnType<typeof getDb>,
  assertion: CloudAdminAssertion,
  options: {
    onUserProvisioning?: CloudAdminUserProvisioningHandler
  } = {},
): Promise<BetterAuthUserForCookie> {
  const now = new Date()
  const providerAccountId = assertion.workosUserId
  const displayName = cloudAssertionDisplayName(assertion)
  const existingUser = await findCloudMirrorUser(
    db,
    providerAccountId,
    assertion.email,
    assertion.emailVerified,
  )
  const isNewUser = !existingUser
  const userId = existingUser?.id ?? crypto.randomUUID()

  if (existingUser) {
    await db
      .update(authUser)
      .set({
        name: displayName,
        email: assertion.email,
        emailVerified: assertion.emailVerified,
        image: assertion.image ?? null,
        updatedAt: now,
      })
      .where(eq(authUser.id, existingUser.id))
  } else {
    await db.insert(authUser).values({
      id: userId,
      name: displayName,
      email: assertion.email,
      emailVerified: assertion.emailVerified,
      image: assertion.image ?? null,
      createdAt: now,
      updatedAt: now,
    })
  }

  await db
    .insert(authAccount)
    .values({
      id: cloudAuthAccountId(providerAccountId),
      userId,
      accountId: providerAccountId,
      providerId: VOYANT_CLOUD_PROVIDER_ID,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [authAccount.providerId, authAccount.accountId],
      set: {
        userId,
        updatedAt: now,
      },
    })

  await upsertVoyantCloudUserLink(db, userId, assertion, now)

  await provisionCurrentUserProfile(db, {
    userId,
    name: displayName,
    image: assertion.image,
    isSuperAdmin: await isFirstAuthUser(db),
  })

  const [user] = await db
    .select({
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      emailVerified: authUser.emailVerified,
      image: authUser.image,
      createdAt: authUser.createdAt,
      updatedAt: authUser.updatedAt,
    })
    .from(authUser)
    .where(eq(authUser.id, userId))
    .limit(1)

  if (!user?.email) {
    throw new Error("Voyant Cloud auth mirror user was not provisioned")
  }

  const provisionedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }

  await options.onUserProvisioning?.({
    db,
    assertion,
    user: provisionedUser,
    isNewUser,
    provider: {
      providerId: VOYANT_CLOUD_PROVIDER_ID,
      providerAccountId,
    },
  })

  return provisionedUser
}

async function findCloudMirrorUser(
  db: ReturnType<typeof getDb>,
  providerAccountId: string,
  email?: string,
  emailVerified?: boolean,
): Promise<{ id: string } | null> {
  const [linked] = await db
    .select({ id: authUser.id })
    .from(cloudAuthUserLinks)
    .innerJoin(authUser, eq(authUser.id, cloudAuthUserLinks.userId))
    .where(
      and(
        eq(cloudAuthUserLinks.providerId, VOYANT_CLOUD_PROVIDER_ID),
        eq(cloudAuthUserLinks.providerAccountId, providerAccountId),
      ),
    )
    .limit(1)

  if (linked) return linked

  const [account] = await db
    .select({ id: authUser.id })
    .from(authAccount)
    .innerJoin(authUser, eq(authUser.id, authAccount.userId))
    .where(
      and(
        eq(authAccount.providerId, VOYANT_CLOUD_PROVIDER_ID),
        eq(authAccount.accountId, providerAccountId),
      ),
    )
    .limit(1)

  if (account) return account
  if (!email || emailVerified !== true) return null

  const [emailUser] = await db
    .select({ id: authUser.id })
    .from(authUser)
    .where(eq(authUser.email, email))
    .limit(1)

  return emailUser ?? null
}

function cloudAuthUserLinkValues(
  userId: string,
  assertion: CloudAdminAssertion,
  now: Date,
): typeof cloudAuthUserLinks.$inferInsert {
  return {
    userId,
    providerId: VOYANT_CLOUD_PROVIDER_ID,
    providerAccountId: assertion.workosUserId,
    deploymentId: assertion.deploymentId,
    platformOrganizationId: assertion.platformOrganizationId,
    workosOrganizationId: assertion.workosOrganizationId,
    membershipId: assertion.membershipId ?? null,
    roleSlug: assertion.roleSlug ?? null,
    roleName: assertion.roleName ?? null,
    surfaces: assertion.surfaces ?? [],
    // Member RBAC scope set from the assertion. `null` (not `[]`) when the
    // platform sent none, so resolveAuthRequest can tell "no scopes claim"
    // (derive from role / full-access fallback) from "explicitly empty".
    scopes: assertion.scopes ?? null,
    lastAssertionAt: new Date(assertion.iat * 1000),
    lastRevalidatedAt: now,
    revokedAt: null,
    updatedAt: now,
  }
}

async function upsertVoyantCloudUserLink(
  db: ReturnType<typeof getDb>,
  userId: string,
  assertion: CloudAdminAssertion,
  now: Date,
): Promise<void> {
  const values = cloudAuthUserLinkValues(userId, assertion, now)
  const [existingForUser] = await db
    .select({ userId: cloudAuthUserLinks.userId })
    .from(cloudAuthUserLinks)
    .where(eq(cloudAuthUserLinks.userId, userId))
    .limit(1)

  if (existingForUser) {
    await db
      .update(cloudAuthUserLinks)
      .set({
        ...values,
        userId,
        revokedAt: null,
      })
      .where(eq(cloudAuthUserLinks.userId, userId))
    return
  }

  await db
    .insert(cloudAuthUserLinks)
    .values(values)
    .onConflictDoUpdate({
      target: [cloudAuthUserLinks.providerId, cloudAuthUserLinks.providerAccountId],
      set: {
        ...values,
        userId,
        revokedAt: null,
      },
    })
}

async function upsertVoyantCloudSessionLink(
  db: ReturnType<typeof getDb>,
  input: {
    assertion: CloudAdminAssertion
    session: BetterAuthSessionForCookie
    revalidateAfterSeconds: number
  },
): Promise<void> {
  const now = new Date()
  await db.insert(cloudAuthSessionLinks).values({
    sessionId: input.session.id,
    userId: input.session.userId,
    providerId: VOYANT_CLOUD_PROVIDER_ID,
    providerAccountId: input.assertion.workosUserId,
    deploymentId: input.assertion.deploymentId,
    revalidateAfter: new Date(now.getTime() + input.revalidateAfterSeconds * 1000),
    lastRevalidatedAt: now,
    revokedAt: null,
    updatedAt: now,
  })
}

function cloudAssertionDisplayName(assertion: CloudAdminAssertion): string {
  const fromParts = [assertion.firstName, assertion.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ")
  return assertion.name?.trim() || fromParts || assertion.email
}

function cloudAuthAccountId(providerAccountId: string): string {
  return `acc_${VOYANT_CLOUD_PROVIDER_ID}_${providerAccountId}`
}
