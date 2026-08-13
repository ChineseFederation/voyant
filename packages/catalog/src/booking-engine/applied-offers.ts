/**
 * "Which promotional offers did this booking actually consume?" — answered by
 * the module that owns both quote tables.
 *
 * The post-commit redemption recorder in `@voyant-travel/commerce` used to
 * `select` from `catalog_quotes` itself. That was a cross-module table
 * reach-in (ADR-0016 decision 6) and it only ever saw half the answer: since
 * the v1 Booking Session replaced the beta quote path, a committed booking's
 * pricing lives in `booking_session_quotes`, joined to the booking through
 * `booking_session_commits` rather than through a `consumed_booking_id`
 * column. Both are read here, and the legacy table stays in the union so
 * historical rows keep resolving.
 */

import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, eq, inArray } from "drizzle-orm"

import { pricingBreakdownV1 } from "./contracts.js"
import type { AppliedOffer } from "./promotions-contract.js"
import { catalogQuotesTable } from "./schema.js"
import { bookingSessionCommitsTable, bookingSessionQuotesTable } from "./sessions-schema.js"

export interface BookingAppliedOffers {
  /** Quote rows inspected across both tables. */
  quotesScanned: number
  /** Every applied-offer row found, in no particular order and not deduplicated. */
  offers: AppliedOffer[]
}

export async function readAppliedOffersForBooking(
  db: AnyDrizzleDb,
  bookingId: string,
): Promise<BookingAppliedOffers> {
  const [legacyRows, sessionRows] = await Promise.all([
    db
      .select({ appliedOffers: catalogQuotesTable.pricing_applied_offers })
      .from(catalogQuotesTable)
      .where(eq(catalogQuotesTable.consumed_booking_id, bookingId)),
    readSessionQuotePricing(db, bookingId),
  ])

  const offers = [
    ...legacyRows.flatMap((row) => row.appliedOffers ?? []),
    ...sessionRows.flatMap(appliedOffersFromPricing),
  ]
  return { quotesScanned: legacyRows.length + sessionRows.length, offers }
}

async function readSessionQuotePricing(
  db: AnyDrizzleDb,
  bookingId: string,
): Promise<Record<string, unknown>[]> {
  const commits = await db
    .select({ sessionId: bookingSessionCommitsTable.sessionId })
    .from(bookingSessionCommitsTable)
    .where(eq(bookingSessionCommitsTable.bookingId, bookingId))
  const sessionIds = [...new Set(commits.map((commit) => commit.sessionId))]
  if (sessionIds.length === 0) return []
  const rows = await db
    .select({ pricing: bookingSessionQuotesTable.pricing })
    .from(bookingSessionQuotesTable)
    .where(
      and(
        inArray(bookingSessionQuotesTable.sessionId, sessionIds),
        eq(bookingSessionQuotesTable.state, "consumed"),
      ),
    )
  return rows.map((row) => row.pricing)
}

/**
 * Parse rather than cast. The column is untyped JSONB written by whatever
 * quoted, so a shape drift must fail closed — recording a redemption for an
 * offer the quote never carried is worse than recording none.
 */
function appliedOffersFromPricing(pricing: Record<string, unknown>): AppliedOffer[] {
  const parsed = pricingBreakdownV1.safeParse(pricing)
  return parsed.success ? (parsed.data.appliedOffers ?? []) : []
}
