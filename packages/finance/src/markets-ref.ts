import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core"

/**
 * Local reference to `markets.exchange_rates`. Finance stores plain-text
 * `fx_rate_set_id` links and reads this table opportunistically to normalize
 * cross-currency payment/document amounts without taking a hard markets dep.
 */
export const exchangeRatesRef = pgTable("exchange_rates", {
  id: typeId("exchange_rates").primaryKey(),
  fxRateSetId: typeIdRef("fx_rate_set_id").notNull(),
  baseCurrency: text("base_currency").notNull(),
  quoteCurrency: text("quote_currency").notNull(),
  rateDecimal: numeric("rate_decimal", { precision: 18, scale: 8 }).notNull(),
  inverseRateDecimal: numeric("inverse_rate_decimal", { precision: 18, scale: 8 }),
  /**
   * The rate the owning module already folded the operator's currency-risk
   * margin into. Present from voyant#4703 onward; when set it is the rate a
   * document is converted at, so finance must NOT re-apply the margin on top.
   */
  effectiveRateDecimal: numeric("effective_rate_decimal", { precision: 18, scale: 8 }),
  commissionBps: integer("commission_bps"),
  observedAt: timestamp("observed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
})
