/**
 * Scopes carried by a storefront SECRET key (voyant#4625).
 *
 * A `vsk_` replaces both the old storefront secret key and the deployment admin
 * key, covering `/v1/public/*` and `/v1/admin/*` on one deployment. A
 * credential that broad needs a grant, and the grant vocabulary is deliberately
 * NOT a new one: it is this deployment's own access catalog, the same
 * `resource: [action, ...]` shape `apikey.permissions` already uses. One scope
 * picker, one permission check, one thing to learn.
 *
 * (The platform's `apiTokenScopes` is the pattern being followed here — a
 * deployment-level vocabulary attached at mint — not the list. The platform's
 * control-plane scopes describe the control plane and never appear here.)
 */
import type { ApiKeyPermissions } from "./api-keys.js"
import { normalizeApiKeyPermissions, permissionsToStrings } from "./api-keys.js"

export type StorefrontKeyScopes = ApiKeyPermissions

/**
 * The grant a secret key is minted with unless the operator picks otherwise:
 * what a storefront's own server needs to run commerce, and nothing else.
 *
 * Read as a whole it is "sell things and service the bookings you sold". It
 * deliberately excludes every operator-facing resource — CRM, team, setup,
 * reports, media, webhooks, apps — because a storefront's backend has no reason
 * to reach them, and a default that included them would make the narrow case
 * the one requiring effort.
 */
export const STOREFRONT_SECRET_KEY_DEFAULT_SCOPES: StorefrontKeyScopes = Object.freeze({
  bookings: ["read", "write"],
  finance: ["read", "write"],
  legal: ["read"],
  markets: ["read"],
  products: ["read"],
  storefront: ["read", "write"],
}) as StorefrontKeyScopes

/** The unrestricted grant. Only ever set when an operator explicitly opts in. */
export const STOREFRONT_KEY_WILDCARD_SCOPES: StorefrontKeyScopes = Object.freeze({
  "*": ["*"],
}) as StorefrontKeyScopes

/**
 * Whether a grant is the unrestricted one. The admin surface uses this to be
 * loud about it: `*` on a key that also authenticates `/v1/admin/*` is the
 * deployment admin key by another name, which is the thing voyant#4625 set out
 * to retire — so it must be a visible choice, never a quiet default.
 */
export function isWildcardStorefrontKeyScopes(
  scopes: StorefrontKeyScopes | null | undefined,
): boolean {
  return normalizeApiKeyPermissions(scopes)["*"]?.includes("*") === true
}

/**
 * Normalize an operator-supplied grant for storage.
 *
 * `null` is preserved rather than coerced to `{}`: it is the pre-scopes legacy
 * grant, and collapsing it into "no permissions" would silently revoke every
 * key minted before this shipped. An explicitly empty grant stays `{}` and
 * means what it says.
 */
export function normalizeStorefrontKeyScopes(
  scopes: StorefrontKeyScopes | null | undefined,
): StorefrontKeyScopes | null {
  if (scopes === null || scopes === undefined) return null
  return normalizeApiKeyPermissions(scopes)
}

/** Flat `resource:action` strings, for an auth context's `scopes`. */
export function storefrontKeyScopeStrings(
  scopes: StorefrontKeyScopes | null | undefined,
): string[] {
  return permissionsToStrings(scopes)
}
