/**
 * Channel-push reconciler — self-healing catch-up for divergence.
 *
 * Eventually-consistent push works while the channel is reachable most
 * of the time. After a long outage (or when an integration is first
 * turned on for a channel that already has local state), the channel's
 * view of our inventory diverges from ours. The reconciler closes that
 * gap by re-reading current state from owned tables and recreating
 * intent rows for divergent ones — same intent + worker pipeline, not
 * a parallel push path.
 *
 * v1 cadences (per §13.2, tunable per channel):
 *   - Booking-link reconciler: every 15 min
 *   - Availability reconciler: hourly
 *   - Content reconciler: nightly
 *
 * Package jobs schedule these through the selected job host; the
 * functions themselves are plain async so they're testable.
 *
 * Per docs/architecture/channel-push-architecture.md §13.
 */

import { and, asc, eq, inArray, isNull, lt, ne, or } from "drizzle-orm"

import {
  channelBookingLinks,
  channelInventoryAllotments,
  channelProductMappings,
  channels,
} from "../schema.js"
import { upsertAvailabilityIntent } from "./availability-push.js"
import { processBookingPush } from "./booking-push.js"
import {
  loadContentPushProducts,
  loadRecentlyUpdatedAvailabilityPushSlots,
} from "./boundary-sql.js"
import { canonicalHash, upsertContentIntent } from "./content-push.js"
import { type ChannelPushDeps, defaultLogger, getChannelPushDepsOrThrow } from "./types.js"

export interface BookingLinkReconcilerOptions {
  /**
   * Re-process links whose `lastPushAt` is older than this many ms (or
   * has never been pushed). Default 15 min, matching the v1 cadence.
   */
  staleAfterMs?: number
  /** Max links to re-process per call. Default 200. */
  limit?: number
  /** When set, scope the pass to one channel. */
  channelId?: string
}

export interface ReconcilerResult {
  scanned: number
  triggered: number
}

/**
 * Walk `channel_booking_links` where push_status != 'ok' and reissue
 * via `processBookingPush`. The processor is idempotent on
 * `idempotency_key`, so reissuing succeeded-then-edited links never
 * doubles upstream.
 *
 * Per §13.1.
 */
export async function reconcileBookingLinks(
  options: BookingLinkReconcilerOptions = {},
  deps?: ChannelPushDeps,
): Promise<ReconcilerResult> {
  const { db, logger = defaultLogger } = deps ?? getChannelPushDepsOrThrow()
  const staleAfter = new Date(Date.now() - (options.staleAfterMs ?? 15 * 60 * 1000))
  const limit = options.limit ?? 200

  const stale = (await db
    .select({
      bookingId: channelBookingLinks.bookingId,
    })
    .from(channelBookingLinks)
    .where(
      and(
        ne(channelBookingLinks.pushStatus, "ok"),
        or(isNull(channelBookingLinks.lastPushAt), lt(channelBookingLinks.lastPushAt, staleAfter)),
        options.channelId ? eq(channelBookingLinks.channelId, options.channelId) : undefined,
      ),
    )
    .orderBy(asc(channelBookingLinks.lastPushAt))
    .limit(limit)) as Array<{ bookingId: string }>

  if (stale.length === 0) return { scanned: 0, triggered: 0 }

  const uniqueBookings = Array.from(new Set(stale.map((r) => r.bookingId)))
  let triggered = 0
  for (const bookingId of uniqueBookings) {
    try {
      const result = await processBookingPush({ bookingId }, deps)
      if (result.attempted > 0) triggered += 1
    } catch (err) {
      logger.error?.(`reconcileBookingLinks: processBookingPush failed for ${bookingId}`, {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { scanned: stale.length, triggered }
}

export interface AvailabilityReconcilerOptions {
  /** Look-back window for recent slot changes. Default 1 hour. */
  lookbackMs?: number
  /** Max slots to enqueue per pass. Default 500. */
  limit?: number
  channelId?: string
}

/**
 * Walk recently-updated slots and ensure an intent row exists per
 * (channel, slot) where the channel holds an active allotment. The
 * worker's existing UNIQUE constraint collapses duplicates, so this is
 * safe to re-run.
 *
 * Per §13.1 (availability reconciler).
 */
export async function reconcileAvailability(
  options: AvailabilityReconcilerOptions = {},
  deps?: ChannelPushDeps,
): Promise<ReconcilerResult> {
  const { db } = deps ?? getChannelPushDepsOrThrow()
  const lookback = new Date(Date.now() - (options.lookbackMs ?? 60 * 60 * 1000))
  const limit = options.limit ?? 500

  const slots = await loadRecentlyUpdatedAvailabilityPushSlots(db, {
    updatedAfter: lookback,
    limit,
  })

  if (slots.length === 0) return { scanned: 0, triggered: 0 }

  // For each slot, find channels with active allotments + matching
  // product mappings, and upsert an intent row.
  let triggered = 0
  const productIds = Array.from(new Set(slots.map((s) => s.productId)))

  const allotments = (await db
    .select({
      allotment: channelInventoryAllotments,
      mapping: channelProductMappings,
    })
    .from(channelInventoryAllotments)
    .innerJoin(
      channelProductMappings,
      and(
        eq(channelProductMappings.channelId, channelInventoryAllotments.channelId),
        eq(channelProductMappings.productId, channelInventoryAllotments.productId),
      ),
    )
    .innerJoin(channels, eq(channelInventoryAllotments.channelId, channels.id))
    .where(
      and(
        inArray(channelInventoryAllotments.productId, productIds),
        eq(channelInventoryAllotments.active, true),
        eq(channelProductMappings.active, true),
        eq(channelProductMappings.pushAvailability, true),
        eq(channels.status, "active"),
        options.channelId ? eq(channelInventoryAllotments.channelId, options.channelId) : undefined,
      ),
    )) as Array<{
    allotment: typeof channelInventoryAllotments.$inferSelect
    mapping: typeof channelProductMappings.$inferSelect
  }>

  for (const slot of slots) {
    for (const row of allotments) {
      if (row.allotment.productId !== slot.productId) continue
      // Allotment may be option-scoped; null option_id matches all.
      if (row.allotment.optionId && row.allotment.optionId !== slot.optionId) continue
      if (!row.mapping.sourceConnectionId) continue

      await upsertAvailabilityIntent(db, {
        channelId: row.mapping.channelId,
        sourceConnectionId: row.mapping.sourceConnectionId,
        slotId: slot.id,
        productId: slot.productId,
        optionId: slot.optionId ?? null,
        startsAt: slot.startsAt,
      })
      triggered += 1
    }
  }
  return { scanned: slots.length, triggered }
}

export interface ContentReconcilerOptions {
  /** Max products to scan per pass. Default 200. */
  limit?: number
  channelId?: string
}

/**
 * Walk syndicated products, hash current content, and recreate an
 * intent row for every (channel, product) where the upstream's
 * `last_pushed_content_hash` doesn't match. Per §13.1 (content
 * reconciler) — content drift converges nightly.
 */
export async function reconcileContent(
  options: ContentReconcilerOptions = {},
  deps?: ChannelPushDeps,
): Promise<ReconcilerResult> {
  const { db } = deps ?? getChannelPushDepsOrThrow()
  const limit = options.limit ?? 200

  const mappings = (await db
    .select({
      mapping: channelProductMappings,
    })
    .from(channelProductMappings)
    .innerJoin(channels, eq(channelProductMappings.channelId, channels.id))
    .where(
      and(
        eq(channelProductMappings.active, true),
        eq(channelProductMappings.pushContent, true),
        eq(channels.status, "active"),
        options.channelId ? eq(channelProductMappings.channelId, options.channelId) : undefined,
      ),
    )
    .limit(limit)) as Array<{
    mapping: typeof channelProductMappings.$inferSelect
  }>

  const productIds = Array.from(new Set(mappings.map((row) => row.mapping.productId)))
  const products = await loadContentPushProducts(db, productIds)

  let triggered = 0
  for (const { mapping } of mappings) {
    if (!mapping.sourceConnectionId) continue
    const product = products.get(mapping.productId)
    if (!product) continue
    const minimalContent = {
      id: product.id,
      name: product.name,
      description: product.description ?? null,
    }
    const currentHash = canonicalHash(minimalContent)
    if (mapping.lastPushedContentHash === currentHash) continue

    await upsertContentIntent(db, {
      channelId: mapping.channelId,
      sourceConnectionId: mapping.sourceConnectionId,
      productId: mapping.productId,
    })
    triggered += 1
  }
  return { scanned: mappings.length, triggered }
}

/**
 * Convenience: run all three reconcilers with default cadences.
 * Templates can call this from a single nightly cron, or schedule
 * each independently for finer control.
 */
export async function runAllReconcilers(deps?: ChannelPushDeps): Promise<{
  bookings: ReconcilerResult
  availability: ReconcilerResult
  content: ReconcilerResult
}> {
  const [bookingsResult, availability, content] = await Promise.all([
    reconcileBookingLinks({}, deps),
    reconcileAvailability({}, deps),
    reconcileContent({}, deps),
  ])
  return { bookings: bookingsResult, availability, content }
}
