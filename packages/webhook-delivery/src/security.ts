/**
 * Re-export of the contract package so existing internal imports keep working.
 * The signing, verification, and outbound-endpoint policy moved to
 * `@voyant-travel/webhook-delivery-contracts` so that app publishers can verify
 * the webhooks we send them — and validate the endpoints they declare in a
 * manifest — without depending on this runtime module's queue, store, and
 * routes.
 */
export * from "@voyant-travel/webhook-delivery-contracts"

/**
 * Serialize a persisted webhook payload deterministically.
 *
 * PostgreSQL `jsonb` does not preserve object-key insertion order. Hashing a
 * plain `JSON.stringify` result before insert and then stringifying the
 * hydrated row can therefore produce different bytes for the same payload.
 * Webhook hashes and signatures must cover the exact bytes the worker sends,
 * so every enqueue, retry, replay, and dispatch path uses this serializer.
 */
export function serializeWebhookPayload(value: unknown): string {
  const serialized = JSON.stringify(sortJsonValue(value))
  if (serialized === undefined) {
    throw new Error("Webhook payload must be JSON serializable.")
  }
  return serialized
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue)
  if (value === null || typeof value !== "object") return value

  const toJSON = (value as { toJSON?: () => unknown }).toJSON
  if (typeof toJSON === "function") return sortJsonValue(toJSON.call(value))

  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, sortJsonValue(record[key])]),
  )
}
