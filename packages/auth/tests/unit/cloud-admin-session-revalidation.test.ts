import {
  apikeyTable,
  cloudAuthSessionLinks,
  cloudAuthUserLinks,
} from "@voyant-travel/db/schema/iam"
import { describe, expect, it, vi } from "vitest"

import {
  revalidateVoyantCloudAdminAuthSession,
  revalidateVoyantCloudAdminAuthUser,
} from "../../src/cloud-admin-session.js"
import { resolveStaffAccess } from "../../src/staff-access.js"

const NOW = new Date("2026-07-26T12:00:00.000Z")
const PREVIOUS_DEPLOYMENT_ID = "dep_previous"
const CURRENT_DEPLOYMENT_ID = "dep_current"
const ACCESS_CATALOG = { resources: [], presets: [] }

type SessionLink = {
  sessionId: string
  userId: string
  providerId: string
  providerAccountId: string
  deploymentId: string
  revalidateAfter: Date
  lastRevalidatedAt: Date | null
  revokedAt: Date | null
  updatedAt?: Date
}

type UserLink = {
  userId: string
  providerId: string
  providerAccountId: string
  deploymentId: string
  platformOrganizationId: string
  roleSlug: string | null
  scopes: string[] | null
  lastRevalidatedAt: Date | null
  revokedAt: Date | null
  updatedAt?: Date
}

function createLinkStore(input: { session?: SessionLink; user: UserLink }) {
  const session = input.session ? { ...input.session } : null
  const user = { ...input.user }
  const apiKeys: Array<{ referenceId: string; enabled: boolean; updatedAt?: Date }> = [
    { referenceId: user.userId, enabled: true },
  ]

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async (count: number) => {
            if (table === cloudAuthSessionLinks) {
              return (session ? [session] : []).slice(0, count)
            }
            if (table === cloudAuthUserLinks) {
              return [user].slice(0, count)
            }
            return []
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === cloudAuthSessionLinks && session) {
            Object.assign(session, values)
            return
          }
          if (table === cloudAuthUserLinks) {
            Object.assign(user, values)
            return
          }
          if (table === apikeyTable) {
            for (const key of apiKeys) {
              if (key.referenceId === user.userId) Object.assign(key, values)
            }
          }
        },
      }),
    }),
  }

  return { db: db as never, session, user, apiKeys }
}

function sessionLink(overrides: Partial<SessionLink> = {}): SessionLink {
  return {
    sessionId: "sess_1",
    userId: "user_1",
    providerId: "voyant-cloud",
    providerAccountId: "user_workos_1",
    deploymentId: PREVIOUS_DEPLOYMENT_ID,
    revalidateAfter: new Date("2026-07-26T11:00:00.000Z"),
    lastRevalidatedAt: new Date("2026-07-26T10:45:00.000Z"),
    revokedAt: null,
    ...overrides,
  }
}

function userLink(overrides: Partial<UserLink> = {}): UserLink {
  return {
    userId: "user_1",
    providerId: "voyant-cloud",
    providerAccountId: "user_workos_1",
    deploymentId: PREVIOUS_DEPLOYMENT_ID,
    platformOrganizationId: "org_platform_1",
    roleSlug: "admin",
    scopes: ["*"],
    lastRevalidatedAt: new Date("2026-07-26T10:45:00.000Z"),
    revokedAt: null,
    ...overrides,
  }
}

const revalidateConfig = {
  revalidateUrl: "https://api.voyant.travel/cloud/v1/admin-auth/revalidate",
  deploymentId: CURRENT_DEPLOYMENT_ID,
  clientToken: "client_token_1",
}

describe("cloud admin session revalidation redeploy drift", () => {
  it("retargets the cloud-auth user link to the current deployment after a successful revalidate", async () => {
    const store = createLinkStore({
      session: sessionLink(),
      user: userLink(),
    })
    const fetch = vi.fn(async () => Response.json({ ok: true, status: "active" }))

    const result = await revalidateVoyantCloudAdminAuthSession({
      db: store.db,
      sessionId: "sess_1",
      config: revalidateConfig,
      fetch: fetch as typeof globalThis.fetch,
      now: NOW,
    })

    expect(result).toEqual({ ok: true, status: "active" })
    expect(fetch).toHaveBeenCalledOnce()
    expect(store.user.deploymentId).toBe(CURRENT_DEPLOYMENT_ID)
    expect(store.session?.deploymentId).toBe(CURRENT_DEPLOYMENT_ID)

    const staffDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [store.user],
          }),
        }),
      }),
    }
    await expect(
      resolveStaffAccess({
        accessCatalog: ACCESS_CATALOG,
        authMode: "voyant-cloud",
        db: staffDb as never,
        deploymentId: CURRENT_DEPLOYMENT_ID,
        userId: "user_1",
      }),
    ).resolves.toMatchObject({
      organizationId: "org_platform_1",
    })
  })

  it("forces platform revalidation and retargets when the cached session still points at a previous deployment", async () => {
    const store = createLinkStore({
      session: sessionLink({
        revalidateAfter: new Date("2026-07-26T13:00:00.000Z"),
      }),
      user: userLink(),
    })
    const fetch = vi.fn(async () => Response.json({ ok: true, status: "active" }))

    const result = await revalidateVoyantCloudAdminAuthSession({
      db: store.db,
      sessionId: "sess_1",
      config: revalidateConfig,
      fetch: fetch as typeof globalThis.fetch,
      now: NOW,
    })

    expect(result).toEqual({ ok: true, status: "active" })
    expect(fetch).toHaveBeenCalledOnce()
    expect(store.user.deploymentId).toBe(CURRENT_DEPLOYMENT_ID)
    expect(store.session?.deploymentId).toBe(CURRENT_DEPLOYMENT_ID)
  })

  it("does not retarget or revive links when platform revalidation revokes access", async () => {
    const store = createLinkStore({
      session: sessionLink(),
      user: userLink(),
    })
    const fetch = vi.fn(async () =>
      Response.json({ ok: false, status: "revoked", reason: "no_membership" }, { status: 403 }),
    )

    const result = await revalidateVoyantCloudAdminAuthSession({
      db: store.db,
      sessionId: "sess_1",
      config: revalidateConfig,
      fetch: fetch as typeof globalThis.fetch,
      now: NOW,
    })

    expect(result).toEqual({
      ok: false,
      status: "revoked",
      reason: "no_membership",
    })
    expect(store.user.deploymentId).toBe(PREVIOUS_DEPLOYMENT_ID)
    expect(store.user.revokedAt).toEqual(NOW)
    expect(store.session?.revokedAt).toEqual(NOW)
    expect(store.apiKeys[0]?.enabled).toBe(false)
  })

  it("keeps the revalidation cache when the link already matches the current deployment", async () => {
    const store = createLinkStore({
      session: sessionLink({
        deploymentId: CURRENT_DEPLOYMENT_ID,
        revalidateAfter: new Date("2026-07-26T13:00:00.000Z"),
      }),
      user: userLink({ deploymentId: CURRENT_DEPLOYMENT_ID }),
    })
    const fetch = vi.fn(async () => Response.json({ ok: true, status: "active" }))

    await expect(
      revalidateVoyantCloudAdminAuthSession({
        db: store.db,
        sessionId: "sess_1",
        config: revalidateConfig,
        fetch: fetch as typeof globalThis.fetch,
        now: NOW,
      }),
    ).resolves.toEqual({ ok: true, status: "cached" })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("retargets the user link on successful user-level revalidation after deploy cutover", async () => {
    const store = createLinkStore({
      user: userLink({
        lastRevalidatedAt: new Date("2026-07-26T11:00:00.000Z"),
      }),
    })
    const fetch = vi.fn(async () => Response.json({ ok: true, status: "active" }))

    const result = await revalidateVoyantCloudAdminAuthUser({
      db: store.db,
      userId: "user_1",
      config: revalidateConfig,
      fetch: fetch as typeof globalThis.fetch,
      now: NOW,
      revalidateAfterSeconds: 60,
    })

    expect(result).toEqual({ ok: true, status: "active" })
    expect(fetch).toHaveBeenCalledOnce()
    expect(store.user.deploymentId).toBe(CURRENT_DEPLOYMENT_ID)
    expect(store.user.revokedAt).toBeNull()
  })
})
