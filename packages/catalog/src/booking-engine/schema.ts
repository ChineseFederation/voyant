/**
 * `catalog_quotes` — short-lived quote records the booking engine writes
 * before an admitted vertical command validates and consumes them.
 *
 * One quote = one (entity_module, entity_id, scope) combination at a
 * specific time, with an `expires_at` driven by the engine's quote TTL
 * (default 10 minutes). Re-quoting the same row produces a new row;
 * quotes are not de-duped.
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
     * Promotional offers applied to this quote. Populated by the
     * `evaluatePromotions` hook on `QuoteEntityDeps` (per
     * `docs/architecture/promotions-architecture.md` §7.1.3). The
     * post-commit redemption recorder reads this back via
     * `consumed_booking_id` and aggregates into
     * `promotional_offer_redemptions`.
     *
     * Dedicated column (vs. nesting in `pricing_breakdown`) so the
     * dependency from the redemption recorder to this data is explicit
     * at the schema level — anyone touching the quote writer sees the
     * column and knows it has a downstream consumer.
     */
    pricing_applied_offers: jsonb("pricing_applied_offers").$type<AppliedOffer[]>(),

    /** Opaque adapter payload available to an admitted vertical command. */
    upstream_payload: jsonb("upstream_payload"),

    /**
     * Set when an admitted vertical command consumes this quote. Consumed
     * quotes are kept for audit.
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
