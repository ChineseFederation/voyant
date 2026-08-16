import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core"

/**
 * Local reference to `markets.exchange_rates`. Bookings reads this
 * table to convert per-item totals into the booking's base currency,
 * but doesn't pull the markets package as a hard dep — the FK rule
 * (intra-domain FKs OK, cross-domain MUST use plain text + links)
 * means we mirror the columns we need with a `Ref`.
 */
export const exchangeRatesRef = pgTable("exchange_rates", {
  id: typeId("exchange_rates").primaryKey(),
  fxRateSetId: typeIdRef("fx_rate_set_id").notNull(),
  baseCurrency: text("base_currency").notNull(),
  quoteCurrency: text("quote_currency").notNull(),
  rateDecimal: numeric("rate_decimal", { precision: 18, scale: 8 }).notNull(),
  inverseRateDecimal: numeric("inverse_rate_decimal", { precision: 18, scale: 8 }),
  /**
   * The published rate with the operator's currency-risk margin already
   * folded in (voyant#4703). When set it is what documents are converted at,
   * so a booking rollup has to use it too — otherwise the booking total and
   * the invoice raised from it disagree by exactly the margin.
   */
  effectiveRateDecimal: numeric("effective_rate_decimal", { precision: 18, scale: 8 }),
  observedAt: timestamp("observed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
})
