/**
 * Product cost roll-up — the single owner of `products.cost_amount_cents` and
 * `products.margin_percent` (voyant#4162).
 *
 * `product_day_services.cost_currency` is a required per-row column, so one
 * itinerary routinely mixes currencies: EUR coach hire next to TRY hotel nights
 * on the same Turkish tour. The roll-up therefore groups by source currency and
 * never adds minor units across currencies.
 *
 * The stored scalar is denominated in the product's **sell currency**. That is
 * what the column already means to its consumers — the operator product page
 * formats `costAmountCents` with `product.sellCurrency`, and `marginPercent` is
 * derived against `products.sell_amount_cents`, which is quoted in that same
 * currency. Every non-sell source currency is converted through the same FX
 * machinery finance uses for invoices (`resolveFxMoneyBaseAmount`: persisted
 * `exchange_rates` first, then the caller's runtime resolver).
 *
 * Following the profitability read model's precedent, a source currency with no
 * resolvable rate is reported in `unconvertibleCurrencies` rather than guessed
 * at. Unlike that read model, a single scalar column cannot say "everything
 * except the Turkish lira", so the total is withheld (`null`) instead of
 * silently under-reporting cost and over-reporting margin. `margin_percent`
 * follows it to `null`, because a margin is only meaningful when both sides are
 * known and in the same currency.
 */

import {
  type FxMoneyInput,
  type InvoiceFxOptions,
  resolveFxMoneyBaseAmount,
} from "@voyant-travel/finance"
import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { productDayServices, productDays, productItineraries, products } from "./schema.js"

/** Cost booked in one source currency. Only ever summed within that currency. */
export interface ProductCostCurrencySubtotal {
  currency: string
  amountCents: number
}

export interface ProductCostRollup {
  /** Currency `costAmountCents` is denominated in — the product's sell currency. */
  currency: string
  /**
   * Total itinerary cost in `currency`, or `null` when at least one source
   * currency had no resolvable rate into it.
   */
  costAmountCents: number | null
  /** Margin against the sell amount, or `null` when either side is unknown. */
  marginPercent: number | null
  /** Per-source-currency subtotals, in currency order. Never collapsed blindly. */
  byCurrency: ProductCostCurrencySubtotal[]
  /** Source currencies with no resolvable FX rate into `currency`. */
  unconvertibleCurrencies: string[]
}

/** FX runtime for the roll-up — the same options finance threads into invoices. */
export type ProductCostFxOptions = InvoiceFxOptions

export interface CollapsedProductCost {
  totalCents: number | null
  unconvertibleCurrencies: string[]
}

function normalizeCurrency(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? ""
}

/**
 * Group raw service costs by source currency. Currency codes are normalized so
 * a row stored as `eur` lands in the same bucket as `EUR` instead of becoming a
 * second, separately-unconvertible currency.
 */
export function sumCostByCurrency(
  rows: Iterable<{ currency: string | null | undefined; amountCents: number }>,
): ProductCostCurrencySubtotal[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency)
    totals.set(currency, (totals.get(currency) ?? 0) + row.amountCents)
  }
  return [...totals]
    .map(([currency, amountCents]) => ({ currency, amountCents }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

/**
 * Collapse per-currency subtotals into one figure in `targetCurrency`.
 *
 * `convert` returns the subtotal restated in `targetCurrency`, or `null` when no
 * rate is available. A zero subtotal never needs a rate, so it cannot make the
 * roll-up unconvertible. Any other currency without a rate withholds the total
 * outright — an under-counted cost reads as a healthy margin, which is worse
 * than no number at all.
 */
export async function collapseCostToCurrency(
  subtotals: readonly ProductCostCurrencySubtotal[],
  targetCurrency: string,
  convert: (subtotal: ProductCostCurrencySubtotal) => Promise<number | null> | number | null,
): Promise<CollapsedProductCost> {
  let total = 0
  const unconvertibleCurrencies: string[] = []

  for (const subtotal of subtotals) {
    if (subtotal.amountCents === 0) continue
    if (targetCurrency !== "" && subtotal.currency === targetCurrency) {
      total += subtotal.amountCents
      continue
    }

    const converted =
      targetCurrency === "" || subtotal.currency === "" ? null : await convert(subtotal)
    if (converted == null) {
      unconvertibleCurrencies.push(subtotal.currency)
      continue
    }
    total += converted
  }

  return {
    totalCents: unconvertibleCurrencies.length > 0 ? null : Math.round(total),
    unconvertibleCurrencies,
  }
}

/**
 * Margin of a known cost against a known sell amount, both in the sell currency.
 * `null` whenever either side is unknown — a product with no sell price has no
 * margin, and reporting `0` there reads as "sold at cost".
 */
export function computeMarginPercent(
  sellAmountCents: number | null | undefined,
  costAmountCents: number | null,
): number | null {
  if (costAmountCents == null) return null
  if (sellAmountCents == null || sellAmountCents <= 0) return null
  return Math.round(((sellAmountCents - costAmountCents) / sellAmountCents) * 100)
}

/**
 * Recompute and persist `products.cost_amount_cents` / `products.margin_percent`
 * from the product's itinerary day services. Returns `null` when the product
 * does not exist.
 */
export async function recalculateProductCost(
  db: PostgresJsDatabase,
  productId: string,
  options: ProductCostFxOptions = {},
): Promise<ProductCostRollup | null> {
  const [product] = await db
    .select({ sellCurrency: products.sellCurrency, sellAmountCents: products.sellAmountCents })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1)

  if (!product) {
    return null
  }

  const currency = normalizeCurrency(product.sellCurrency)

  const rows = await db
    .select({
      currency: productDayServices.costCurrency,
      // Cast before multiplying: an int4 product overflows long before a
      // realistic itinerary total does. Read back through Number(), since
      // postgres-js hands int8 over as a string.
      // agent-quality: raw-sql reviewed -- owner: inventory; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      amountCents: sql<number>`coalesce(sum(${productDayServices.costAmountCents}::bigint * ${productDayServices.quantity}), 0)`,
    })
    .from(productDayServices)
    .innerJoin(productDays, eq(productDayServices.dayId, productDays.id))
    .innerJoin(productItineraries, eq(productDays.itineraryId, productItineraries.id))
    .where(eq(productItineraries.productId, productId))
    .groupBy(productDayServices.costCurrency)

  const byCurrency = sumCostByCurrency(
    rows.map((row) => ({ currency: row.currency, amountCents: Number(row.amountCents ?? 0) })),
  )

  const { totalCents, unconvertibleCurrencies } = await collapseCostToCurrency(
    byCurrency,
    currency,
    async (subtotal) => {
      // Annotated as `FxMoneyInput` so the resolved base amount and base
      // currency come back on the result type, as finance's own callers do.
      const input: FxMoneyInput = {
        amountCents: subtotal.amountCents,
        currency: subtotal.currency,
      }
      try {
        const converted = await resolveFxMoneyBaseAmount(db, input, {
          ...options,
          targetBaseCurrency: currency,
        })
        return converted.baseCurrency === currency && converted.baseAmountCents != null
          ? converted.baseAmountCents
          : null
      } catch {
        // This roll-up runs inside the day-service write path, so a rate lookup
        // that cannot even be attempted — a deployment carrying no
        // `exchange_rates` table, say — must not fail the save. An
        // unreachable rate is an unresolved rate: reported, never guessed.
        return null
      }
    },
  )

  const marginPercent = computeMarginPercent(product.sellAmountCents, totalCents)

  await db
    .update(products)
    .set({ costAmountCents: totalCents, marginPercent, updatedAt: new Date() })
    .where(eq(products.id, productId))

  return {
    currency,
    costAmountCents: totalCents,
    marginPercent,
    byCurrency,
    unconvertibleCurrencies,
  }
}
