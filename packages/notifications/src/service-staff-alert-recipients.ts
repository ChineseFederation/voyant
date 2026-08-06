/**
 * Turning routing configuration into a list of addresses.
 *
 * Reads `user`, `user_profiles` and `cloud_auth_user_links` from
 * `@voyant-travel/db/schema/iam`. That is allowed and is not a table-privacy
 * reach-in: `db` is a foundation package, exempt by the checker, and staff
 * identity has no owning business module to route through.
 */

import { authUser, cloudAuthUserLinks, userProfilesTable } from "@voyant-travel/db/schema/iam"
import { eq, isNull } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { ResolvedStaffAlertSetting } from "./service-staff-alerts.js"

export interface StaffAlertRecipient {
  email: string
  /** Null for literal extra addresses — shared mailboxes are not users. */
  userId: string | null
  /** Preferred locale, when the recipient is a known user. */
  locale: string | null
  /** True when this recipient owns the record the alert is about. */
  isAssignee: boolean
}

/**
 * Full-access roles, which every alert reaches regardless of configured roles.
 *
 * An operator who switches an alert on and picks only `member` still expects
 * the account owner to see it; the alternative is an owner silently missing
 * cancellations because they never added themselves to a list.
 */
const FULL_ACCESS_ROLE_SLUGS = new Set(["owner", "admin", "super-admin"])

interface StaffUserRow {
  userId: string
  email: string | null
  locale: string | null
  /** Role slug where the realm has one, else null. */
  roleSlug: string | null
  /** True when the user's scope set is unrestricted. */
  fullAccess: boolean
}

/**
 * Every staff user that could receive an alert, across both auth realms.
 *
 * Queries local profiles and cloud links and unions them rather than branching
 * on a configured auth mode: a local deployment has no `cloud_auth_user_links`
 * rows and a cloud deployment's staff have no local permission rows, so the
 * union is exactly the staff of whichever realm is in use and needs no mode
 * flag threaded down here.
 *
 * ON LOCAL DEPLOYMENTS THERE ARE NO ROLE SLUGS. Local staff carry a scope set
 * on `user_profiles.permissions` and nothing else — the Better Auth `member`
 * table is empty because the operator realm has no organization. So local users
 * resolve to a coarse two-level role: unrestricted scopes read as `admin`,
 * anything else as `member`. That is a real limitation of the current identity
 * model, not a simplification chosen here; finer role routing needs staff roles
 * to exist locally first.
 */
async function listStaffUsers(db: PostgresJsDatabase): Promise<StaffUserRow[]> {
  const [localRows, cloudRows] = await Promise.all([
    db
      .select({
        userId: authUser.id,
        email: authUser.email,
        locale: userProfilesTable.locale,
        permissions: userProfilesTable.permissions,
      })
      .from(authUser)
      .leftJoin(userProfilesTable, eq(userProfilesTable.id, authUser.id)),
    db
      .select({
        userId: cloudAuthUserLinks.userId,
        roleSlug: cloudAuthUserLinks.roleSlug,
        scopes: cloudAuthUserLinks.scopes,
      })
      .from(cloudAuthUserLinks)
      .where(isNull(cloudAuthUserLinks.revokedAt)),
  ])

  const cloudByUserId = new Map(cloudRows.map((row) => [row.userId, row]))

  return localRows.map((row) => {
    const cloud = cloudByUserId.get(row.userId)
    if (cloud) {
      return {
        userId: row.userId,
        email: row.email,
        locale: row.locale,
        roleSlug: cloud.roleSlug,
        fullAccess: hasUnrestrictedScopes(cloud.scopes),
      }
    }

    // `null` permissions means "never explicitly assigned", which
    // `resolveStaffAccess` treats as full access — mirror that here rather
    // than inventing a stricter reading that would drop the sole admin of a
    // fresh deployment out of every alert.
    const fullAccess = row.permissions === null || hasUnrestrictedScopes(row.permissions)
    return {
      userId: row.userId,
      email: row.email,
      locale: row.locale,
      roleSlug: fullAccess ? "admin" : "member",
      fullAccess,
    }
  })
}

function hasUnrestrictedScopes(scopes: string[] | null | undefined): boolean {
  if (!scopes) return false
  return scopes.includes("*")
}

export interface ResolveStaffAlertRecipientsInput {
  db: PostgresJsDatabase
  setting: ResolvedStaffAlertSetting
  /** Staff user who owns the record, when the alert supports assignee routing. */
  assigneeUserId: string | null
  /** Staff user who caused the event; excluded from the result. */
  actorUserId: string | null
  /** Users who have explicitly turned this alert off. */
  optedOutUserIds: ReadonlySet<string>
}

/**
 * The addresses one staff alert should reach.
 *
 * Order of operations matters: build from routing, then subtract. Building from
 * opt-INS instead would send to nobody, because a user who has never opened the
 * preferences page has no row.
 */
export async function resolveStaffAlertRecipients(
  input: ResolveStaffAlertRecipientsInput,
): Promise<StaffAlertRecipient[]> {
  const { setting } = input
  const wantsUsers = setting.routeToAssignee || setting.routeToRoles.length > 0
  const users = wantsUsers ? await listStaffUsers(input.db) : []
  const roleFilter = new Set(setting.routeToRoles)

  // Keyed by lowercased email: the same human can arrive as an assignee, via a
  // role, and again as a literal address, and must receive one email.
  const byEmail = new Map<string, StaffAlertRecipient>()

  const add = (candidate: StaffAlertRecipient) => {
    const key = candidate.email.trim().toLowerCase()
    if (!key) return
    const existing = byEmail.get(key)
    if (!existing) {
      byEmail.set(key, { ...candidate, email: key })
      return
    }
    // Assignee framing is the more specific one, and a known user id lets the
    // recipient be opted out — neither may be lost to a later duplicate.
    byEmail.set(key, {
      ...existing,
      isAssignee: existing.isAssignee || candidate.isAssignee,
      userId: existing.userId ?? candidate.userId,
      locale: existing.locale ?? candidate.locale,
    })
  }

  if (setting.routeToAssignee && input.assigneeUserId) {
    const assignee = users.find((user) => user.userId === input.assigneeUserId)
    if (assignee?.email) {
      add({
        email: assignee.email,
        userId: assignee.userId,
        locale: assignee.locale,
        isAssignee: true,
      })
    }
  }

  if (roleFilter.size > 0) {
    for (const user of users) {
      if (!user.email) continue
      const slug = user.roleSlug ?? ""
      const matches = roleFilter.has(slug) || (user.fullAccess && FULL_ACCESS_ROLE_SLUGS.has(slug))
      if (!matches) continue
      add({ email: user.email, userId: user.userId, locale: user.locale, isAssignee: false })
    }
  }

  for (const address of setting.extraAddresses) {
    add({ email: address, userId: null, locale: null, isAssignee: false })
  }

  return [...byEmail.values()].filter((recipient) => {
    if (recipient.userId === null) return true
    if (recipient.userId === input.actorUserId) return false
    return !input.optedOutUserIds.has(recipient.userId)
  })
}

/** Look up one user's address, for the settings page's "send test" action. */
export async function findStaffUserEmail(
  db: PostgresJsDatabase,
  userId: string,
): Promise<{ email: string; locale: string | null } | null> {
  const [row] = await db
    .select({ email: authUser.email, locale: userProfilesTable.locale })
    .from(authUser)
    .leftJoin(userProfilesTable, eq(userProfilesTable.id, authUser.id))
    .where(eq(authUser.id, userId))
    .limit(1)
  if (!row?.email) return null
  return { email: row.email, locale: row.locale }
}
