/**
 * `catalog_quotes` — historical booking-engine quote records.
 *
 * **This table has no writer.** Its writer was the beta `quoteEntity`
 * lifecycle, deleted in voyant#4188; its consumer, `bookEntity`, went earlier
 * with #3747. A quote is now either a Session-bound row in
 * `booking_session_quotes` or a non-binding Offer Preview that persists
 * nothing, and neither lands here.
 *
 * It is kept, and deliberately not dropped, because Commerce's
 * `booking.confirmed` redemption recorder still reads
 * `pricing_applied_offers` from it keyed by `consumed_booking_id`
 * (`packages/commerce/src/promotions/service-booking-confirmed.ts`). That
 * subscriber is mounted and outside the retired quote path, so dropping the
 * table would delete the rows a shipped booking's redemption evidence is read
 * from. Re-pointing it at the Session quote record retires the table; until
 * then this is dormant evidence, not a live lifecycle.
 *
 * The structured columns mirror `booking_catalog_snapshot`'s pricing
 * layout so finance can read both shapes without parsing JSONB.
 *
 * Plain text references (no FK) preserve the cross-module decoupling
 * rule from `schema-discipline.md`.
 */

import { typeId } from "@voyant-travel/db/lib/typeid-column"
import { boolean, index, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import type { AppliedOffer } from "./promotions-contract.js"

export const catalogQuotesTable = pgTable(
  "catalog_quotes",
  {
    id: typeId("catalog_quotes"),

    entity_module: text("entity_module").notNull(),
    entity_id: text("entity_id").notNull(),

    /** Mirrors the snapshot row's source pointer so a book can echo it back. */
    source_kind: text("source_kind").notNull(),
    source_provider: text("source_provider"),
    source_connection_id: text("source_connection_id"),
    source_ref: text("source_ref"),

    /** Whether the upstream/owned source flagged this entity as bookable. */
    available: boolean("available").notNull(),
    /** Populated when `available = false`; carries the upstream reason. */
    invalid_reason: text("invalid_reason"),

    /** Locale/audience/market scope captured for the quote. */
    locale: text("locale").notNull(),
    audience: text("audience").notNull(),
    market: text("market").notNull(),
    currency: text("currency"),

    /** Pricing breakdown — same shape as `booking_catalog_snapshot`. */
    pricing_base_amount: numeric("pricing_base_amount", { precision: 18, scale: 4 }),
    pricing_taxes: numeric("pricing_taxes", { precision: 18, scale: 4 }),
    pricing_fees: numeric("pricing_fees", { precision: 18, scale: 4 }),
    pricing_surcharges: numeric("pricing_surcharges", { precision: 18, scale: 4 }),
    pricing_currency: text("pricing_currency"),
    pricing_breakdown: jsonb("pricing_breakdown").$type<Record<string, unknown>>(),
    /**
     * Promotional offers that applied to this quote. Written by the beta
     * `evaluatePromotions` hook, deleted in voyant#4188; only historical rows
     * carry a value. The post-commit redemption recorder still reads it back
     * via `consumed_booking_id` and aggregates into
     * `promotional_offer_redemptions`, which is why the column and its index
     * survive the writer.
     */
    pricing_applied_offers: jsonb("pricing_applied_offers").$type<AppliedOffer[]>(),

    /** Opaque adapter payload available to an admitted vertical command. */
    upstream_payload: jsonb("upstream_payload"),

    /**
     * Set when an admitted vertical command consumed this quote. Nothing has
     * written it since `bookEntity` was deleted (#3747); it is the join the
     * redemption recorder reads historical rows by.
     */
    consumed_at: timestamp("consumed_at", { withTimezone: true }),
    consumed_booking_id: text("consumed_booking_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_catalog_quotes_entity").on(table.entity_module, table.entity_id),
    index("idx_catalog_quotes_expires").on(table.expires_at),
    index("idx_catalog_quotes_source").on(table.source_kind, table.source_ref),
    // Lookup index for the post-commit redemption recorder, which scans
    // for "every quote consumed by this booking" to aggregate
    // `pricing_applied_offers` per offer.
    index("idx_catalog_quotes_consumed_booking").on(table.consumed_booking_id),
  ],
)

export type SelectCatalogQuote = typeof catalogQuotesTable.$inferSelect
export type InsertCatalogQuote = typeof catalogQuotesTable.$inferInsert
