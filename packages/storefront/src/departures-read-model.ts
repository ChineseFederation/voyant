import type { BootstrapContext, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import type { KVStore } from "@voyant-travel/utils/cache"
import type { Context } from "hono"

/**
 * Cache-store-backed public departure documents. Managed Node deployments bind
 * CACHE to Redis; the KVStore-shaped port keeps the OSS module provider-neutral.
 * Checkout and price confirmation remain transactional Postgres paths; this
 * read model only serves anonymous browse responses and is invalidated by the
 * canonical availability event.
 */
const DEPARTURES_RM_PREFIX = "rm:v1:departures"

/** Long fallback bound; normal freshness comes from exact event invalidation. */
export const DEPARTURES_DOC_TTL_SECONDS = 15 * 60

export function departuresDocPrefix(productId: string): string {
  return `${DEPARTURES_RM_PREFIX}:${productId}:`
}

export function departuresDocKey(
  productId: string,
  query: Record<string, unknown>,
): string {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&")
  return `${departuresDocPrefix(productId)}${entries || "default"}`
}

/** Best-effort read-through cache; failures degrade to the live query. */
export async function readThroughDepartures<T>(
  c: Context<{ Bindings: { CACHE?: KVStore } }>,
  key: string,
  compute: () => Promise<T>,
): Promise<T> {
  const kv = c.env?.CACHE
  if (kv) {
    try {
      const hit = await kv.get<T>(key, { type: "json" })
      if (hit !== null && hit !== undefined) return hit
    } catch {
      // fall through to live
    }
  }
  const data = await compute()
  if (kv && data !== null && data !== undefined) {
    try {
      await kv.put(key, JSON.stringify(data), {
        expirationTtl: DEPARTURES_DOC_TTL_SECONDS,
      })
    } catch {
      // best-effort
    }
  }
  return data
}

/** Delete every query variant for one product. */
export async function invalidateDeparturesReadModel(
  kv: KVStore,
  productId: string,
): Promise<void> {
  if (!kv.list) return
  const { keys } = await kv.list({ prefix: departuresDocPrefix(productId) })
  await Promise.all(keys.map(({ name }) => kv.delete(name)))
}

function productIdFromAvailabilityEvent(data: unknown): string | null {
  if (!data || typeof data !== "object") return null
  const productId = (data as { productId?: unknown }).productId
  return typeof productId === "string" && productId.trim()
    ? productId.trim()
    : null
}

export const STOREFRONT_AVAILABILITY_READ_MODEL_SUBSCRIBER_ID =
  "@voyant-travel/storefront#subscriber.invalidate-departures-on-availability-change"

export function createStorefrontAvailabilityReadModelInvalidationSubscriber(
  logger: Pick<Console, "warn"> = console,
): SubscriberRuntimeDescriptor {
  return {
    id: STOREFRONT_AVAILABILITY_READ_MODEL_SUBSCRIBER_ID,
    eventType: "availability.slot.changed",
    register({ bindings, eventBus }: BootstrapContext) {
      eventBus.subscribe(
        "availability.slot.changed",
        async ({ data }) => {
          const productId = productIdFromAvailabilityEvent(data)
          const kv = (bindings as { CACHE?: KVStore } | undefined)?.CACHE
          if (!productId || !kv) return
          try {
            await invalidateDeparturesReadModel(kv, productId)
          } catch (error) {
            // Cache invalidation is a best-effort projection update. Never
            // dead-letter the domain event when the cache is unavailable.
            logger.warn("[storefront] departure read-model invalidation failed", {
              productId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        },
        { inline: false },
      )
    },
  }
}

export const storefrontAvailabilityReadModelInvalidationSubscriber =
  createStorefrontAvailabilityReadModelInvalidationSubscriber()
