/**
 * Catalog plane field policy for product → pricing denormalization.
 *
 * Aggregates a "price from" value across the product's future bookable
 * default rate-plan prices so storefront cards can render `from $X`
 * without fanning out to per-option pricing on every render. See
 * `docs/architecture/catalog-architecture.md` §5.4.
 *
 * Storefront product cards filter and display by:
 *   - "trips under $1000" (filter: `priceFromAmountCents` <= 100000)
 *   - badge "from $X" (display: `priceFromAmountCents` + `priceFromCurrency`)
 *   - sort by price ascending (`priceFromAmountCents` asc)
 *
 * Wire this policy into the products registry by composing with
 * `productCatalogPolicy`:
 *
 *   const registry = createFieldPolicyRegistry([
 *     ...productCatalogPolicy,
 *     ...productPricingCatalogPolicy,
 *   ])
 *
 * and wire `createProductPricingProjectionExtension` (from
 * `@voyant-travel/commerce` pricing projection support) into
 * `createProductDocumentBuilder` so the values land in the doc.
 *
 * Why a separate field instead of reusing the existing `sellAmountCents`
 * from `productCatalogPolicy`: that path projects the product-row
 * configured default verbatim. Multi-option products often leave
 * `products.sellAmountCents` null or stale and put the real prices on
 * active rate-plan room/base/unit rows. This projection prefers those
 * bookable prices and only falls back to the product row when no rate-
 * plan price exists.
 *
 * Out of scope here (deferred):
 *   - Full schedule-aware rule resolution. The kernel reads
 *     `isDefault=true` rule prices on options that have a future
 *     bookable departure; it does NOT walk seasonal schedules or per-
 *     departure overrides.
 *   - Per-audience / per-market currency conversion. The currency we
 *     emit is `products.sellCurrency`; multi-catalog operators using
 *     mixed currencies for the same product will see prices clipped
 *     to the rules matching that currency.
 *   - `pricing.changed` event surface. Today, edits to option-price
 *     rules don't fire any event, so the bridge can only reindex on
 *     `product.updated`. Tracked separately.
 */

import { defineFieldPolicy, type FieldPolicyInput } from "@voyant-travel/catalog/contract"

const PRODUCT_PRICING_FIELD_POLICY: FieldPolicyInput[] = [
  // ── Aggregated "price from" amount ───────────────────────────────────────
  // MIN across the amounts the product's future bookable active default
  // rules actually charge — room, base and unit prices in one comparison —
  // then `products.sellAmountCents`. `null` when no source has a positive
  // amount.
  //
  // Only amounts a traveler could pay on their own take part. A room price
  // whose rule carries an occupancy `supplement` basis is a surcharge added
  // to the traveler fare, not a price, so it is excluded and the fare below
  // it becomes the "from" value; symmetrically an `all_in` rule's base
  // amount is excluded, because the resolver does not charge it. Without
  // the first rule the MIN advertised a 100 EUR single supplement as the
  // headline price of a 165 EUR tour (#4675).
  {
    path: "priceFromAmountCents",
    class: "structural",
    merge: "source-only",
    drift: "low",
    reindex: "facet-affecting",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  // ── Currency for the projected amount ────────────────────────────────────
  // `products.sellCurrency`. Stays consistent across all rule sources for
  // the projected product because we filter rule rows to ones matching
  // this currency before MIN'ing.
  {
    path: "priceFromCurrency",
    class: "structural",
    merge: "source-only",
    drift: "low",
    reindex: "facet-affecting",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  // ── Existence flag ───────────────────────────────────────────────────────
  // `false` when neither future rate-plan pricing nor the product row has
  // a positive amount. Storefront filters use this for "show only priced
  // products" and to suppress an empty `from` badge.
  {
    path: "hasPricing",
    class: "structural",
    merge: "source-only",
    drift: "low",
    reindex: "facet-affecting",
    snapshot: "on-book",
    query: "indexed-column",
    localized: false,
    visibility: ["staff", "customer", "partner"],
    editRole: "none",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
]

/**
 * Resolved pricing policy. Compose with `productCatalogPolicy` when
 * building the products registry.
 */
export const productPricingCatalogPolicy = defineFieldPolicy(PRODUCT_PRICING_FIELD_POLICY)

export { PRODUCT_PRICING_FIELD_POLICY }
