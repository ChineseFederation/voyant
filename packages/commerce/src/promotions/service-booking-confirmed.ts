/**
 * Booking-confirmed redemption subscriber — records one row per
 * (offer, booking) in `promotional_offer_redemptions` after a booking
 * commits, by reading `pricing_applied_offers` from `catalog_quotes`
 * (joined to the booking via the existing `consumed_booking_id` column).
 *
 * Why a subscriber rather than a commit-time hook: the owned `createBooking`
 * path opens its own transaction in `@voyant-travel/finance`, so there is no
 * single commit transaction to be atomic with — claiming "atomic with commit"
 * would be misleading.
 *
 * Per docs/architecture/promotions-architecture.md §3.6 + §7.3.
 *
 * The recorder reads from `catalog_quotes` NOT from
 * `booking_catalog_snapshot`, to avoid an ordering race with the
 * catalog-bridge's `captureSnapshotGraph` subscriber (both fire on the same
 * `booking.confirmed` event).
 *
 * READS HISTORY ONLY (voyant#4188). Both writes this depends on are gone:
 * `pricing_applied_offers` was written by the beta `quoteEntity`, and
 * `consumed_booking_id` by `bookEntity` (#3747). New bookings therefore record
 * no redemptions. This recorder is the reason `catalog_quotes` was kept rather
 * than dropped — it is the read path for rows a shipped booking already
 * consumed. Restoring redemption recording means evaluating promotions on the
 * v1 Session `composeQuote` and reading `booking_session_quotes` here.
 *
 * Idempotent on retry: the unique `(offer_id, booking_id)` index on
 * `promotional_offer_redemptions` (per §4.3) lets the upsert refresh the
 * aggregate cleanly even if the subscriber is replayed.
 */

import { type AppliedOffer, catalogQuotesTable } from "@voyant-travel/catalog/booking-engine"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { promotionalOfferRedemptions } from "./schema.js"

export interface RecordRedemptionsResult {
  /** Number of distinct quotes scanned for this booking. */
  quotesScanned: number
  /** Number of distinct offers aggregated across those quotes. */
  offersFound: number
  /** Number of redemption rows upserted. Equals `offersFound` on success. */
  rowsUpserted: number
}

/**
 * Aggregate `pricing_applied_offers` across every consumed quote for the
 * booking and upsert one redemption row per offer.
 *
 * Aggregation rules (per §3.5):
 *   - Multiple snapshots in the same booking sharing the same offer →
 *     ONE redemption row with `discount_applied_cents` summed across all
 *     occurrences.
 *   - `code_used` defaults to the first non-null `appliedCode` seen for
 *     that offer (auto-applied + code-gated never share the same
 *     offer ID).
 *   - `currency` carried from the AppliedOffer row directly.
 */
export async function recordPromotionRedemptionsForBooking(
  db: AnyDrizzleDb,
  bookingId: string,
): Promise<RecordRedemptionsResult> {
  const rows = await db
    .select({ pricing_applied_offers: catalogQuotesTable.pricing_applied_offers })
    .from(catalogQuotesTable)
    .where(eq(catalogQuotesTable.consumed_booking_id, bookingId))

  if (rows.length === 0) {
    return { quotesScanned: 0, offersFound: 0, rowsUpserted: 0 }
  }

  // Aggregate per offerId across all quotes.
  const aggregated = new Map<
    string,
    { discountAppliedCents: number; currency: string; codeUsed: string | null }
  >()
  for (const row of rows) {
    const offers: AppliedOffer[] = row.pricing_applied_offers ?? []
    for (const offer of offers) {
      const existing = aggregated.get(offer.offerId)
      if (existing) {
        existing.discountAppliedCents += offer.discountAppliedCents
        // First non-null wins — the code-gated offer (if any) is
        // typically a single occurrence.
        if (existing.codeUsed == null && offer.appliedCode != null) {
          existing.codeUsed = offer.appliedCode
        }
      } else {
        aggregated.set(offer.offerId, {
          discountAppliedCents: offer.discountAppliedCents,
          currency: offer.currency,
          codeUsed: offer.appliedCode,
        })
      }
    }
  }

  if (aggregated.size === 0) {
    return { quotesScanned: rows.length, offersFound: 0, rowsUpserted: 0 }
  }

  const insertValues = Array.from(aggregated.entries()).map(([offerId, summary]) => ({
    offerId,
    bookingId,
    codeUsed: summary.codeUsed,
    discountAppliedCents: summary.discountAppliedCents,
    currency: summary.currency,
  }))

  // ON CONFLICT DO UPDATE so subscriber retries refresh the aggregate
  // cleanly — important because the event bus may replay this event.
  // Cast: AnyDrizzleDb's union doesn't unify .insert().onConflictDoUpdate()
  // across drivers at the type level (same workaround as the boundary
  // scheduler).
  await (db as PostgresJsDatabase)
    .insert(promotionalOfferRedemptions)
    .values(insertValues)
    .onConflictDoUpdate({
      target: [promotionalOfferRedemptions.offerId, promotionalOfferRedemptions.bookingId],
      // EXCLUDED refers to the would-be-inserted row — we want the freshly-
      // computed aggregate (from `insertValues`) to overwrite any stale prior
      // row, not a no-op self-assignment. Without `excluded.*` here, a partial
      // earlier write would never get corrected on retry / replay despite
      // this code path claiming idempotent refresh semantics.
      set: {
        discountAppliedCents: sql`excluded.discount_applied_cents`,
        codeUsed: sql`excluded.code_used`,
      },
    })

  return {
    quotesScanned: rows.length,
    offersFound: aggregated.size,
    rowsUpserted: aggregated.size,
  }
}
