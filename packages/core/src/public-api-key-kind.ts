/**
 * Storefront access-key classification — the one prefix table in the repo.
 *
 * Two independent layers need to know which kind of key a request presented,
 * and they run at different times: the capability middleware classifies before
 * anything is authenticated (to decide whether a browser-resident credential
 * may reach a route at all), while the customer-auth resolver classifies while
 * resolving the key against the database (to decide whether an origin is
 * required). A second copy of this table drifting from the first is an auth
 * bypass in exactly the way a drifted `matchesPublicPath` would be, so both
 * layers import these.
 *
 * Dependency-free by construction: `core` is below both `hono` and `auth`.
 */
import type { VoyantPublicApiKeyKind } from "./env.js"

/** Token prefix per key kind. Deployed clients hold these; they never change. */
export const PUBLIC_API_KEY_PREFIXES = {
  publishable: "vpk_",
  secret: "vsk_",
} as const satisfies Record<VoyantPublicApiKeyKind, string>

/** Header a storefront client presents its access key on. */
export const PUBLIC_API_KEY_HEADER = "x-api-key"

/**
 * SHA-256 hex digest of a storefront access token — the only value persisted,
 * and therefore the only way to look one up.
 *
 * Lives beside the prefix table for the same reason: issuance (`auth`) and the
 * admin-surface lookup (`hono`) both need it, and two implementations agreeing
 * today is not the same as one implementation. A digest that drifted would make
 * every secret key silently fail to resolve.
 *
 * Web Crypto only, so it runs in Node, workerd and the browser alike.
 */
export async function hashPublicApiKeyToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Classify a presented token by prefix alone — no database, no verification.
 * Returns `null` for anything that is not shaped like a storefront key, so a
 * caller can reject obviously-invalid tokens before touching the database and
 * so a non-storefront credential (a `voy_` deployment key, an OAuth token) is
 * never mistaken for one.
 */
export function classifyPublicApiKeyToken(
  token: string | null | undefined,
): VoyantPublicApiKeyKind | null {
  const value = token?.trim()
  if (!value) return null
  for (const kind of Object.keys(PUBLIC_API_KEY_PREFIXES) as VoyantPublicApiKeyKind[]) {
    if (value.startsWith(PUBLIC_API_KEY_PREFIXES[kind])) return kind
  }
  return null
}
