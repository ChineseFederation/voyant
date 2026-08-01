/**
 * Member RBAC — role presets and scope resolution.
 *
 * Staff members are granted the SAME permission vocabulary as API keys
 * (`resource:action`, see ./api-keys), so one model and one `hasApiKeyPermission`
 * gate cover both. This module adds the people-facing layer: preset role bundles
 * (Admin / Editor / Viewer) and a resolver from a role slug to a scope set.
 *
 * Presets are NON-BINDING convenience defaults — the assignment UI lets an admin
 * start from a preset and then toggle any module's view/edit per member. See
 * docs/architecture/member-rbac-rfc.md (voyant#2085).
 */
import {
  type AccessCatalog,
  type ApiKeyPermissionString,
  type ApiKeyPermissions,
  hasApiKeyPermission,
  permissionsToStrings,
} from "./api-keys.js"

/**
 * Canonical staff role slugs. Mirrors the `roles` DB enum and the WorkOS org
 * roles a deployment maps from (`owner`/`admin` → admin; `member`/`viewer` →
 * editor/viewer). "custom" is any explicit set that matches no preset.
 */
export const MEMBER_ROLES = [
  "super-admin",
  "admin",
  "editor",
  "viewer",
  "member",
  "guest",
  "custom",
] as const

export type MemberRole = (typeof MEMBER_ROLES)[number]

/**
 * Operational resources an Editor can read+write. Deliberately excludes the
 * admin-only surfaces (team, settings) and the money-write/destructive actions,
 * which stay Admin-only. `finance` is read-only by default here (overridable per
 * member in the assignment UI).
 */
const EDITOR_READ_WRITE_RESOURCES = [
  "catalog",
  "products",
  "proposals",
  "trips",
  "crm",
  "availability",
  "pricing",
  "suppliers",
  "itineraries",
  "departures",
  "accommodations",
  "ground",
  "legal",
  "notifications",
  "resources",
] as const

function editorPermissions(): ApiKeyPermissions {
  const permissions: ApiKeyPermissions = {}
  for (const resource of EDITOR_READ_WRITE_RESOURCES) {
    permissions[resource] = ["read", "write"]
  }
  // Default-on, fully overridable: an Editor can see finance figures but not
  // issue/void. Admins toggle this per member in the assignment UI.
  permissions.finance = ["read"]
  return permissions
}

export interface MemberRolePreset {
  label: string
  description: string
  permissions: ApiKeyPermissions
}

/**
 * Named preset bundles. The assignment UI offers these as starting points; the
 * stored grant is the resolved permission set, not the preset name.
 */
export const MEMBER_ROLE_PRESETS = {
  admin: {
    label: "Admin",
    description: "Full access, including team and settings.",
    permissions: { "*": ["*"] },
  },
  editor: {
    label: "Editor",
    description:
      "Read and edit operational data (catalog, products, bookings, CRM, …). No team, settings, deletes, or finance writes by default.",
    permissions: editorPermissions(),
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access across every resource.",
    permissions: { "*": ["read", "search"] },
  },
} as const satisfies Record<string, MemberRolePreset>

export type MemberRolePresetKey = keyof typeof MEMBER_ROLE_PRESETS

/**
 * Map a role slug (DB enum or WorkOS org role) to its preset permissions, or
 * `null` if the slug carries no preset (e.g. "custom" or unknown — the caller
 * then uses the member's explicitly-stored permission set).
 */
export function permissionsForRole(role: string | null | undefined): ApiKeyPermissions | null {
  switch ((role ?? "").trim().toLowerCase()) {
    case "owner":
    case "super-admin":
    case "admin":
      return MEMBER_ROLE_PRESETS.admin.permissions
    case "editor":
    case "member":
      return MEMBER_ROLE_PRESETS.editor.permissions
    case "viewer":
    case "guest":
      return MEMBER_ROLE_PRESETS.viewer.permissions
    default:
      return null
  }
}

/**
 * Resolve a role slug to its scope strings (e.g. `["bookings:read", …]`), or
 * `null` for a slug with no preset. `admin`/`owner` resolve to `["*"]`.
 */
export function scopesForRole(role: string | null | undefined): ApiKeyPermissionString[] | null {
  const permissions = permissionsForRole(role)
  return permissions ? permissionsToStrings(permissions) : null
}

function accessCatalogScope(resource: string, action: string): ApiKeyPermissionString {
  return `${resource}:${action}` as ApiKeyPermissionString
}

function explicitAccessCatalogScopes(
  catalog: AccessCatalog | null | undefined,
): ApiKeyPermissionString[] {
  return (
    catalog?.resources.flatMap((resource) =>
      resource.wildcard === "explicit-resource"
        ? resource.actions.map((action) => accessCatalogScope(resource.resource, action.action))
        : resource.actions
            .filter((action) => action.wildcard === "explicit")
            .map((action) => accessCatalogScope(resource.resource, action.action)),
    ) ?? []
  )
}

/**
 * Resolve a role slug to runtime session scopes. Full-access roles include the
 * explicit catalog grants that `*` intentionally does not satisfy, such as
 * team-management resources.
 */
export function accessCatalogScopesForRole(
  role: string | null | undefined,
  catalog: AccessCatalog | null | undefined,
): ApiKeyPermissionString[] | null {
  const roleScopes = scopesForRole(role)
  if (!roleScopes) return null
  if (!isFullAccessRole(role)) return roleScopes
  return Array.from(new Set([...roleScopes, ...explicitAccessCatalogScopes(catalog)])).sort()
}

/** True when a role slug grants full (manage-everything) access. */
export function isFullAccessRole(role: string | null | undefined): boolean {
  return hasApiKeyPermission(permissionsForRole(role), "*", "*")
}
