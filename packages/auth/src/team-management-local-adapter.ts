import { newId } from "@voyant-travel/db/lib/typeid"
import {
  apikeyTable,
  authAccount,
  authSession,
  authUser,
  userInvitationsTable,
  userProfilesTable,
} from "@voyant-travel/db/schema/iam"
import { scopesForRole } from "@voyant-travel/types/member-roles"
import { desc, eq, sql } from "drizzle-orm"

import type { IdentityAccessRuntimeProvider } from "./identity-access-runtime-port.js"
import { isDeactivatedProviderId, localProviderIdForStatus } from "./local-member-access.js"
import { type TeamManagementAdapter, TeamManagementError } from "./team-management-policy.js"
import type {
  CreatedTeamInvitationDto,
  InviteTeamMemberInput,
  TeamInvitationDto,
  TeamManagementCapabilitiesDto,
  TeamManagementRequestContext,
  TeamMemberDto,
  TeamRoleDto,
} from "./team-management-runtime-port.js"

const LOCAL_ROLES: TeamRoleDto[] = [
  { id: "owner", name: "Owner", description: "Full access, including ownership changes." },
  { id: "admin", name: "Admin", description: "Full access to team and operator settings." },
  { id: "editor", name: "Editor", description: "Can manage day-to-day operator data." },
  { id: "viewer", name: "Viewer", description: "Read-only operator access." },
]

const ROLE_LEVELS: Record<string, number> = { owner: 40, admin: 30, editor: 20, viewer: 10 }

type TransactionDb<TDb> = TDb extends {
  transaction<TResult>(
    callback: (transaction: infer TTransaction) => Promise<TResult>,
  ): Promise<TResult>
}
  ? TTransaction
  : never

type LocalTeamDb =
  | TeamManagementRequestContext["db"]
  | TransactionDb<TeamManagementRequestContext["db"]>
type LocalTeamRequestContext = Omit<TeamManagementRequestContext, "db"> & { db: LocalTeamDb }

export { localProviderIdForStatus } from "./local-member-access.js"

function roleName(roleId: string): string {
  return LOCAL_ROLES.find((role) => role.id === roleId)?.name ?? roleId
}

function sameScopes(left: readonly string[], right: readonly string[]) {
  return [...left].sort().join("\0") === [...right].sort().join("\0")
}

function resolveLocalRole(isSuperAdmin: boolean, permissions: string[] | null): string {
  if (isSuperAdmin) return "owner"
  if (permissions === null || permissions.includes("*")) return "admin"
  if (sameScopes(permissions, scopesForRole("editor") ?? [])) return "editor"
  if (sameScopes(permissions, scopesForRole("viewer") ?? [])) return "viewer"
  return "custom"
}

function permissionsForRole(roleId: string): string[] {
  const scopes = scopesForRole(roleId)
  if (!scopes) throw new TeamManagementError("role_not_found", "Team role not found.", 404)
  return [...scopes]
}

function invitationRole(metadata: Record<string, unknown> | null): string {
  const roleId = metadata?.roleId
  return typeof roleId === "string" && ROLE_LEVELS[roleId] !== undefined ? roleId : "editor"
}

function invitationStatus(input: {
  redeemedAt: Date | null
  expiresAt: Date
}): TeamInvitationDto["status"] {
  if (input.redeemedAt) return "accepted"
  if (input.expiresAt.getTime() <= Date.now()) return "expired"
  return "pending"
}

function randomTokenBase64Url(bytes: number): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  let binary = ""
  for (const byte of buffer) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function listLocalMembers(context: LocalTeamRequestContext): Promise<TeamMemberDto[]> {
  const [rows, accounts] = await Promise.all([
    context.db
      .select({
        id: authUser.id,
        email: authUser.email,
        authName: authUser.name,
        createdAt: authUser.createdAt,
        firstName: userProfilesTable.firstName,
        lastName: userProfilesTable.lastName,
        isSuperAdmin: userProfilesTable.isSuperAdmin,
        permissions: userProfilesTable.permissions,
        lastActiveAt: userProfilesTable.lastActiveAt,
      })
      .from(authUser)
      .leftJoin(userProfilesTable, eq(userProfilesTable.id, authUser.id)),
    context.db
      .select({ userId: authAccount.userId, providerId: authAccount.providerId })
      .from(authAccount),
  ])
  const activeUserIds = new Set(
    accounts
      .filter((account) => !isDeactivatedProviderId(account.providerId))
      .map((account) => account.userId),
  )

  return rows.map((row) => {
    const roleId = resolveLocalRole(row.isSuperAdmin ?? false, row.permissions ?? null)
    const profileName = [row.firstName, row.lastName].filter(Boolean).join(" ").trim()
    return {
      id: row.id,
      email: row.email,
      name: profileName || row.authName || null,
      roleId,
      roleName: roleName(roleId),
      status: activeUserIds.has(row.id) ? "active" : "deactivated",
      joinedAt: row.createdAt?.toISOString() ?? null,
      lastActivityAt: row.lastActiveAt?.toISOString() ?? null,
    }
  })
}

function memberOrThrow(members: TeamMemberDto[], memberId: string): TeamMemberDto {
  const member = members.find((candidate) => candidate.id === memberId)
  if (!member) throw new TeamManagementError("member_not_found", "Team member not found.", 404)
  return member
}

function assertActiveOwnerRemains(members: TeamMemberDto[], target: TeamMemberDto): void {
  if (target.status !== "active" || target.roleId !== "owner") return
  const activeOwnerCount = members.filter(
    (member) => member.status === "active" && member.roleId === "owner",
  ).length
  if (activeOwnerCount <= 1) {
    throw new TeamManagementError(
      "last_owner",
      "The last active owner cannot be demoted or deactivated.",
      409,
    )
  }
}

async function withLockedLocalTeam<T>(
  context: TeamManagementRequestContext,
  operation: (transactionContext: LocalTeamRequestContext) => Promise<T>,
): Promise<T> {
  return context.db.transaction(async (transaction) => {
    // agent-quality: raw-sql reviewed -- owner: auth; table identifiers are static Drizzle schema objects.
    await transaction.execute(
      sql`SELECT ${authUser.id} FROM ${authUser} ORDER BY ${authUser.id} FOR UPDATE`,
    )
    return operation({ ...context, db: transaction })
  })
}

export function createLocalTeamManagementAdapter(
  identityAccess: IdentityAccessRuntimeProvider,
): TeamManagementAdapter {
  return {
    async getActor(context) {
      const actor = (await listLocalMembers(context)).find((member) => member.id === context.userId)
      if (actor?.status !== "active") {
        throw new TeamManagementError("forbidden", "The current user cannot manage this team.")
      }
      return { memberId: actor.id, roleId: actor.roleId }
    },
    async getCapabilities(_context, actor): Promise<TeamManagementCapabilitiesDto> {
      const canManage = actor.roleId === "owner" || actor.roleId === "admin"
      return {
        viewMembers: true,
        inviteMembers: canManage,
        manageRoles: canManage,
        activateMembers: canManage,
        deactivateMembers: canManage,
        revokeInvitations: canManage,
      }
    },
    listMembers: listLocalMembers,
    async listRoles() {
      return LOCAL_ROLES
    },
    async listInvitations(context) {
      const rows = await context.db
        .select({
          id: userInvitationsTable.id,
          email: userInvitationsTable.email,
          metadata: userInvitationsTable.metadata,
          expiresAt: userInvitationsTable.expiresAt,
          redeemedAt: userInvitationsTable.redeemedAt,
          createdAt: userInvitationsTable.createdAt,
        })
        .from(userInvitationsTable)
        .orderBy(desc(userInvitationsTable.createdAt))
        .limit(100)
      return rows.map((row) => {
        const roleId = invitationRole(row.metadata)
        return {
          id: row.id,
          email: row.email,
          roleId,
          roleName: roleName(roleId),
          status: invitationStatus(row),
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        }
      })
    },
    async inviteMember(context, input: InviteTeamMemberInput): Promise<CreatedTeamInvitationDto> {
      const email = input.email.trim().toLowerCase()
      const [existingUser] = await context.db
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.email, email))
        .limit(1)
      if (existingUser) {
        throw new TeamManagementError(
          "forbidden",
          "A team member with this email already exists.",
          409,
        )
      }

      const rawToken = randomTokenBase64Url(32)
      const expiresInDays = input.expiresInDays ?? 3
      const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000)
      const now = new Date()
      const id = newId("user_invitations")
      await context.db.insert(userInvitationsTable).values({
        id,
        email,
        tokenHash: await sha256Hex(rawToken),
        expiresAt,
        createdBy: context.userId,
        metadata: { roleId: input.roleId },
        createdAt: now,
      })

      const { appUrl } = identityAccess.resolveDeployment(context.bindings)
      const acceptUrl = `${appUrl}/accept-invite?token=${encodeURIComponent(rawToken)}`
      await identityAccess.sendInvitationEmail(context.bindings, {
        acceptUrl,
        expiresInHours: expiresInDays * 24,
        to: email,
      })
      return {
        id,
        email,
        roleId: input.roleId,
        roleName: roleName(input.roleId),
        status: "pending",
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        acceptUrl,
      }
    },
    async revokeInvitation(context, invitationId) {
      await context.db.delete(userInvitationsTable).where(eq(userInvitationsTable.id, invitationId))
    },
    async updateMemberRole(context, memberId, roleId) {
      return withLockedLocalTeam(context, async (transactionContext) => {
        const members = await listLocalMembers(transactionContext)
        const target = memberOrThrow(members, memberId)
        if (roleId !== "owner") assertActiveOwnerRemains(members, target)

        await transactionContext.db
          .update(userProfilesTable)
          .set({
            isSuperAdmin: roleId === "owner",
            permissions: permissionsForRole(roleId),
            updatedAt: new Date(),
          })
          .where(eq(userProfilesTable.id, memberId))
        return memberOrThrow(await listLocalMembers(transactionContext), memberId)
      })
    },
    async deactivateMember(context, memberId) {
      return withLockedLocalTeam(context, async (transactionContext) => {
        const members = await listLocalMembers(transactionContext)
        assertActiveOwnerRemains(members, memberOrThrow(members, memberId))

        await transactionContext.db.delete(authSession).where(eq(authSession.userId, memberId))
        await transactionContext.db.delete(apikeyTable).where(eq(apikeyTable.referenceId, memberId))
        const accounts = await transactionContext.db
          .select({ id: authAccount.id, providerId: authAccount.providerId })
          .from(authAccount)
          .where(eq(authAccount.userId, memberId))
        for (const account of accounts) {
          await transactionContext.db
            .update(authAccount)
            .set({ providerId: localProviderIdForStatus(account.providerId, "deactivated") })
            .where(eq(authAccount.id, account.id))
        }
        return memberOrThrow(await listLocalMembers(transactionContext), memberId)
      })
    },
    async activateMember(context, memberId) {
      return withLockedLocalTeam(context, async (transactionContext) => {
        memberOrThrow(await listLocalMembers(transactionContext), memberId)
        const accounts = await transactionContext.db
          .select({ id: authAccount.id, providerId: authAccount.providerId })
          .from(authAccount)
          .where(eq(authAccount.userId, memberId))
        for (const account of accounts) {
          await transactionContext.db
            .update(authAccount)
            .set({ providerId: localProviderIdForStatus(account.providerId, "active") })
            .where(eq(authAccount.id, account.id))
        }
        const member = memberOrThrow(await listLocalMembers(transactionContext), memberId)
        if (member.status !== "active") {
          throw new TeamManagementError(
            "activation_unavailable",
            "This local member has no sign-in account to reactivate.",
            409,
          )
        }
        return member
      })
    },
    roleLevel(roleId) {
      return ROLE_LEVELS[roleId] ?? 0
    },
    isOwnerRole(roleId) {
      return roleId === "owner"
    },
  }
}

export function localRoleForRedeemedInvitation(metadata: Record<string, unknown> | null): {
  isSuperAdmin: boolean
  permissions: string[]
} {
  const roleId = invitationRole(metadata)
  return { isSuperAdmin: roleId === "owner", permissions: permissionsForRole(roleId) }
}
