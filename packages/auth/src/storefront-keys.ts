/**
 * Storefront access-key helpers.
 *
 * A storefront access key is an opaque bearer token with a kind-specific
 * prefix. Only the SHA-256 hash of the token is ever persisted; the plaintext
 * is returned exactly once at issuance (reveal-once) and can never be
 * re-derived. `tokenPreview` is a short, non-secret display fragment so an
 * operator can recognise a key in a list without revealing it.
 *
 *   - `vpk_` publishable — safe to embed in a browser bundle or native app;
 *     authorizes public read + customer-auth initiation from a declared origin.
 *   - `vsk_` secret — server-only (SSR/BFF); carries full storefront trust.
 *
 * Runtime-agnostic: uses only Web Crypto (`crypto.getRandomValues`,
 * `crypto.subtle`), which is available in Node, workerd, and the browser.
 */
import {
  classifyStorefrontKeyToken,
  hashStorefrontKeyToken,
  STOREFRONT_KEY_PREFIXES,
} from "@voyant-travel/core"
import type { StorefrontApiKeyKind } from "@voyant-travel/db/schema/iam"

// The prefix table lives in `core` because the capability middleware in
// `@voyant-travel/hono` classifies a token before this package is reachable,
// and two copies of it drifting apart is an auth bypass (voyant#4625).
const KEY_PREFIXES = STOREFRONT_KEY_PREFIXES satisfies Record<StorefrontApiKeyKind, string>

/** Bytes of entropy in the random portion of a key (256 bits). */
const KEY_RANDOM_BYTES = 32

export interface GeneratedStorefrontApiKey {
  kind: StorefrontApiKeyKind
  /** Full plaintext token — shown once, never stored. */
  token: string
  /** SHA-256 hex digest of `token`; the only value persisted for lookup. */
  tokenHash: string
  /** Non-secret display fragment, e.g. "vpk_ab12cd". */
  tokenPreview: string
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * SHA-256 hex digest of an access token. Delegates to `core` so issuance here
 * and the admin-surface lookup in `@voyant-travel/hono` cannot compute
 * different digests for the same token.
 */
export async function hashStorefrontApiKey(token: string): Promise<string> {
  return hashStorefrontKeyToken(token)
}

/**
 * Classify a presented token by its prefix. Returns null when the token has no
 * recognised storefront-key prefix, letting callers reject obviously-invalid
 * tokens before hitting the database.
 */
export function classifyStorefrontApiKey(token: string): StorefrontApiKeyKind | null {
  return classifyStorefrontKeyToken(token)
}

/**
 * Mint a new storefront access key. The returned `token` is the only time the
 * plaintext exists; persist `tokenHash`/`tokenPreview` and surface `token` to
 * the operator exactly once.
 */
export async function generateStorefrontApiKey(
  kind: StorefrontApiKeyKind,
): Promise<GeneratedStorefrontApiKey> {
  const random = new Uint8Array(KEY_RANDOM_BYTES)
  crypto.getRandomValues(random)
  const token = `${KEY_PREFIXES[kind]}${base64UrlFromBytes(random)}`
  return {
    kind,
    token,
    tokenHash: await hashStorefrontApiKey(token),
    // Prefix (4 chars) + first 6 chars of the random body: enough to
    // disambiguate in a list, far too little to guess the token.
    tokenPreview: token.slice(0, KEY_PREFIXES[kind].length + 6),
  }
}
