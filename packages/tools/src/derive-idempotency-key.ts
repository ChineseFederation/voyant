/**
 * Server-side idempotency keys for created-target commands (voyant#3921).
 *
 * The created-target protocol requires an idempotency key, and until now every
 * create tool except `book_product` required the CALLER to invent one. Measured
 * against the real operator graph, that made every create fail on first attempt:
 *
 *   create_person  → admitted_policy_mismatch
 *   create_product → ACTION_POLICY_REQUIRED: idempotency must come from the
 *                    admitted Tool invocation
 *
 * The agent then read the guide and retried, so the record was eventually
 * written — at the cost of roughly three extra calls and fifteen thousand tokens
 * per create, on a requirement that never appears in the tool's input schema.
 *
 * #3921 Finding 2 already named this: asking a model to carry an opaque token is
 * one of the least reliable things we can do, and the requirement is
 * server-resolvable. `book_product` resolved it by hashing the request; this is
 * that same derivation, lifted out of finance so every create can use it.
 *
 * The key is a hash of the request CONTENT, which gives the property the protocol
 * actually wants: an identical retry derives an identical key and replays the
 * original record instead of writing a second one, while two genuinely different
 * requests differ in content and get different keys.
 */

/**
 * Derive a stable idempotency key from a namespace and the command input.
 *
 * `namespace` keeps two different commands that happen to carry identical input
 * from colliding — `create_person` and `create_organization` both accept
 * `{ name }`, and they must not share a claim.
 */
export async function deriveCommandIdempotencyKey(
  namespace: string,
  input: unknown,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(input))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return `${namespace}:v1:${hex}`
}

/**
 * Stable stringification: object keys sorted, so key order never changes the
 * fingerprint. A retry that serialises the same fields in a different order has
 * to derive the same key, or the replay guarantee silently stops holding.
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}
