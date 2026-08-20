import { cloudAuthUserLinks, userProfilesTable } from "@voyant-travel/db/schema/iam"
import type { VoyantDb } from "@voyant-travel/hono"
import type { AccessCatalog } from "@voyant-travel/types/api-keys"
import { hasApiKeyPermission, permissionStringsToPermissions } from "@voyant-travel/types/api-keys"
import { accessCatalogScopesForRole, isFullAccessRole } from "@voyant-travel/types/member-roles"
import { and, eq, isNull } from "drizzle-orm"

const FULL_ACCESS_SCOPES = ["*"]
const VOYANT_CLOUD_PROVIDER_ID = "voyant-cloud"

export type StaffAccessContext = {
  organizationId: string | null
  scopes: string[]
}

function scopesForOperatorRole(
  role: string | null | undefined,
  accessCatalog: AccessCatalog,
): string[] | null {
  const base = accessCatalogScopesForRole(role, accessCatalog)
  if (!base) return null
  const normalizedRole = (role ?? "").trim().toLowerCase()
  const presetId =
    normalizedRole === "member" ? "editor" : normalizedRole === "guest" ? "viewer" : normalizedRole
  const selected = accessCatalog.presets.find(
    (preset) => preset.kind === "staff" && preset.id === presetId,
  )
  return [...new Set([...base, ...(selected?.grants ?? [])])].sort()
}

/**
 * What "full access" resolves to when no role or permission set says otherwise.
 *
 * Not the bare `*` sentinel: `accessCatalogScopesForRole` expands a full-access
 * role to `*` **plus** every grant the catalog marks as one that `*` does not
 * satisfy. `FULL_ACCESS_SCOPES` remains the fallback for a deployment whose
 * catalog carries no such resources.
 */
function fullAccessScopes(accessCatalog: AccessCatalog): string[] {
  return scopesForOperatorRole("admin", accessCatalog) ?? FULL_ACCESS_SCOPES
}

/**
 * True when a stored scope set *is* the full-access sentinel rather than a
 * deliberately chosen list.
 *
 * The column holds `["*"]` for far more than unconfigured accounts: the local
 * team adapter writes `scopesForRole("admin")` and `scopesForRole("owner")`,
 * both of which are `["*"]`, and
 * `20260805000000_backfill_unassigned_member_permissions.sql` wrote the same
 * value over every previously-null row. So reading the column as "assigned,
 * therefore verbatim" would leave the expansion reaching only accounts with no
 * profile at all — which is to say, almost nobody.
 *
 * `hasApiKeyPermission(..., "*", "*")` is the same test the role layer uses in
 * `isFullAccessRole`, so `["catalog:read"]`, `["*:read"]` and `[]` are all
 * genuinely restricted and pass through untouched.
 */
function isFullAccessScopeSet(scopes: string[]): boolean {
  return hasApiKeyPermission(permissionStringsToPermissions(scopes), "*", "*")
}

export async function resolveStaffAccess(input: {
  accessCatalog: AccessCatalog
  authMode: "local" | "voyant-cloud"
  db: VoyantDb
  deploymentId?: string
  userId: string
}): Promise<StaffAccessContext | null> {
  if (input.authMode === "voyant-cloud") {
    const deploymentId = input.deploymentId?.trim()
    if (!deploymentId) return null

    const [link] = await input.db
      .select({
        deploymentId: cloudAuthUserLinks.deploymentId,
        platformOrganizationId: cloudAuthUserLinks.platformOrganizationId,
        providerId: cloudAuthUserLinks.providerId,
        revokedAt: cloudAuthUserLinks.revokedAt,
        roleSlug: cloudAuthUserLinks.roleSlug,
        scopes: cloudAuthUserLinks.scopes,
      })
      .from(cloudAuthUserLinks)
      .where(
        and(
          eq(cloudAuthUserLinks.userId, input.userId),
          eq(cloudAuthUserLinks.providerId, VOYANT_CLOUD_PROVIDER_ID),
          eq(cloudAuthUserLinks.deploymentId, deploymentId),
          isNull(cloudAuthUserLinks.revokedAt),
        ),
      )
      .limit(1)

    if (
      !link ||
      link.providerId !== VOYANT_CLOUD_PROVIDER_ID ||
      link.deploymentId !== deploymentId ||
      link.revokedAt ||
      !link.platformOrganizationId.trim()
    ) {
      return null
    }

    const roleScopes =
      scopesForOperatorRole(link.roleSlug, input.accessCatalog) ??
      fullAccessScopes(input.accessCatalog)
    return {
      organizationId: link.platformOrganizationId,
      scopes: isFullAccessRole(link.roleSlug) ? roleScopes : (link.scopes ?? roleScopes),
    }
  }

  // Local deployments have no staff organization context. Preserve the
  // existing profile-permission lookup and full-access compatibility fallback.
  const [profile] = await input.db
    .select({ permissions: userProfilesTable.permissions })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, input.userId))
    .limit(1)
  // Expand full access through the catalog, exactly as the managed branch above
  // does. A resource declared `wildcard: "explicit-resource"` is deliberately
  // not satisfied by `*`, so the bare sentinel locks a full-access local admin
  // out of every one of them — which is the opposite of what "full access"
  // means. A genuinely restricted permission set is still returned verbatim:
  // the point of the declaration is that a *restricted* member must have the
  // resource named, not that an unconfigured deployment has less authority than
  // a configured one.
  const stored = profile?.permissions
  return {
    organizationId: null,
    scopes:
      stored && !isFullAccessScopeSet(stored) ? stored : fullAccessScopes(input.accessCatalog),
  }
}
