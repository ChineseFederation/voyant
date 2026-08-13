import {
  type AccessCatalog,
  type AccessCatalogResource,
  type ApiKeyPermissions,
  hasApiKeyPermission,
  permissionStringsToPermissions,
} from "@voyant-travel/types/api-keys"

/**
 * Scope-selection helpers for the API token editor.
 *
 * The editor works in two tiers, mirroring how the catalog resolves a grant:
 *
 * - a RESOURCE grant (`bookings:*`) covers every current and future action on
 *   that resource, so its actions are shown checked and locked; and
 * - individual ACTION grants (`bookings:read`) are the granular fallback.
 *
 * `wildcard: "explicit"` actions are deliberately NOT covered by `resource:*`
 * (see `hasApiKeyPermission`), so a resource grant has to name them alongside
 * the wildcard or the "select the whole group" affordance would silently grant
 * less than it displays.
 */

/** A preset the token editor may apply — both catalog preset kinds qualify. */
export interface ApiTokenPreset {
  id: string
  label: string
  description: string
  audience?: string
  permissions: ApiKeyPermissions
}

/**
 * Presets offered by the token editor. `api-token` presets are authored for
 * tokens directly; `api-token-grant` presets are audience-scoped grants the
 * deployment publishes (agent, public catalog reader) and are equally valid
 * starting points. `staff` presets are member roles and are excluded.
 */
export function apiTokenPresets(catalog: AccessCatalog): ApiTokenPreset[] {
  return catalog.presets
    .filter((preset) => preset.kind === "api-token" || preset.kind === "api-token-grant")
    .map((preset) => ({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      ...(preset.audience ? { audience: preset.audience } : {}),
      permissions: permissionStringsToPermissions(preset.grants),
    }))
}

/** Actions a whole-resource grant must name so it covers what the UI shows. */
export function resourceGrantActions(resource: AccessCatalogResource): string[] {
  const explicit = resource.actions
    .filter((action) => action.wildcard === "explicit")
    .map((action) => action.action)
  return Array.from(new Set(["*", ...explicit])).sort()
}

/** Whether the whole resource is granted (and its actions therefore locked). */
export function isResourceGranted(
  permissions: ApiKeyPermissions,
  resource: AccessCatalogResource,
): boolean {
  return permissions[resource.resource]?.includes("*") === true
}

/** Grant or revoke a whole resource. */
export function setResourceGrant(
  permissions: ApiKeyPermissions,
  resource: AccessCatalogResource,
  granted: boolean,
): ApiKeyPermissions {
  const next = { ...permissions }
  if (granted) {
    next[resource.resource] = resourceGrantActions(resource)
  } else {
    delete next[resource.resource]
  }
  return next
}

/** Grant or revoke a single action on a resource. */
export function setActionGrant(
  permissions: ApiKeyPermissions,
  resource: string,
  action: string,
  granted: boolean,
): ApiKeyPermissions {
  const current = new Set(permissions[resource] ?? [])
  if (granted) {
    current.add(action)
  } else {
    current.delete(action)
  }

  const next = { ...permissions }
  if (current.size === 0) {
    delete next[resource]
  } else {
    next[resource] = Array.from(current).sort()
  }
  return next
}

/** Whether the token carries the unrestricted `*` grant. */
export function isFullAccess(permissions: ApiKeyPermissions): boolean {
  return permissions["*"]?.includes("*") === true
}

/**
 * Apply or drop full access. Turning it on replaces the selection outright —
 * `*` already implies everything, and keeping stale per-resource entries around
 * would resurface them the moment it is turned back off.
 */
export function setFullAccess(on: boolean): ApiKeyPermissions {
  return on ? { "*": ["*"] } : {}
}

/** Number of a resource's actions the current selection satisfies. */
export function grantedActionCount(
  permissions: ApiKeyPermissions,
  resource: AccessCatalogResource,
  catalog: AccessCatalog,
): number {
  return resource.actions.filter((action) =>
    hasApiKeyPermission(permissions, resource.resource, action.action, catalog),
  ).length
}

/** Case-insensitive match over the labels a reader actually scans. */
export function matchesScopeSearch(resource: AccessCatalogResource, query: string): boolean {
  const term = query.trim().toLowerCase()
  if (!term) return true
  const haystack = [
    resource.resource,
    resource.label,
    resource.description,
    ...resource.actions.flatMap((action) => [action.action, action.label, action.description]),
  ]
  return haystack.some((value) => value.toLowerCase().includes(term))
}

/**
 * The selection a fresh token starts from: the deployment's read-oriented
 * catalog preset when it publishes one, else the first token preset, else
 * nothing (which the editor surfaces as "no scopes selected" rather than
 * letting the form submit an empty grant).
 */
export function defaultTokenPermissions(catalog: AccessCatalog): ApiKeyPermissions {
  const presets = apiTokenPresets(catalog)
  const preferred = presets.find((preset) => preset.id === "catalog-read") ?? presets[0]
  return { ...(preferred?.permissions ?? {}) }
}
