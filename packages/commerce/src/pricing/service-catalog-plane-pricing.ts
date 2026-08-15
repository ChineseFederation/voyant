/**
 * Projection extension that aggregates a "price from" amount across the
 * product's future bookable rate-plan prices and contributes
 * `priceFromAmountCents`, `priceFromCurrency`, and `hasPricing` to the
 * product search document.
 *
 * Lives in `@voyant-travel/commerce` because:
 *   - The data lives here (`option_price_rules`, `option_unit_price_rules`,
 *     `price_catalogs`).
 *   - Product owns the document-builder implementation, while this package
 *     exposes a structural extension that satisfies that builder contract.
 *
 * Wire via `createProductDocumentBuilder({ extensions: [pricingExtension] })`
 * after composing `productPricingCatalogPolicy` into the registry.
 *
 * Only amounts a traveler could actually pay on their own participate in
 * the MIN. Room amounts under an occupancy `supplement` basis are
 * surcharges added to the traveler fares, never standalone prices, so
 * they are excluded — see `fetchBookableRoomPrice`. Including them
 * advertised a single supplement as the headline price
 * ([#4675](https://github.com/voyant-travel/voyant/issues/4675)).
 *
 * Scope intentionally narrow:
 *   - **No schedule-aware rule resolution.** Only `is_default = true`
 *     rules contribute. Seasonal / promo rules with schedules don't
 *     surface here; they require per-slice rule evaluation beyond the
 *     future-departure presence check below.
 *   - **No per-departure overrides.** Same reason.
 *   - **Currency consistency.** Only rules whose catalog currency matches
 *     the product's `sellCurrency` (or whose catalog currency is null
 *     and therefore inherits the product's) are MIN'd together.
 *   - **No supplement arithmetic.** A supplement-priced product reports
 *     the traveler fare alone, which is the cheapest occupancy in the
 *     standard model (the shared-room rows are supplement 0). An
 *     operator who prices *every* occupancy at a positive supplement
 *     gets the fare without the smallest supplement added.
 *
 * Document churn: this projection is `now()`-dependent because it only
 * considers future bookable departures. A product can move to "unpriced"
 * once its final departure starts unless a row-level fallback remains.
 */

import type { IndexerSlice } from "@voyant-travel/catalog"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { sql } from "drizzle-orm"

interface PricingProjectionOptions {
  /**
   * Resolve the product's row-level `sellAmountCents` + `sellCurrency`.
   * Templates use the default raw-SQL loader; tests can stub it without
   * standing up the products schema.
   *
   * Returns `null` for both fields when the product doesn't exist.
   */
  loadProductPricing?: (
    db: AnyDrizzleDb,
    productId: string,
  ) => Promise<{ sellAmountCents: number | null; sellCurrency: string | null }>

  /**
   * Resolve future bookable rate-plan prices for the product. Tests can
   * stub this without standing up availability/product option tables.
   */
  loadRatePlanPricing?: (
    db: AnyDrizzleDb,
    productId: string,
    productCurrency: string,
  ) => Promise<RatePlanPricing>
}

interface PricingAggregate {
  priceFromAmountCents: number | null
  priceFromCurrency: string | null
  hasPricing: boolean
}

interface RatePlanPricing {
  /**
   * Amounts a traveler can pay without a category or quantity condition
   * attached — an adult or uncategorised row, no min/max quantity.
   */
  standardPrices: number[]
  /**
   * Amounts that only apply to some travelers or party sizes (child,
   * infant, senior, quantity-gated). Used only when nothing standard is
   * priced, so a child fare never undercuts an adult one.
   */
  conditionalPrices: number[]
}

/** One query's MIN over each half of `RatePlanPricing`. */
interface PriceCandidates {
  standard: number | null
  conditional: number | null
}

interface ProductProjectionExtension {
  readonly name: string
  project(
    db: AnyDrizzleDb,
    productId: string,
    slice: IndexerSlice,
  ): Promise<ReadonlyMap<string, unknown>>
}

const EMPTY_AGGREGATE: PricingAggregate = {
  priceFromAmountCents: null,
  priceFromCurrency: null,
  hasPricing: false,
}

const EMPTY_RATE_PLAN_PRICING: RatePlanPricing = { standardPrices: [], conditionalPrices: [] }

/**
 * Pure aggregation kernel. Every payable amount competes in one MIN,
 * whether it came from a room unit or a base/person unit — a product with
 * a supplement-priced option next to an all-in one must not advertise the
 * all-in room over a cheaper fare it really sells. Conditional amounts
 * only apply when nothing standard is priced, and the product row is the
 * last resort. Non-positive values are treated as absent so stale `0`
 * caches don't block nullish fallbacks in catalog consumers.
 */
function aggregatePricing(
  productPrice: number | null,
  currency: string | null,
  { standardPrices, conditionalPrices }: RatePlanPricing,
): PricingAggregate {
  const min =
    firstPositiveMin(standardPrices) ??
    firstPositiveMin(conditionalPrices) ??
    positive(productPrice)

  if (min === null) {
    return { ...EMPTY_AGGREGATE, priceFromCurrency: currency }
  }

  return {
    priceFromAmountCents: min,
    priceFromCurrency: currency,
    hasPricing: true,
  }
}

/**
 * Construct the pricing projection extension.
 *
 * Pass loaders in tests to stub DB reads; production uses raw SQL against
 * the deployed schema.
 */
export function createProductPricingProjectionExtension(
  options: PricingProjectionOptions = {},
): ProductProjectionExtension {
  const loadProductPricing = options.loadProductPricing ?? defaultLoadProductPricing
  const loadRatePlanPricing = options.loadRatePlanPricing ?? defaultLoadRatePlanPricing

  return {
    name: "products:pricing",
    async project(db, productId, _slice: IndexerSlice) {
      const product = await loadProductPricing(db, productId)
      const currency = product.sellCurrency

      // Without a product row currency we can't safely filter rules by
      // matching currency. Emit only the positive row-level fallback.
      if (!currency) {
        const out = aggregatePricing(product.sellAmountCents, null, EMPTY_RATE_PLAN_PRICING)
        return toProjectionMap(out)
      }

      const ratePlans = await loadRatePlanPricing(db, productId, currency)
      const out = aggregatePricing(product.sellAmountCents, currency, ratePlans)
      return toProjectionMap(out)
    },
  }
}

/**
 * Resolve the same "from price" value emitted by the pricing projection.
 * Promotion projection wiring uses this so strikethrough base prices
 * follow the same rate-plan-first fallback chain.
 */
export async function loadProductPriceFrom(
  db: AnyDrizzleDb,
  productId: string,
): Promise<{ amountCents: number | null; currency: string | null }> {
  const product = await defaultLoadProductPricing(db, productId)
  const currency = product.sellCurrency
  if (!currency) {
    return { amountCents: positive(product.sellAmountCents), currency: null }
  }

  const ratePlans = await defaultLoadRatePlanPricing(db, productId, currency)
  const amountCents =
    firstPositiveMin(ratePlans.standardPrices) ??
    firstPositiveMin(ratePlans.conditionalPrices) ??
    positive(product.sellAmountCents)

  return { amountCents, currency }
}

/**
 * Read the positive amounts an active default rule with a future bookable
 * departure actually charges: room amounts only where they are complete
 * prices, and base/non-room-unit amounts only where the resolver still
 * charges them. The two queries are separate because they answer different
 * eligibility questions, but their results land in one MIN.
 */
async function defaultLoadRatePlanPricing(
  db: AnyDrizzleDb,
  productId: string,
  productCurrency: string,
): Promise<RatePlanPricing> {
  try {
    const [room, base] = await Promise.all([
      fetchBookableRoomPrice(db, productId, productCurrency),
      fetchBookableBasePrice(db, productId, productCurrency),
    ])

    return {
      standardPrices: [room.standard, base.standard].filter(isNumber),
      conditionalPrices: [room.conditional, base.conditional].filter(isNumber),
    }
  } catch (error) {
    // Slim test fixtures may omit availability_slots/product_options/
    // option_units. Keep reindex failure-isolated and fall back to the
    // product row only for those expected schema gaps.
    if (isMissingCatalogPricingDependencyError(error)) {
      return EMPTY_RATE_PLAN_PRICING
    }
    throw error
  }
}

/**
 * The `active_rules` / `all_in_rules` CTE pair both price queries start
 * from: the product's active default rules whose option is active and has
 * a future bookable departure, and the subset of those whose room amounts
 * are complete prices rather than occupancy supplements.
 *
 * `option_price_rules.occupancy_price_basis` decides which is which. Under
 * `supplement` the room amount is a surcharge on top of the traveler
 * fares, never something a customer pays on its own, so it belongs in
 * neither the room MIN nor any "from" badge — advertising it turned a
 * 165 EUR fare with a 100 EUR single supplement into "from 100 EUR"
 * ([#4675](https://github.com/voyant-travel/voyant/issues/4675)).
 *
 * An unset basis is resolved the way `classifyOccupancyPrice` resolves it:
 * `all_in` only when the rule prices no traveler. The traveler test is
 * widened past that helper's rule-level `base_sell_amount_cents` to
 * include positive per-person unit prices, because an operator can put the
 * fare on either. That is not a competing classifier — the resolver sums
 * every requested unit and only drops the *rule's base amount* under
 * `all_in`, so a person unit's fare is charged in both bases and a room
 * amount is never charged instead of it.
 */
function bookableRules(productId: string, productCurrency: string) {
  return sql`
    active_rules AS (
      SELECT
        opr.id,
        opr.occupancy_price_basis::text AS occupancy_price_basis,
        COALESCE(opr.base_sell_amount_cents, 0) AS traveler_base_amount_cents
      FROM option_price_rules opr
      INNER JOIN price_catalogs pc ON pc.id = opr.price_catalog_id
      WHERE opr.product_id = ${productId}
        AND opr.active = true
        AND opr.is_default = true
        AND pc.active = true
        AND (pc.currency_code = ${productCurrency} OR pc.currency_code IS NULL)
        AND EXISTS (
          SELECT 1
          FROM product_options po
          WHERE po.id = opr.option_id
            AND po.product_id = opr.product_id
            AND po.status = 'active'
        )
        AND EXISTS (
          SELECT 1
          FROM availability_slots slot
          WHERE slot.product_id = opr.product_id
            AND slot.starts_at >= NOW()
            AND slot.status::text IN ('open', 'planned', 'confirmed')
            AND (slot.option_id IS NULL OR slot.option_id = opr.option_id)
        )
    ),
    all_in_rules AS (
      SELECT rule.id
      FROM active_rules rule
      WHERE rule.occupancy_price_basis = 'all_in'
        OR (
          rule.occupancy_price_basis IS NULL
          AND rule.traveler_base_amount_cents <= 0
          AND NOT EXISTS (
            SELECT 1
            FROM option_unit_price_rules traveler_rule
            INNER JOIN option_units traveler_unit
              ON traveler_unit.id = traveler_rule.unit_id
            LEFT JOIN option_unit_tiers traveler_tier
              ON traveler_tier.option_unit_price_rule_id = traveler_rule.id
             AND traveler_tier.active = true
            WHERE traveler_rule.option_price_rule_id = rule.id
              AND traveler_rule.active = true
              AND traveler_unit.unit_type = 'person'
              AND (
                COALESCE(traveler_rule.sell_amount_cents, 0) > 0
                OR COALESCE(traveler_tier.sell_amount_cents, 0) > 0
              )
          )
        )
    )`
}

/**
 * Shared tail of both price queries: the MIN of the standard candidates
 * and the MIN of the conditional ones, kept apart so the aggregate can
 * prefer a standard amount across *both* queries rather than letting one
 * query's conditional amount win because it ran alone.
 */
const minCandidates = sql`
    SELECT
      MIN(price) FILTER (WHERE standard_price)::int AS standard_price_cents,
      MIN(price) FILTER (WHERE NOT standard_price)::int AS conditional_price_cents
    FROM candidates
    WHERE price > 0`

/** MIN across the room-unit prices that are complete prices. */
async function fetchBookableRoomPrice(
  db: AnyDrizzleDb,
  productId: string,
  productCurrency: string,
): Promise<PriceCandidates> {
  const rows = await executeRows(
    db,
    sql`
    WITH ${bookableRules(productId, productCurrency)},
    candidates AS (
      SELECT
        unit_rule.sell_amount_cents AS price,
        (
          (
            category.id IS NULL
            OR category.category_type = 'adult'
            OR (
              category.category_type NOT IN ('child', 'infant', 'senior')
              AND category.min_age IS NULL
              AND category.max_age IS NULL
            )
          )
          AND COALESCE(unit_rule.min_quantity, 0) <= 1
          AND COALESCE(unit_rule.max_quantity, 0) = 0
        ) AS standard_price
      FROM all_in_rules rule
      INNER JOIN option_unit_price_rules unit_rule
        ON unit_rule.option_price_rule_id = rule.id
      INNER JOIN option_units unit
        ON unit.id = unit_rule.unit_id
      LEFT JOIN pricing_categories category
        ON category.id = unit_rule.pricing_category_id
      WHERE unit_rule.active = true
        AND unit.unit_type = 'room'
      UNION ALL
      SELECT
        tier.sell_amount_cents AS price,
        (
          (
            category.id IS NULL
            OR category.category_type = 'adult'
            OR (
              category.category_type NOT IN ('child', 'infant', 'senior')
              AND category.min_age IS NULL
              AND category.max_age IS NULL
            )
          )
          AND COALESCE(unit_rule.min_quantity, 0) <= 1
          AND COALESCE(unit_rule.max_quantity, 0) = 0
          AND tier.min_quantity <= 1
          AND COALESCE(tier.max_quantity, 0) = 0
        ) AS standard_price
      FROM all_in_rules rule
      INNER JOIN option_unit_price_rules unit_rule
        ON unit_rule.option_price_rule_id = rule.id
      INNER JOIN option_units unit
        ON unit.id = unit_rule.unit_id
      LEFT JOIN pricing_categories category
        ON category.id = unit_rule.pricing_category_id
      INNER JOIN option_unit_tiers tier
        ON tier.option_unit_price_rule_id = unit_rule.id
       AND tier.active = true
      WHERE unit_rule.active = true
        AND unit.unit_type = 'room'
    )
    ${minCandidates}
  `,
  )

  return readCandidates(rows[0])
}

/**
 * MIN across the amounts a traveler is charged outside a room unit: the
 * rule's base amount and every non-room unit price.
 *
 * The base amount is skipped for an `all_in` rule because the resolver
 * zeroes it there — it is often a leftover per-person figure that nobody
 * is charged, and advertising it would undercut the room price that is.
 */
async function fetchBookableBasePrice(
  db: AnyDrizzleDb,
  productId: string,
  productCurrency: string,
): Promise<PriceCandidates> {
  const rows = await executeRows(
    db,
    sql`
    WITH ${bookableRules(productId, productCurrency)},
    candidates AS (
      SELECT rule.traveler_base_amount_cents AS price, true AS standard_price
      FROM active_rules rule
      WHERE rule.id NOT IN (SELECT id FROM all_in_rules)
      UNION ALL
      SELECT
        unit_rule.sell_amount_cents AS price,
        (
          (
            category.id IS NULL
            OR category.category_type = 'adult'
            OR (
              category.category_type NOT IN ('child', 'infant', 'senior')
              AND category.min_age IS NULL
              AND category.max_age IS NULL
            )
          )
          AND COALESCE(unit_rule.min_quantity, 0) <= 1
          AND COALESCE(unit_rule.max_quantity, 0) = 0
        ) AS standard_price
      FROM active_rules rule
      INNER JOIN option_unit_price_rules unit_rule
        ON unit_rule.option_price_rule_id = rule.id
      INNER JOIN option_units unit
        ON unit.id = unit_rule.unit_id
      LEFT JOIN pricing_categories category
        ON category.id = unit_rule.pricing_category_id
      WHERE unit_rule.active = true
        AND unit.unit_type <> 'room'
      UNION ALL
      SELECT
        tier.sell_amount_cents AS price,
        (
          (
            category.id IS NULL
            OR category.category_type = 'adult'
            OR (
              category.category_type NOT IN ('child', 'infant', 'senior')
              AND category.min_age IS NULL
              AND category.max_age IS NULL
            )
          )
          AND COALESCE(unit_rule.min_quantity, 0) <= 1
          AND COALESCE(unit_rule.max_quantity, 0) = 0
          AND tier.min_quantity <= 1
          AND COALESCE(tier.max_quantity, 0) = 0
        ) AS standard_price
      FROM active_rules rule
      INNER JOIN option_unit_price_rules unit_rule
        ON unit_rule.option_price_rule_id = rule.id
      INNER JOIN option_units unit
        ON unit.id = unit_rule.unit_id
      LEFT JOIN pricing_categories category
        ON category.id = unit_rule.pricing_category_id
      INNER JOIN option_unit_tiers tier
        ON tier.option_unit_price_rule_id = unit_rule.id
       AND tier.active = true
      WHERE unit_rule.active = true
        AND unit.unit_type <> 'room'
    )
    ${minCandidates}
  `,
  )

  return readCandidates(rows[0])
}

function readCandidates(row: unknown): PriceCandidates {
  return {
    standard: readNullableInt(row, "standard_price_cents"),
    conditional: readNullableInt(row, "conditional_price_cents"),
  }
}

function isNumber(value: number | null): value is number {
  return value !== null
}

async function executeRows(db: AnyDrizzleDb, query: ReturnType<typeof sql>): Promise<unknown[]> {
  // biome-ignore lint/suspicious/noExplicitAny: #1141 supports multiple drizzle driver result shapes
  const result = await (db as any).execute(query)
  return Array.isArray(result) ? result : (result?.rows ?? [])
}

/**
 * Default loader reads the products row via raw SQL so we don't pull
 * the products schema into this file. The columns we read are stable
 * enough that a rename would break far more than this.
 */
async function defaultLoadProductPricing(
  db: AnyDrizzleDb,
  productId: string,
): Promise<{ sellAmountCents: number | null; sellCurrency: string | null }> {
  // biome-ignore lint/suspicious/noExplicitAny: #1141 keeps cross-package product lookup driver-agnostic
  const dbAny = db as any
  const result = await dbAny.execute(
    // agent-quality: raw-sql reviewed -- owner: pricing; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    sql`SELECT sell_amount_cents, sell_currency FROM products WHERE id = ${productId} LIMIT 1`,
  )
  // postgres-js returns rows as an array-like; node-postgres returns `{ rows: [...] }`.
  const rows = Array.isArray(result) ? result : (result?.rows ?? [])
  const first = rows[0] as
    | { sell_amount_cents: number | null; sell_currency: string | null }
    | undefined
  if (!first) return { sellAmountCents: null, sellCurrency: null }
  return {
    sellAmountCents: first.sell_amount_cents,
    sellCurrency: first.sell_currency,
  }
}

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && value > 0 ? value : null
}

function firstPositiveMin(values: ReadonlyArray<number>): number | null {
  let min: number | null = null
  for (const value of values) {
    if (value <= 0) continue
    if (min === null || value < min) min = value
  }
  return min
}

function readNullableInt(row: unknown, key: string): number | null {
  const value = (row as Record<string, unknown> | undefined)?.[key]
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isMissingCatalogPricingDependencyError(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null | undefined
  const code = typeof err?.code === "string" ? err.code : null
  if (code === "42P01" || code === "42703") return true

  const message = typeof err?.message === "string" ? err.message.toLowerCase() : ""
  return (
    (message.includes("relation") && message.includes("does not exist")) ||
    message.includes("no such table") ||
    message.includes("no such column")
  )
}

function toProjectionMap(a: PricingAggregate): ReadonlyMap<string, unknown> {
  return new Map<string, unknown>([
    ["priceFromAmountCents", a.priceFromAmountCents],
    ["priceFromCurrency", a.priceFromCurrency],
    ["hasPricing", a.hasPricing],
  ])
}
