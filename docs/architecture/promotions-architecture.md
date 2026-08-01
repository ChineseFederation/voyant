# Promotions architecture — design

Status: implemented. The historical sequenced rollout remains documented below for rationale.
Audience: anyone designing or implementing promotional offers in Voyant — auto-applied catalog discounts (storefront badges + strikethrough prices), code-redeemed discounts at checkout, and channel- / audience- / market-wide blanket discounts.

This document captures how Voyant models, evaluates, and surfaces promotional offers across both the **discovery surface** (catalog plane — search badges, strikethrough prices) and the **commercial ladder** (quote/offer/order/booking — code redemption, discount application). It resolves issue #497 and supersedes the former placeholder booking-draft code field with `promotionCode`.

The document covers a single coherent build that ships across **5 sequenced PRs** (§13). Each PR is independently mergeable and useful; the staging is for review / risk management, not for hiding scope.

## 1. Why this exists

The implementation was introduced to close three historical gaps:

1. `packages/storefront/src/validation.ts` defines `StorefrontPromotionalOffer` with all the right-shaped fields (discountType, discountValue, applicableProductIds, validFrom/To, minTravelers, stackable). It's a contract for storefront UIs to render. The storefront service exposes `resolvePromotionalOffers` / `getOfferBySlug` callback hooks but **no implementation** — templates would have to wire their own.
2. Booking drafts now use `promotionCode`, which Commerce evaluates at quote time. Finance owns Travel Credits and Bookings owns Service Vouchers; promotions never use either vocabulary.
3. The since-deleted `apps/dev` playground's `stay-booking-item-dialog.tsx` had a `voucherCode` field — but that's a hotel-confirmation voucher number from the supplier, unrelated to discount codes.

So an operator today cannot:

- Display a "Save 20%" badge on storefront search cards.
- Show a strikethrough price `~~$200~~ $160` on a card.
- Run a "20% off everything in our 'Adventure' category for the spring promo" without manually editing every product's base price.
- Run a "10% off for partners" channel-wide discount.
- Issue an `EARLYBIRD2026` code for customers to enter at checkout.
- Track which customers redeemed which code.

The catalog architecture (`catalog-architecture.md` §5.4) already establishes that the search index is the canonical place for cross-entity denormalization. The pricing module (PR4 of #493, in `packages/inventory/src/catalog-policy-pricing.ts`) already projects `priceFromAmountCents` as the configured base price across options. Promotions slot into the same shape: a separate module that owns the offer schema + rule evaluator, with a catalog-plane projection extension that decorates each product's search document with discount-aware fields, **and** a checkout-time integration that applies the same offers to the quote.

### 1.1. Why catalog-display + code redemption belong in one module

The two surfaces — catalog badge and checkout code — share:

- **The same schema** (offer name, discount type/value, validity window, conditions, scope).
- **The same rule evaluator** (find best applicable offer for `(productId, audience, market, pax, date, optional code)`).
- **The same currency handling** (offer in EUR vs product priced in USD).
- **The same stacking semantics** (default: pick best, never combine; `stackable: true` flag for special cases).

Splitting them produces two near-duplicate evaluators that drift. They ship together. The seam between them is the `code` parameter on the evaluator — auto-applied offers ignore it; code-redeemed offers require a match.

## 2. Goals and non-goals

### Goals

- **One offer schema** that covers: per-product offers, category-scoped offers, audience-scoped offers (e.g. partner-only), market-scoped offers (e.g. UK-only), and global / channel-wide offers ("everything for everyone, this week only").
- **Catalog-plane visibility.** The product search document carries denormalized offer annotations so storefront cards render the badge and strikethrough price without N+1 lookups. Promotions adds: `bestOfferId`, `bestOfferName`, `bestOfferDiscountKind`, `bestOfferDiscountPercent`, `bestOfferDiscountAmountCents`, `originalPriceFromAmountCents`, `conditionalOffer*`. Promotions does **not** overwrite the existing `priceFromAmountCents` — extensions can't read each other's output (see §3.7). Storefront consumers compute the effective price client-side; filters / sorts continue to use the list price.
- **Checkout-time code redemption.** The booking draft gains a `promotionCode` field (the existing `voucher.code` placeholder is migrated, see §7.0): validated against `promotional_offers.code`, evaluated, applied to the quote's pricing.
- **Per-slice evaluation.** A "partner-only 10% off" offer surfaces on the `audience: partner` slice's search documents with a discount applied; it does not surface on the `audience: customer` slice. Same product, different rendered price.
- **Conditions evaluator** that the schema can grow over time without a per-condition column rewrite. Initial condition: `minPax` only — date validity is already covered by `valid_from` / `valid_until` on the offer header and is not duplicated into `conditions`. Future conditions (min booking value, specific weekday, new-customer-only) extend a single `conditions` JSONB column with a typed schema; if a richer travel-window ever means something distinct from offer validity, it lands then, not now.
- **Stable redemption tracking.** When a customer redeems a code at checkout, we record (`offer_id`, `booking_id`, `code_used`, `discount_applied_cents`, `redeemed_at`). Lets operators measure ROI per offer; lets the system enforce per-customer / total redemption caps if those land later.
- **Reindex on offer mutations.** Creating, editing, expiring, or deleting an offer reindexes every affected product. Same shape as `availability.slot.changed` (PR3 of #493) — a `promotion.changed` event the catalog bridge subscribes to.
- **Real implementations** behind the existing `StorefrontPromotionalOffer` resolver hooks. Templates stop having to provide their own.

### Non-goals (for v1)

- **Loyalty programs.** "Spend $1000 → free upgrade" requires customer history + cumulative state. Out of scope; promotions here are stateless rules evaluated at quote time.
- **Bundle discounts.** "Buy product A and B together → 10% off the pair" requires multi-product joint pricing. Out of scope; v1 evaluates per-product.
- **Per-customer caps.** "Max 3 redemptions per customer" needs identity-aware redemption tracking. Tracked in the redemption table from day 1 but not enforced; a follow-up adds the cap-checking logic.
- **Total redemption caps.** Same shape: tracked but not enforced. ("First 100 customers" pattern.)
- **A/B testing infrastructure.** Offer variants under experiments; out of scope.
- **Affiliate / referral attribution.** Code-style but with commission semantics; out of scope.
- **Offer images / merchandising metadata.** The `StorefrontPromotionalOffer` DTO carries `imageMobileUrl` / `imageDesktopUrl` — kept on the schema for forward compatibility but no operator UI to manage them in v1.
- **Multi-currency offers.** A fixed-amount offer is denominated in one currency. Cross-currency (offer in EUR, product priced in USD) is rejected at validation time, not auto-converted via FX. Tracked as a follow-up if the multi-market deployments hit it.

## 3. Core architectural conclusions

### 3.1. Promotions is a Commerce-owned capability

Not a pricing-only concern. Pricing rules answer *what is the configured price right now for this option, in this catalog, on this date* — they're per-option rate tables (per #493 PR4). Promotions answer *what discount applies on top of that price for this slice*. The two have different lifecycles, different operator UIs, different audit trails (redemption tracking is a promotions concern only), and different reindex triggers. Commerce owns both so consumers use one commercial boundary without promotions becoming a standalone install seam.

`packages/commerce/src/promotions` follows the same source shape as the recently-shipped vertical packages: `schema.ts`, `service.ts`, `routes.ts`, `validation.ts`, `events.ts`. It uses Inventory contracts for product-scoped links and Commerce market data for market-scoped rules. Catalog plane wiring lives in `packages/commerce/src/promotions/service-catalog-plane-promotions.ts` (matching the `service-catalog-plane-departures` precedent in Operations). Storefront integration ships an explicit `createPromotionsStorefrontResolvers()` factory that consumers wire into the storefront service's resolver-hook fields; the resolver reads the request-scoped db supplied by `@voyant-travel/storefront`.

### 3.2. Scope is a typed discriminated union, not a list of foreign keys

A naive schema would join `promotional_offers` to a series of link tables: `_products`, `_categories`, `_destinations`, `_markets`, `_audiences`. That works for the first three but produces five join paths the rule evaluator has to traverse, and adds a sixth "global" sentinel that has no rows. Painful.

Instead, each offer carries a single `scope` JSONB column with a discriminated-union shape:

```ts
// Audience literal inlined (mirroring §9). Avoids a back-edge to
// @voyant-travel/catalog where `Visibility` lives. A unit test pins the literal
// set to the source enum.
type PromotionalOfferScope =
  | { kind: "global" }
  | { kind: "products"; productIds: string[] }
  | { kind: "categories"; categoryIds: string[] }
  | { kind: "destinations"; destinationIds: string[] }
  | { kind: "markets"; marketIds: string[] }
  | { kind: "audiences"; audiences: Array<"staff" | "customer" | "partner" | "supplier"> }
  | { kind: "fare_codes"; fareCodes: string[] }
  | { kind: "cabin_grades"; cabinGradeCodes: string[] }
```

**No `channels` scope kind in v1.** The natural fit (`channelScope`) lives on `market_product_rules` (`packages/markets/src/schema.ts:224`), not on `markets`, so a channel-scoped offer would need a per-(product, market) rule lookup. Worse, `IndexerSlice` (`packages/catalog/src/indexer/contract.ts:21`) has no channel dimension — `{ vertical, locale, audience, market }` only. Modeling channels properly means either a per-product rule join on the projection hot path or extending `IndexerSlice` to carry channel — both are larger work than promotions should drag in. Operators who need channel-wide promos in v1 model them via `audiences` (e.g., `partner` ≈ b2b) and / or per-market scoping. Tracked as a deferred follow-up in §14.

Two reasons for the JSONB shape over multiple link tables:

1. **The evaluator's matching predicate is the same for every scope kind** (a `(productId, slice, scope)` tuple). One function with a `switch (scope.kind)` is clearer than five JOINs.
2. **Adding a new scope kind doesn't migrate existing rows.** The discriminator is a new union variant; old offers stay valid.

For the product-shaped scopes (`products`, `categories`, `destinations`), we additionally maintain a denormalized link table `promotional_offer_products` (offer_id, product_id) populated when an offer is created/edited. The denormalized table is what the catalog projection joins against — the JSON `scope` is the source of truth for editing, the link table is the index for matching. Categories and destinations are expanded to product IDs at write time, so taxonomy / destination membership changes don't silently change which products an offer applies to. Slice-shaped scopes (`global`, `markets`, `audiences`) leave the link table empty and are matched at evaluation time against `slice.market` / `slice.audience`. Fare-code and cabin-grade scopes also leave the link table empty; they are checkout-line dimensions supplied by vertical booking flows, not product-index dimensions.

### 3.3. Stacking is single-pick by default, with `stackable: true` as the explicit override

If three offers apply to the same product+slice, the rule evaluator picks **one**: the largest discount as a percentage of the product's `priceFromAmountCents`. Operators can flip `stackable: true` on individual offers to compose them; multiple stackable offers combine multiplicatively (so 10% × 10% = 19%, not 20%).

The rationale: most operators want predictable behavior, and "best discount wins" is the predictable default. Stacking is opt-in because it produces math that's harder to communicate to customers ("How did I get 19%?") and easier to abuse (combining a code with a category discount when neither was meant to stack). Operators who really want stacking explicitly mark each offer.

### 3.4. Codes are an attribute of the offer, not a separate entity

An offer either auto-applies (no `code` column value) or is code-gated (`code` is set). Code-gated offers do not appear on storefront cards — they only apply when the customer enters the matching code at checkout. Auto-applied offers appear on cards and apply silently to the quote.

A single offer row cannot be both auto-applied and code-gated. The marketing pattern "advertise the discount AND require a code" is modelled as **two separate offers** — one auto-applied (drives the badge), one code-gated (drives the redemption when the customer types the code). Both flow through the evaluator together at checkout (the algorithm in §5.2 does NOT exclude auto offers when a code is supplied), so stacking semantics (§3.3) decide whether they compose. Operators typically share a name across the pair for clarity but the system treats them as independent rows.

Code uniqueness is enforced at the offer-table level: a partial unique index `(lower(code)) WHERE code IS NOT NULL AND active = true` catches double-use across active offers. Archived offers (`active = false`) free up their code for reuse. Code matching is case-insensitive (stored lowercase, compared lowercase); the customer's typed casing is preserved on the redemption row for audit.

Customer-facing manual application follows the same conflict policy as quote-time pricing. `POST /v1/public/offers/:slug/apply` only applies non-code offers; code-gated offers must go through `POST /v1/public/offers/redeem`. When a manually applied or code-gated offer collides with auto-applied offers, all eligible candidates enter the evaluator together. The best non-stackable discount wins by default. Stackable offers compose only when the selected path is entirely stackable. Public responses return conflict metadata (`best_discount_wins` or `stackable_compose`) instead of exposing internal rule details.

### 3.5. Redemption tracking is per-booking, not per-customer or per-line-item

The `promotional_offer_redemptions` table records `(offer_id, booking_id, code_used, discount_applied_cents, currency, redeemed_at)` with at most **one row per `(offer_id, booking_id)`** (enforced by the unique index in §4.3).

A single booking can produce multiple `booking_catalog_snapshot` rows (one per participating CatalogEntry — package + hotel + each excursion). When the same auto-applied offer matches several snapshots in one booking, the recorder **aggregates** at insert time — sums `discount_applied_cents` across all snapshots' `pricing_applied_offers` for that offer, writes a single row. Per-line-item tracking would need a `snapshot_id` column and would complicate "redemptions by offer" reporting; per-booking is the right granularity for ROI analysis.

Per-customer tracking would require attaching identity to every redemption — works for code-redeemed offers (the customer is on the booking) but doesn't apply to auto-applied catalog offers (no customer at index time). The booking → customer join is available downstream for any operator who wants per-customer reporting — they JOIN `promotional_offer_redemptions` to `bookings.personId`.

### 3.6. Catalog never depends on `@voyant-travel/commerce` directly

The catalog package is downstream of every vertical and must stay generic. Hard-importing the promotions evaluator from `quote.ts` would invert the dependency direction and make promotions non-optional for any catalog consumer.

The integration points are split by lifecycle:

**Quote-time** (synchronous, must mutate the in-memory quote): an injected dependency on `QuoteEntityDeps`, mirroring the content enricher precedent at `packages/catalog/src/booking-engine/quote.ts:118`:

```ts
// in @voyant-travel/catalog
export interface QuoteEntityDeps {
  // ...existing fields...
  evaluatePromotions?: (input: PromotionEvaluationInput) => Promise<PromotionEvaluationOutput>
}
```

**Commit-time** (async, side-effect-only): a `booking.confirmed` event subscriber, mirroring the existing `captureSnapshotGraph` pattern in the operator catalog-bridge. **No `BookEntityDeps` hook**. The reason: `bookEntity` (`packages/catalog/src/booking-engine/book.ts:175-220`) does sequential writes (snapshot capture, mark-quote-consumed) without an enclosing `db.transaction(...)`, and the owned-product path opens its own transaction in `createBooking` (`packages/finance/src/service-booking-create.ts`). A hook claiming "atomic with commit" would be misleading — there is no single commit transaction to be atomic with.

The subscriber pattern matches reality:

```ts
// promotions package — registered by templates on the event bus
eventBus.subscribe<BookingConfirmedEvent>("booking.confirmed", async ({ data }) => {
  await withDbFromEnv(env, async (db) => {
    await recordPromotionRedemptionsForBooking(db, data.bookingId)
  })
})
```

The recorder reads `pricing_applied_offers` from `catalog_quotes` (joined to the booking via the new `booking_id` column on `catalog_quotes`, set during `bookEntity` commit; see §7.1.1). It does NOT read from the snapshot to avoid an ordering race with the catalog-bridge's `captureSnapshotGraph` subscriber, which fires on the same event.

`@voyant-travel/commerce` exports the adapter factories: `createCatalogPromotionEvaluator(db)` (matches `QuoteEntityDeps.evaluatePromotions`) and `createBookingConfirmedRedemptionSubscriber(env)` (subscriber). The operator starter wires the evaluator into `quoteEntity` deps and registers the subscriber on the event bus. When unwired, the catalog skips evaluation and no redemptions are recorded.

### 3.7. The catalog plane annotates with offer fields; it does not overwrite `priceFromAmountCents`

The product search document already carries `priceFromAmountCents` (PR4 of #493), produced by `pricingExtension`. The natural shape would be "promotions overwrites that field with the discounted value". **It can't.**

`ProductProjectionExtension.project(db, productId, slice)` (`packages/inventory/src/service-catalog-plane.ts:262`) receives only the product ID and slice — extensions run **independently in parallel** (`Promise.all(extensions.map(ext => ext.project(...)))` at `:351`), then their result maps are merged. There is no "previous extension's output" channel. Promotions cannot read `pricingExtension`'s `priceFromAmountCents` to subtract from it.

Possible fixes considered:

- **Ordered extensions with shared state** — add a `priorProjections: Map<string, unknown>` parameter to `project()`, run extensions sequentially. Real architectural change to the products catalog-plane contract; affects every existing extension.
- **Composite extension** — fold pricing + promotions into one extension that reads both sources internally. Couples the two modules.
- **Promotions reproduces pricing's logic** — duplication, drift risk.
- **Annotate-only**: promotions emits offer metadata + the un-discounted MIN; storefront consumers compute the effective price client-side.

**v1 picks annotate-only.** Promotions does not touch `priceFromAmountCents`. The product document gains:

- `bestOfferId: string | null`
- `bestOfferName: string | null`
- `bestOfferDiscountKind: "percentage" | "fixed_amount" | null`
- `bestOfferDiscountPercent: number | null`
- `bestOfferDiscountAmountCents: number | null`
- `originalPriceFromAmountCents: number | null` — copied from pricing's `priceFromAmountCents` at evaluation time **only when an offer applies** (so consumers know the list price to strike through). Computed by re-querying the same source pricing reads (a bounded duplication: a single MIN over option rules, not the full pricing-rule resolver). When no offer applies, `null`.
- Conditional offer fields per §5.3.

Storefront / search consumers compute the effective price client-side: `effective = bestOfferDiscountKind === "percentage" ? round(price × (1 - bestOfferDiscountPercent/100)) : price - bestOfferDiscountAmountCents`. Catalog filters and sorts continue to work against `priceFromAmountCents` (the list price). A customer searching `< $200` won't find a `$250 → $180` discounted product via the filter — **acknowledged trade-off**, called out as a v1 limitation; revisit when the ordered-extension contract change lands (tracked in §15.1).

Storefront cards still render correctly: `<s>{originalPriceFromAmountCents}</s> {effective}` when an offer applies, plain `{priceFromAmountCents}` otherwise.

## 4. Schema

### 4.1. `promotional_offers`

```sql
CREATE TABLE promotional_offers (
  id text PRIMARY KEY,                          -- typeid prefix: pofr
  name text NOT NULL,                           -- display name ("Spring Sale 2026")
  slug text NOT NULL,                           -- URL-stable; uniqueness scoped to active rows
  description text,
  discount_type text NOT NULL,                  -- "percentage" | "fixed_amount"
  discount_percent numeric(5, 2),               -- e.g. 20.00 for 20%; required when type='percentage'
  discount_amount_cents integer,                -- required when type='fixed_amount'
  currency text,                                -- required when type='fixed_amount'; ISO 4217
  scope jsonb NOT NULL,                         -- discriminated union, see §3.2
  conditions jsonb NOT NULL DEFAULT '{}',       -- { minPax?: int }; Zod-validated, future-extensible
  valid_from timestamptz,                       -- NULL = no lower bound
  valid_until timestamptz,                      -- NULL = no upper bound
  code text,                                    -- NULL = auto-applied; non-NULL = code-gated
  stackable boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb,                               -- operator-controlled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_promotional_offers_active_validity ON promotional_offers (active, valid_from, valid_until);
CREATE UNIQUE INDEX uidx_promotional_offers_slug_active ON promotional_offers (slug) WHERE active = true;
CREATE UNIQUE INDEX uidx_promotional_offers_code_active ON promotional_offers (lower(code)) WHERE code IS NOT NULL AND active = true;
```

`(active, valid_from, valid_until)` index supports the rule evaluator's hot path: "list every active offer whose validity window covers `now()`".

### 4.2. `promotional_offer_products` (denormalized scope materialization)

```sql
CREATE TABLE promotional_offer_products (
  offer_id text NOT NULL REFERENCES promotional_offers(id) ON DELETE CASCADE,
  product_id text NOT NULL,                     -- text FK convention, no Drizzle .references
  PRIMARY KEY (offer_id, product_id)
);

CREATE INDEX idx_pop_product ON promotional_offer_products (product_id);
```

Populated by service-layer code on offer create/update for `scope.kind ∈ {products, categories, destinations}`. For `categories` and `destinations`, the service expands the scope IDs to the current product set at write time. Recomputation triggered by category- or destination-membership mutations is **out of scope for v1**; operators who add a product to a category / destination and want it picked up by an existing offer either re-save the offer or wait for the next offer edit. Tracked as a follow-up.

Scopes that are not product-shaped (`global`, `markets`, `audiences`, `fare_codes`, `cabin_grades`) leave this table empty for that offer — they are matched at evaluation time against slice or booking-line context, not via the link table.

### 4.3. `promotional_offer_redemptions`

```sql
CREATE TABLE promotional_offer_redemptions (
  id text PRIMARY KEY,                          -- typeid prefix: pofx
  offer_id text NOT NULL REFERENCES promotional_offers(id) ON DELETE RESTRICT,
  booking_id text NOT NULL,                     -- text FK
  code_used text,                               -- the literal code the customer entered (case preserved); NULL for auto-applied
  discount_applied_cents integer NOT NULL,
  currency text NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_por_offer ON promotional_offer_redemptions (offer_id);
CREATE INDEX idx_por_booking ON promotional_offer_redemptions (booking_id);
CREATE UNIQUE INDEX uidx_por_offer_booking ON promotional_offer_redemptions (offer_id, booking_id);
```

`ON DELETE RESTRICT` on `offer_id`: operators must explicitly archive an offer (via `active = false`) before deletion if redemptions exist. Prevents accidental loss of audit trail.

The `(offer_id, booking_id)` unique index has two jobs:

1. **Aggregation**: enforces "one row per offer per booking", so the recorder must sum `discount_applied_cents` across all line-item snapshots that the offer matches (per §3.5) before inserting.
2. **Idempotency**: the recorder hook (§7.3) runs inside the booking commit, but a retried commit on the same booking (idempotent commit per `booking_catalog_snapshot.idempotency_key`) won't double-insert. The recorder uses `INSERT … ON CONFLICT (offer_id, booking_id) DO UPDATE SET discount_applied_cents = EXCLUDED.discount_applied_cents` so a retry refreshes the aggregate cleanly even if intervening logic recomputed it.

### 4.4. TypeID prefix registrations

Add to `packages/db/src/lib/typeid-prefixes.ts`:

- `promotional_offers: "pofr"`
- `promotional_offer_redemptions: "pofx"`

(`promotional_offer_products` is a join table without an `id` column.)

### 4.5. Schemas this depends on but does NOT reference via Drizzle FK

Per the cross-module decoupling rule: `product_id` (in link + redemptions) and `booking_id` (in redemptions) are plain `text` columns with no `.references()`. Cross-module integrity is enforced at the service layer, not the FK level.

## 5. Rule evaluator

The evaluator is the heart of the module. One function, two callers (catalog projection + checkout quote).

### 5.1. Signature

```ts
export interface OfferEvaluationContext {
  productId: string
  slice: {
    audience: "staff" | "customer" | "partner" | "supplier"
    market: string                              // market id
  }
  pax?: number                                  // total travelers; absent at catalog-index time
  date?: Date                                   // defaults to now()
  code?: string                                 // case-insensitive; absent for auto-applied flow
  basePriceCents: number                        // the originalPriceFromAmountCents
  baseCurrency: string
}

export interface AppliedOffer {
  offerId: string
  offerName: string
  discountAppliedCents: number                  // the actual cents off, computed from base price
  discountedPriceCents: number                  // basePriceCents - discountAppliedCents
  currency: string                              // matches the surrounding ctx.baseCurrency; carried per-row
                                                // so the redemption recorder can insert without context
  // For badge display:
  discountKind: "percentage" | "fixed_amount"
  discountPercent: number | null                // populated when kind=percentage
  discountAmountCents: number | null            // populated when kind=fixed_amount
  appliedCode: string | null                    // null for auto-applied
  stackable: boolean
}

/**
 * An offer that *would* apply if a missing input were supplied — typically
 * a `minPax` condition the catalog-plane caller can't satisfy because pax
 * isn't known at index time. Surfaced for UI hints like "From 4 pax: extra 5% off".
 */
export interface ConditionalOffer {
  offerId: string
  offerName: string
  discountKind: "percentage" | "fixed_amount"
  discountPercent: number | null
  discountAmountCents: number | null
  /** Why it's only conditional, with the structured trigger so the UI can render it. */
  unmet: { kind: "min_pax"; required: number }
}

/** Outcome of code validation when `ctx.code` is supplied. `null` when ctx.code was not set. */
export type CodeStatus =
  | null
  | { kind: "code_valid" }
  | { kind: "code_not_found" }
  | { kind: "code_expired" }
  | { kind: "code_not_yet_valid" }
  | { kind: "code_not_applicable"; reason: "scope" | "min_pax" | "currency" }

export interface EvaluationResult {
  /** All applied offers (1+ when stacking; 0 when no offer applies). May include a code-gated offer alongside auto offers. */
  applied: AppliedOffer[]
  /** The single best offer (largest discount among the applied set), or null if none. Always references one row in `applied`. */
  best: AppliedOffer | null
  /** Conditionally applicable — a missing input would make them apply. Only populated by the catalog-plane caller (no `ctx.pax`). Empty for checkout. */
  conditional: ConditionalOffer[]
  /** Aggregate summary across all applied offers. Same as the single `best` when stacking is disabled. */
  total: {
    discountAppliedCents: number               // sum of applied[*].discountAppliedCents
    discountedPriceCents: number               // basePriceCents - total.discountAppliedCents
  }
  /** Set when `ctx.code` was supplied. Drives the checkout caller's `invalidReason` mapping (§7.2). */
  codeStatus: CodeStatus
}

export async function evaluateOffersForProduct(
  db: AnyDrizzleDb,
  ctx: OfferEvaluationContext,
): Promise<EvaluationResult>
```

### 5.2. Algorithm

The algorithm separates **code validation** (which can produce specific error reasons) from **auto-offer evaluation** (which never blocks). Both contribute to the final applied set.

#### 5.2.1. Code validation (only when `ctx.code` is set)

Performed first, against ALL offers (not validity-filtered) so it can distinguish "doesn't exist" from "expired" from "not applicable yet":

1. Look up the offer by `lower(code) = lower(ctx.code)` AND `active = true`. If no row → return immediately with `codeStatus: { kind: "code_not_found" }`.
2. Classify validity against `ctx.date`:
   - `valid_until < ctx.date` → `codeStatus: { kind: "code_expired" }`. Return.
   - `valid_from > ctx.date` → `codeStatus: { kind: "code_not_yet_valid" }`. Return.
3. Apply the same scope filter (§5.2.3) and conditions filter (§5.2.4) used for auto offers. If excluded → `codeStatus: { kind: "code_not_applicable", reason }`. Return.
4. Otherwise mark the code-gated offer as a **valid candidate** and let it flow into the auto-offer composition step alongside any matching auto offers.

The `codeStatus` is surfaced to the checkout caller as `invalidReason` per §7.2. The catalog-plane caller never supplies `ctx.code`, so this entire phase is skipped.

#### 5.2.2. Auto-offer candidate fetch

Load every active offer whose `valid_from` / `valid_until` window includes `ctx.date` AND whose `code IS NULL`. Use the `(active, valid_from, valid_until)` index for the range scan. The code-gated offer that survived §5.2.1 (if any) joins this set as one additional candidate.

#### 5.2.3. Scope filter

For each candidate, evaluate scope:
- `global`: matches.
- `products`: candidate ID in the link table for this `productId`.
- `categories`: same (link table is materialized).
- `destinations`: same as `categories` — link table is materialized at write time, no taxonomy / destination join on the hot path.
- `markets`: `slice.market` ∈ `scope.marketIds`.
- `audiences`: `slice.audience` ∈ `scope.audiences`.

#### 5.2.4. Conditions filter

Evaluate `conditions.minPax` against `ctx.pax`:

- `ctx.pax` undefined AND offer has `minPax`: push into `result.conditional` with `unmet: { kind: "min_pax", required }`. Do not include in `applied`.
- `ctx.pax` supplied AND below `minPax`: excluded entirely. (For a code-gated offer this surfaces as `code_not_applicable` per §5.2.1.)
- `ctx.pax` supplied AND meets / no condition: candidate proceeds.

#### 5.2.5. Currency filter

For `fixed_amount` offers, `currency` must equal `ctx.baseCurrency`. Mismatches are silently dropped (logged for ops). Percentage offers pass through.

#### 5.2.6. Stacking pick

Partition surviving offers into `stackable` and `non-stackable`. Pick the single best non-stackable offer (largest cents off the base) and separately compose all `stackable` offers multiplicatively. Apply whichever path yields the larger total discount — never both. Mixing a non-stackable offer *into* a stackable composition is out of scope for v1; if operators need that, they make the relevant offer stackable.

#### 5.2.7. Apply

Compute `discountAppliedCents` per offer, total = sum of applied. Return the assembled `EvaluationResult` with `applied`, `best`, `conditional`, `total`, and (when `ctx.code` was set) `codeStatus`.

### 5.3. Catalog-plane caller

The catalog-plane projection calls the evaluator once per `(productId, slice)` with `pax: undefined`, `date: now()`, `code: undefined`. A single `EvaluationResult` returns both the applied set (drives the badge + effective price) and the `conditional` array (drives the "From 4 pax: extra 5% off" hint). The projection picks `result.best` for badge fields and `result.conditional[0]` (sorted by discount magnitude) for the conditional hint. Rendered fields:

- `hasOffer: boolean` — true when `result.best != null`.
- `bestOfferName: string | null` — from `result.best.offerName`.
- `bestOfferDiscountPercent: number | null` — populated for percentage offers.
- `bestOfferDiscountAmountCents: number | null` — populated for fixed-amount offers.
- `priceFromAmountCents: number` — effective price; equals `result.total.discountedPriceCents` when `best != null`, otherwise the un-discounted MIN.
- `originalPriceFromAmountCents: number | null` — populated only when `best != null` (to keep documents lean when no discount applies).
- `conditionalOfferName: string | null` — from `result.conditional[0]?.offerName`.
- `conditionalOfferDiscountPercent: number | null`
- `conditionalOfferDiscountAmountCents: number | null`
- `conditionalOfferMinPax: number | null` — from `result.conditional[0]?.unmet.required` when `unmet.kind === "min_pax"`.

### 5.4. Checkout caller

The checkout flow calls the evaluator with `pax: <traveler count>`, `date: <booking date>`, and `code: draft.promotionCode`. It receives the actually-applicable offer. The booking quote applies the discount to its computed total. The `promotional_offer_redemptions` row is inserted at booking commit time, not at quote time (quotes can expire without becoming bookings).

Because the checkout caller supplies `pax`, no offer should be returned in `conditional` — a `minPax` violation here is a hard exclusion, not a "would apply if". The catalog-plane caller (no pax) is the only path that populates `result.conditional`.

## 6. Catalog plane integration

Mirrors the destinations / taxonomy / departures / pricing pattern from #493:

- **`packages/inventory/src/catalog-policy-promotions.ts`** declares the `productPromotionsCatalogPolicy` field policy entries — paths, `localized: false` (offer names are operator-managed in one language for v1; localization tracked as follow-up), `reindex: "facet-affecting"`, `query: "indexed-column"`, `snapshot: "on-quote-and-book"`, audience visibility `["staff", "customer", "partner"]`.
- **`packages/commerce/src/promotions/service-catalog-plane-promotions.ts`** lives here (not in `products`) because the data lives here, mirroring the `@voyant-travel/operations/service-catalog-plane-departures` precedent. Exports `createProductPromotionsProjectionExtension()`. It receives a slice, looks up applicable offers via the rule evaluator (with `pax: undefined` so the catalog gets the conditional set, no `code` so code-gated offers are excluded), and contributes the projection map. No `executionCtx` concerns — projections run inside `withDbFromEnv`-wrapped subscribers per the lifecycle audit (#510).
- **Annotation-only contract** (per §3.7). The extension does NOT overwrite `priceFromAmountCents`. It contributes only the `bestOffer*`, `originalPriceFromAmountCents`, `conditionalOffer*` fields. Storefront consumers compute the effective price client-side.
- **Operator starter wiring**: `apps/operator/src/api/lib/catalog-runtime.ts` composes `productPromotionsCatalogPolicy` into the products registry alongside destinations / taxonomy / departures / pricing, and adds `createProductPromotionsProjectionExtension()` to the extensions list of `createProductsDocumentBuilder`.
- **Reindex triggers** — two kinds:
  - **Mutation-driven**: `PROMOTION_CHANGED_EVENT = "promotion.changed"` emitted by service mutations. See §9.1.
  - **Time-driven (boundary scheduler)**: a cron emits `promotion.changed` events when offers transition active / inactive at `valid_from` / `valid_until` boundaries — without it, the index would silently show expired discounts until another mutation triggered a reindex. See §9.2.

## 7. Booking-engine integration

### 7.0. Field rename: `voucher.code` → `promotionCode`

The placeholder field on `BookingDraft` (`packages/catalog/src/booking-engine/contracts.ts:343`) is renamed in PR4 from `voucher: { code: string }` to `promotionCode: string` (a plain string, not a wrapped object — there's no other voucher-shaped data to carry alongside the code).

Finance owns **Travel Credits**, while Bookings owns Service Vouchers. Promotions are a third mechanism: a percentage or fixed discount applied at quote time. A Travel Credit carries stored value and is redeemed against an amount due; a Service Voucher is a fulfillment artifact. Promotion fields therefore use `promotionCode` and never either credit or voucher terminology.

There are no live consumers of `draft.voucher.code` today — the audit in §1 confirms it. The rename is a single-call-site change in PR4 with no migration concern.

### 7.1. Quote-time evaluation via injected hook

`@voyant-travel/catalog` does **not** import from `@voyant-travel/commerce`. Instead, `quoteEntity` calls a new optional `evaluatePromotions` dependency on `QuoteEntityDeps` (per §3.6), which the operator starter wires to `createCatalogPromotionEvaluator(db)` from `@voyant-travel/commerce`.

#### 7.1.0. What "discount" applies to

`PricingBasis` has no `totalCents` field — the actual columns are `base_amount`, `taxes`, `fees`, `surcharges`, `currency` (`packages/catalog/src/snapshot/schema.ts:21`). The promotion discount applies to **`base_amount` only** (pre-tax), for two reasons:

1. **Tax recompute compatibility.** The operator starter runs `applyOperatorTaxToQuoteResult` after `quoteEntity` (`apps/operator/src/api/catalog-booking.ts:87`) — it computes taxes against the base. If the discount were applied post-tax, the operator's tax recompute would either undo the discount or double-tax the customer. Discounting the base before tax means the downstream tax step naturally produces a consistent total.
2. **Operator clarity.** "20% off" universally means "20% off the list price", not "20% off the tax-inclusive total". Per-jurisdiction tax then applies to the discounted base.

`fees` and `surcharges` are unaffected by promotions in v1 (they're typically supplier or platform charges that operators don't want to discount). A future config flag could let an operator opt to discount fees too.

#### 7.1.1. Hook input / output

```ts
// in @voyant-travel/catalog
export interface PromotionEvaluationInput {
  productId: string
  slice: { audience: "staff" | "customer" | "partner" | "supplier"; market: string }
  pax?: number
  date?: Date
  code?: string
  basePriceCents: number      // = round(pricing.base_amount * 100); cents math is reliable
  baseCurrency: string        // = pricing.currency
}

export interface PromotionEvaluationOutput {
  applied: AppliedOffer[]
  best: AppliedOffer | null
  total: { discountAppliedCents: number; discountedPriceCents: number }
  codeStatus: CodeStatus      // null when no code supplied
}
```

#### 7.1.2. Quote-time pseudocode

Inside `quoteEntity`, after the adapter returns `pricing` (`PricingBasis`):

```ts
if (deps.evaluatePromotions) {
  const baseCents = Math.round(pricing.base_amount * 100)
  const offerEval = await deps.evaluatePromotions({
    productId: entityId,
    slice: { audience: scope.audience, market: scope.market },
    pax: parameters?.pax,
    date: parameters?.dateRange?.start ?? new Date(),
    code: parameters?.promotionCode,
    basePriceCents: baseCents,
    baseCurrency: pricing.currency,
  })

  // Surface code-validation errors as quote-level invalidReason (§7.2).
  if (offerEval.codeStatus && offerEval.codeStatus.kind !== "code_valid") {
    return { available: false, invalidReason: offerEval.codeStatus.kind }
  }

  if (offerEval.applied.length > 0) {
    // Subtract from base; downstream tax recompute (operator starter) sees the new base.
    pricing.base_amount = (baseCents - offerEval.total.discountAppliedCents) / 100
    pricing.appliedOffers = offerEval.applied   // see §7.1.3 for persistence
    // taxes / fees / surcharges left untouched here — operator starter recomputes
    // taxes against the new base in the post-quoteEntity transform step.
  }
}
```

#### 7.1.3. Persisting `appliedOffers` end-to-end

`PricingBasis` (`packages/catalog/src/snapshot/schema.ts:21`) is the in-memory contract; the database side has its own shape. Today's persistence writes structured price columns plus a `pricing_breakdown` JSONB on **two tables**: `catalog_quotes` (`packages/catalog/src/booking-engine/schema.ts:20`, written by `quoteEntity`) and `booking_catalog_snapshot` (`packages/catalog/src/snapshot/schema.ts:36`, written post-commit by the catalog-bridge `booking.confirmed` subscriber via `captureSnapshotGraph`). A new `appliedOffers` field on `PricingBasis` would be silently dropped without a corresponding persistence path on each table.

PR4 therefore does **four** things, not one:

1. Add `appliedOffers?: AppliedOffer[]` to `PricingBasis` in-memory and update `readPricingBasis` (`packages/catalog/src/snapshot/schema.ts:111`) to hydrate it.
2. Add a **dedicated `pricing_applied_offers` JSONB column** to `catalog_quotes` (typed `$type<AppliedOffer[]>()`), populated by `quoteEntity` after `evaluatePromotions` runs. Separate from `pricing_breakdown` — the column is the contract for the commit-time redemption subscriber (§7.3) and a top-level column makes that contract explicit at the schema level.
3. Add a `booking_id` column (`text`, nullable, indexed) to `catalog_quotes`. `bookEntity` sets it inside `markQuoteConsumed` (`packages/catalog/src/booking-engine/book.ts:222`) when a quote is successfully consumed. The redemption subscriber uses this index to find all quotes belonging to a freshly-confirmed booking.
4. Add the same dedicated `pricing_applied_offers` column to `booking_catalog_snapshot` and have `captureSnapshotGraph` copy it from the source quote when freezing. The snapshot copy is for audit only (survives source-offer deletion); the redemption subscriber reads from `catalog_quotes`, not the snapshot, to avoid an ordering race with `captureSnapshotGraph` (both fire on `booking.confirmed`).

Why a dedicated column over nesting in `pricing_breakdown`: the redemption recorder runs inside the booking commit transaction and depends on this data to fire its inserts. A top-level column makes that dependency explicit at the schema level — anyone touching the snapshot writer sees the column and knows it has a downstream consumer. Burying the same data inside a generic `pricing_breakdown` JSONB hides the contract behind a JSON path that's easy to forget, easy to break, and easy to silently strip when someone refactors the breakdown shape.

The cost is one extra column on two tables. Acceptable given the contract clarity.

The audit row in `promotional_offer_redemptions` (§4.3) is the source of truth for redemption analytics; `pricing_applied_offers` on the snapshot is the customer-facing "what they were shown".

### 7.2. Code validation errors

If the customer enters an unknown code, `quoteEntity` returns `available: false, invalidReason: "code_not_found"`. The storefront UI shows an error inline at the promotion-code field. Other code-validation outcomes:

- `code_expired` — code matched a real offer but `valid_until` is in the past.
- `code_not_yet_valid` — `valid_from` is in the future.
- `code_not_applicable` — code matched, but scope / conditions excluded it (e.g. wrong product, pax below minimum).

Each is a distinct `invalidReason` so the UI can render the right message.

### 7.3. Redemption recording at commit (`booking.confirmed` subscriber)

Promotions ships a subscriber on `booking.confirmed`, registered by the operator starter alongside the existing catalog-bridge subscriber. The subscriber:

1. Queries `catalog_quotes WHERE booking_id = :bookingId` (the column added in §7.1.3 step 3) to find every quote that contributed to the booking — typically one per CatalogEntry (a TUI package booking might produce a quote per package, hotel, excursion, departure).
2. Reads `pricing_applied_offers` from each row.
3. Aggregates per-offer across all quotes: sums `discount_applied_cents` for each `offerId`, picks the first non-null `appliedCode` if any.
4. Upserts one row per offer into `promotional_offer_redemptions` using `INSERT … ON CONFLICT (offer_id, booking_id) DO UPDATE SET discount_applied_cents = EXCLUDED.discount_applied_cents` — the `(offer_id, booking_id)` unique index from §4.3 makes the upsert idempotent across event-bus retries.

```ts
// packages/commerce/src/promotions/service-booking-confirmed.ts
export function createBookingConfirmedRedemptionSubscriber(env: WorkersEnv) {
  return async ({ data }: { data: BookingConfirmedEvent }) => {
    await withDbFromEnv(env, async (db) => {
      await recordPromotionRedemptionsForBooking(db, data.bookingId)
    })
  }
}
```

#### 7.3.1. Honest about what this guarantees

`bookEntity` (`packages/catalog/src/booking-engine/book.ts:175`) does sequential writes — `captureSnapshot` then `markQuoteConsumed` — without an enclosing `db.transaction(...)`. The owned-product `createBooking` path opens its own transaction in `packages/finance/src/service-booking-create.ts`. There is **no single commit transaction** to be atomic with. An earlier draft of this doc claimed "atomic with commit" via a `BookEntityDeps` hook; that was wrong.

The subscriber pattern accepts the trade-off:

- **Pro**: matches the existing event-driven pattern (catalog-bridge / snapshot capture). No new hook on `BookEntityDeps`. Catalog API surface stays minimal.
- **Pro**: idempotent retries via the unique constraint, so transient subscriber failures self-heal on the event bus's retry / replay path.
- **Con**: a permanently-failing subscriber (e.g., DB outage during the entire retry window) leaves a committed booking with no redemption row. Ops can backfill from `pricing_applied_offers` on the snapshot — that field exists precisely to make backfill possible without depending on the live offer rows.
- **Mitigation**: subscriber emits a structured warning on failure (`[promotions] redemption subscriber failed bookingId=…`) so the catalog-bridge log + ops dashboards surface it. A periodic reconciliation job (out of scope for v1) could close the gap entirely if the audit gap turns out to matter.

#### 7.3.2. Subscriber ordering vs `captureSnapshotGraph`

Both the catalog-bridge `captureSnapshotGraph` subscriber AND the promotions redemption subscriber fire on the same `booking.confirmed` event. Subscribers run in parallel; there is no order guarantee. **The redemption subscriber must not depend on the snapshot existing** — that's why it reads from `catalog_quotes` (the source of truth, written by `quoteEntity`), not from `booking_catalog_snapshot.pricing_applied_offers` (which may not exist yet when the subscriber fires). The snapshot copy of the field is for long-term audit only.

## 8. Storefront integration

The existing placeholder hooks in `packages/storefront/src/service.ts` (`listApplicableOffers`, `getOfferBySlug`) get a real implementation in `packages/commerce/src/promotions/service-storefront.ts`. The same resolver surface owns customer-facing mutations:

```ts
export function createPromotionsStorefrontResolvers(): StorefrontOfferResolvers {
  return {
    listApplicableOffers: async ({ productId, departureId, locale }) => { ... },
    getOfferBySlug: async ({ slug, locale }) => { ... },
    applyOffer: async ({ slug, body }) => { ... },
    redeemOffer: async ({ body }) => { ... },
  }
}
```

Templates wire this in their storefront service composition. The `StorefrontPromotionalOffer` DTO shape stays as-is (it already covers what the new schema produces); the resolver just implements the previously-empty hooks.

The `applicableProductIds` and `applicableDepartureIds` array fields on the DTO are populated from `promotional_offer_products` (and a future `promotional_offer_departures` table — not v1; v1 returns empty `applicableDepartureIds` for any departure-scoped use case, since v1 doesn't model departure-scoped offers).

The public HTTP routes live under the public capability namespace, not an extra storefront namespace:

- `POST /v1/public/offers/:slug/apply`
- `POST /v1/public/offers/redeem`

Both parse JSON through `parseJsonBody(...)`, return customer-safe status/reason codes, echo booking/session identifiers when provided, and include price-impact plus conflict metadata. They do not replace Finance Travel Credit validation and they do not create payment captures. Booking-level redemption audit rows are still written from confirmed quotes by the `booking.confirmed` subscriber.

Offer mutation requests require the caller to provide `pax` explicitly. The resolver does not infer traveler counts from booking/session IDs; omitting `pax` would make the evaluator treat minimum-traveler conditions as catalog-plane conditional offers instead of checkout exclusions.

## 9. Reindex + event surface

Mirrors the `availability.slot.changed` precedent (PR3 of #493 + the lifecycle work in #510 / #512), with one addition that pricing didn't need: a **boundary scheduler** for time-driven transitions.

### 9.1. Mutation-driven: `promotion.changed`

- **`PROMOTION_CHANGED_EVENT = "promotion.changed"`** in `packages/commerce/src/promotions/events.ts`.
- **Payload**: simple, no slice-narrowing variant (`IndexerService` only exposes per-entity reindex — `reindexEntity` (all slices) and `reindexEntityForSlice` (one slice for one entity), per `packages/catalog/src/services/indexer-service.ts:75`. There's no "reindex all products in this slice" helper, so a `slices` payload kind would have nothing to dispatch to. We resolve to product IDs at the emission boundary instead.)

  ```ts
  type PromotionChangedPayload = {
    offerId: string
    source: "created" | "updated" | "deleted" | "expired"
    affected:
      | { kind: "products"; productIds: string[] }   // resolved at emission time
      | { kind: "all" }                              // when the resolved set would be too large to enumerate
  }
  ```
- **Resolution at emission time**:
  - Product-shaped scopes (`products`, `categories`, `destinations`) → query `promotional_offer_products` for the offer's materialized product set → `kind: "products"`.
  - `markets` / `audiences` scopes → resolve to "every product in this market" / "every product visible to this audience" via the products module's catalog-policy registry. If the resolved set is bounded (e.g., < 1000 products), emit `kind: "products"`. Otherwise emit `kind: "all"` to avoid an unbounded payload.
  - `global` → always `kind: "all"`.
- **Emission triggers**: every CRUD mutation that changes a field affecting projection or evaluation — `createPromotionalOffer`, `updatePromotionalOffer`, `deletePromotionalOffer`, `archivePromotionalOffer`. Pure metadata-only edits (e.g. `description`, `metadata`) skip emission to avoid pointless reindex churn.
- **Bridge subscription**: operator catalog-bridge subscribes and dispatches per `affected.kind`:
  - `products` → call `reindexEntity` for each ID.
  - `all` → walk the products module's owned set and reindex each. Global / large-scope changes are rare events; the cost is acceptable.
- **Service runtime threading**: per the #510 audit, mutations accept an optional `RuleMutationRuntime` with `eventBus` (matching `availability.slot.changed`). Routes thread `c.get("eventBus")`. The `create_promotion` Tool is stricter: handler-owned created-target admission fingerprints and claims the command before mutation, then inserts the offer, materialized product links, deterministic `promotion.changed` outbox event, ledger result, and canonical promotion reference in one transaction. The event id is derived from the globally unique canonical promotion id, so identical commands in separate principal or organization scopes cannot collide in the global outbox. Equal retries replay only that immutable reference, while same-key payload drift conflicts before another mutation or event.

### 9.2. Time-driven: boundary scheduler

The catalog projection is `now()`-dependent (offers fire at `valid_from`, expire at `valid_until`). Without a scheduled trigger, an indexed document continues to show an expired discount until something else reindexes the product. Pricing avoided this by being `now()`-independent (per `packages/pricing/src/service-catalog-plane-pricing.ts:17` — "this projection is `now()`-independent — it reads static configured prices, not date-dependent rule windows"). Promotions inherently can't.

The scheduler is a new operator-template cron that runs every 5 minutes. Each tick:

1. Queries `promotional_offers WHERE active = true AND ((valid_from BETWEEN last_tick AND now()) OR (valid_until BETWEEN last_tick AND now()))`.
2. For each crossing offer, emits `promotion.changed` with `source: "expired"` (for `valid_until` crossings) or `source: "updated"` (for `valid_from` crossings) and the resolved product set (per §9.1's resolution).
3. Persists `last_tick` so retries / restarts don't re-fire.

5-minute granularity means the storefront badge can be up to 5 minutes stale at boundaries — acceptable for promotion lifecycles measured in days. Operators who need second-level precision can reduce the cron interval; the upper bound is whatever Workers cron supports (currently 1 minute minimum).

A separate `promotional_offer_scheduler_state` table (single row, `last_tick timestamptz`) stores the watermark. Adding it lives in PR3.

**Operator starter wiring** (`apps/operator/wrangler.jsonc` triggers + `src/api/promotion-scheduled.ts`):

```jsonc
"triggers": {
  "crons": [
    "*/5 * * * *"   // promotions boundary scheduler
  ]
}
```

The scheduled handler runs `runPromotionBoundaryScheduler({ db, eventBus })` from `@voyant-travel/commerce`, wrapping the call in `withDbFromEnv`.

## 10. Stacking semantics — the worked example

To make §3.3 concrete, here's what happens when three offers apply to the same product on the same slice:

| Offer | Type | Value | Stackable |
|---|---|---|---|
| Spring Sale | percentage | 20% | false |
| Partner Discount | percentage | 10% | true |
| Loyalty Bonus | percentage | 5% | true |

- **Best non-stackable**: Spring Sale → 20% off.
- **Combined stackables**: 1 - (0.9 × 0.95) = 14.5%.
- **Pick**: Spring Sale (20% > 14.5%).
- **Applied**: `[Spring Sale]`. `discountAppliedCents = base × 0.20`.

If the operator wanted Partner + Loyalty to combine and exclude Spring Sale (e.g. "non-stackable promo" should only apply to non-partners), they'd scope Spring Sale to `audience: customer` only.

Edge case: if Spring Sale is removed and only the two stackable offers remain, both apply. `applied = [Partner, Loyalty]`. `discountAppliedCents = base × 0.145`.

## 11. Currency handling

- **Percentage offers** are currency-agnostic. They apply to whatever the product's `baseCurrency` is.
- **Fixed-amount offers** carry a `currency` column. The evaluator filters out offers whose `currency` doesn't match `ctx.baseCurrency`.
- **No FX conversion at evaluation time.** An operator who wants `€10 off` for a USD product creates a separate USD offer (`$11 off`). This is honest about the ambiguity (FX rates fluctuate) and matches the catalog plane's existing currency-strict behavior in PR4 of #493.

The validation schema enforces:
- `discountType = "percentage"` ⇒ `discount_percent` required, `discount_amount_cents` and `currency` must be null.
- `discountType = "fixed_amount"` ⇒ `discount_amount_cents` and `currency` required, `discount_percent` must be null.

## 12. Decisions (resolved)

Recorded here as the rationale trail. The two larger architectural threads have their full discussion in §15; the headline decisions appear as items 17 + 18 below.

1. **Conditions schema** — typed JSONB validated by Zod, starting with `{ minPax?: number }` plus structured eligibility flags (`pastGuestOnly`, `soloTravelerOnly`, `childTravelerOnly`, `familyOnly`). Date validity stays on the offer header (`valid_from` / `valid_until`); no `validDateRanges` duplication in `conditions`.
2. **Conditional-offer projection field shape** — single `conditionalOffer*` set on the catalog document, matching the `bestOffer*` budget. Richer merchandising goes through a future offer-detail endpoint, not by bloating every search document.
3. **Materializing destination scope** — `products`, `categories`, *and* `destinations` all populate `promotional_offer_products` at write time. The projection path never has to traverse taxonomy / destination joins.
4. **Code case-sensitivity** — store + compare lowercased for matching and uniqueness; preserve the customer's typed case in `promotional_offer_redemptions.code_used` for audit / debugging.
5. **Quote-time pricing field** — dedicated `pricing_applied_offers` JSONB column on `catalog_quotes` *and* on `booking_catalog_snapshot`. Plus a new `booking_id` column on `catalog_quotes` so the post-commit subscriber can find quotes per booking. Not nested inside `pricing_breakdown` (would hide the dependency); not a side table (would force a JOIN). See §7.1.3.
6. **Recompute on category mutation** — defer. Explicit operator save re-materializes the link table. Full reactivity is a follow-up that needs a `category.products.changed` event surface which doesn't exist today.
7. **Storefront `applicableDepartureIds`** — return empty arrays in v1. Departure-scoped offers aren't modeled until there's a real departure-scope rule. DTO compatibility preserved.
8. **Per-tenant overrides** — out of scope. Per the repo's tenancy ADR, multitenancy is a deployment-boundary concern; no tenant-scoping or override machinery in this module. Reopened only if the shared-tier work happens.
9. **Booking-draft field rename** — `voucher.code` → `promotionCode`. Keeps Promotions distinct from Finance Travel Credits and Bookings Service Vouchers.
10. **Catalog → promotions dependency direction** — `@voyant-travel/catalog` does not import `@voyant-travel/commerce`. The quote-time evaluator is an injected dep on `QuoteEntityDeps`; redemption recording is a `booking.confirmed` subscriber registered by the operator starter. **No `BookEntityDeps` hook** — `bookEntity` has no enclosing transaction so the "atomic with commit" framing was wrong (see §7.3.1).
11. **`PROMOTION_CHANGED_EVENT` payload** — typed discriminated union `affected: { kind: "products" | "all" }`. No `kind: "slices"` — `IndexerService` has no "reindex all products in this slice" helper, so promotions resolves slice-shaped scopes to product IDs at emission time and emits `kind: "products"` (or falls back to `kind: "all"` when the resolved set is too large to enumerate). See §9.1.
12. **No `channels` scope kind in v1** — `channelScope` lives on `market_product_rules` (not `markets`) and `IndexerSlice` has no channel dimension. Modeling channels properly requires structural changes to either (a) the projection's per-product join load or (b) `IndexerSlice` itself; both are out of scope for the promotions PR. Operators model channel-wide promos via `audiences` + `markets`. See §3.2; deferred follow-up in §14.
13. **Discount applies to `pricing.base_amount` (pre-tax)** — the operator starter's `applyOperatorTaxToQuoteResult` step recomputes taxes against the new base. Applying post-tax would either undo the discount or double-tax the customer. `fees` and `surcharges` are not discounted in v1. See §7.1.0.
14. **Boundary scheduler exists** — a 5-minute cron emits `promotion.changed` at `valid_from` / `valid_until` transitions to expire stale catalog projections. Without it, the storefront would keep showing expired discounts until another mutation reindexed. New `promotional_offer_scheduler_state` watermark table. See §9.2.
15. **Catalog plane projects annotations only — promotions does NOT touch `priceFromAmountCents`** — `ProductProjectionExtension`s run independently in parallel and can't read each other's output (`packages/inventory/src/service-catalog-plane.ts:262`, `:351`). Promotions adds `bestOffer*` + `originalPriceFromAmountCents` only; storefront consumers compute the effective price client-side. Filter / sort behavior uses the list price (an acknowledged v1 limitation, tracked in §15.1). See §3.7.
16. **No new public routes** — reuse the existing `/v1/public/products/:productId/offers` and `/v1/public/offers/:slug` (`packages/storefront/src/routes-public.ts:99`); the resolver implementation makes the previously-empty endpoints functional.
17. **`ProductProjectionExtension` contract stays as-is for v1** — the ordered, output-passing variant (§15.1) is the right eventual shape if discount-aware filtering becomes important, but it touches every existing extension. v1 ships annotation-only and accepts the list-price filter limitation. Revisit when operator feedback shows it matters.
18. **Promotions does not own the `bookEntity` transaction problem** — keep the `booking.confirmed` subscriber pattern (§7.3, §15.2). Refactoring `bookEntity` into one coherent commit transaction is a booking-engine architecture change with its own justification, scoped outside promotions. Operational recovery is via the persisted `pricing_applied_offers` on the snapshot (backfill path) and the idempotent upsert against `(offer_id, booking_id)`.

## 13. PR sequencing

5 sequenced PRs. Each independently mergeable; later PRs build on earlier ones without touching their contracts.

### PR1 — Module foundation

- New package `packages/commerce/src/promotions` (skeleton: package.json, tsconfig, schema.ts, validation.ts, service.ts, routes.ts, events.ts, index.ts).
- TypeID prefixes `pofr` + `pofx` registered.
- Schema: `promotional_offers`, `promotional_offer_products`, `promotional_offer_redemptions`. Drizzle migration (autogenerated by `pnpm -F operator db:generate`).
- Validation schemas (Zod) for the discriminated-union scope + conditions JSONB.
- Service: CRUD (`listOffers`, `getOfferById`, `createOffer`, `updateOffer`, `deleteOffer`, `archiveOffer`) + scope materialization (`recomputeOfferLinks`).
- Admin routes mounted at `/v1/admin/promotions/*`. Public routes deferred to PR4.
- Unit tests: scope discriminator validation, code uniqueness, currency rule on fixed-amount type.
- Integration tests: full CRUD flow, link table materialization on category-scope changes.

**Acceptance**: an operator can create, list, edit, archive, delete offers via the admin API. No catalog visibility yet, no checkout integration. One changeset entry: `@voyant-travel/commerce` minor (initial release).

### PR2 — Rule evaluator

- `packages/commerce/src/promotions/service-evaluator.ts`: `evaluateOffersForProduct` per §5.
- Per-scope-kind matchers (`global`, `products`, `categories`, `destinations`, `markets`, `audiences`). No `channels` matcher in v1 — see §3.2.
- Conditions evaluator (`minPax` + scaffolding for future conditions).
- Stacking algorithm + currency filter.
- Pure-function unit tests covering every scope kind, every conditions kind, every stacking case (the worked example in §10), every currency case.

**Acceptance**: pure unit tests pass; the evaluator is callable from inside the package. The function is **not yet exported from the package barrel** — that happens in PR3 via the `service-catalog-plane-promotions` adapter and in PR4 via `service-catalog-adapters`. Keeping it internal in PR2 means **no new changeset**.

### PR3 — Catalog plane wiring + boundary scheduler

- `packages/inventory/src/catalog-policy-promotions.ts` declaring the policy (annotation-only field set per §3.7 — does NOT touch `priceFromAmountCents`).
- `packages/commerce/src/promotions/service-catalog-plane-promotions.ts` with `createProductPromotionsProjectionExtension()`. Adds `bestOffer*`, `originalPriceFromAmountCents`, `conditionalOffer*` fields. Reads its own list-price MIN to populate `originalPriceFromAmountCents` (small bounded duplication of pricing's MIN logic — see §3.7).
- `events.ts`: `PROMOTION_CHANGED_EVENT`. Service mutations emit per §9.1; the service resolves the offer's scope to a product set at emission time.
- **Boundary scheduler** (per §9.2): `packages/commerce/src/promotions/service-boundary-scheduler.ts` exports `runPromotionBoundaryScheduler({ db, eventBus })`. New `promotional_offer_scheduler_state` table (single-row watermark). Operator starter adds a `*/5 * * * *` cron in `wrangler.jsonc` and wires the handler in `src/api/promotion-scheduled.ts`.
- Operator starter's `catalog-runtime.ts` composes the new policy + extension. `catalog-bridge.ts` subscribes to `promotion.changed`.
- Integration tests:
  - Create an offer scoped to a category, verify the projection sets `bestOfferName` / `originalPriceFromAmountCents` on the right slice; on slices the offer doesn't apply to, all promotion fields are `null`.
  - Boundary scheduler: insert an offer with `valid_until = now() + 1ms`, run the scheduler tick, verify `promotion.changed` was emitted with `source: "expired"`.

**Acceptance**: storefront cards (in apps that consume the catalog index) render badges + strikethrough prices for products under an active offer (consumers compute the effective price from the annotations). Offers expire from the index automatically within ~5 min of `valid_until`. No checkout integration yet. `@voyant-travel/commerce` + `@voyant-travel/inventory` minor.

### PR4 — Booking-engine integration

- **Field rename** in `BookingDraft` (`packages/catalog/src/booking-engine/contracts.ts:343`): `voucher: { code }` → `promotionCode: string`. Single call-site change; no live consumers.
- **Hook contract** added to `QuoteEntityDeps.evaluatePromotions` only (per §3.6) — input / output types live in `@voyant-travel/catalog`. Catalog never imports promotions. **No `BookEntityDeps` hook** — redemption recording is done via a `booking.confirmed` subscriber to match how `bookEntity` actually works (no enclosing transaction; see §7.3.1).
- `PricingBasis` gets `appliedOffers?: AppliedOffer[]` (in-memory). `@voyant-travel/catalog` minor.
- **Schema additions** (per §7.1.3):
  - `pricing_applied_offers` JSONB column on `catalog_quotes` and `booking_catalog_snapshot`.
  - `booking_id` column (text, nullable, indexed) on `catalog_quotes`. `bookEntity` sets it inside `markQuoteConsumed` (`packages/catalog/src/booking-engine/book.ts:222`) on successful commit. Used by the redemption subscriber to find quotes per booking.
- `packages/catalog/src/booking-engine/quote.ts` reads `parameters.promotionCode`, calls `deps.evaluatePromotions` if present, applies the discount to `pricing.base_amount` (pre-tax, per §7.1.0). Returns `code_*` invalidReasons when `codeStatus.kind !== "code_valid"`.
- New `invalidReason` codes on the quote response: `code_not_found`, `code_expired`, `code_not_yet_valid`, `code_not_applicable`.
- `packages/commerce/src/promotions/service-catalog-evaluator.ts`: `createCatalogPromotionEvaluator(db)` adapter factory matching the `QuoteEntityDeps.evaluatePromotions` signature.
- `packages/commerce/src/promotions/service-booking-confirmed.ts`: `createBookingConfirmedRedemptionSubscriber(env)` subscriber factory + `recordPromotionRedemptionsForBooking(db, bookingId)` core logic (idempotent upsert per §4.3).
- Operator starter wires the evaluator into `quoteEntity` deps and registers the subscriber on the event bus alongside the existing `captureSnapshotGraph` subscriber.
- Storefront DTO mapping (`packages/storefront/src/validation.ts:392`) verified to remain compatible — likely no changes.
- `packages/commerce/src/promotions/service-storefront.ts`: `createPromotionsStorefrontResolvers()` factory.
- Operator starter wires the resolver into its storefront service composition. **No new public routes** — the storefront already exposes `/v1/public/products/:productId/offers` and `/v1/public/offers/:slug` (`packages/storefront/src/routes-public.ts:99-120`); the resolver implementation makes those previously-empty endpoints functional.
- Integration tests: end-to-end quote with valid code → discount applied; quote with invalid code → error; commit creates redemption row; snapshot round-trip preserves `appliedOffers`.

**Acceptance**: a customer can enter a code on the booking flow, see the discount applied to the pre-tax base on the quote, complete the booking, and end up with the redemption recorded by the post-commit subscriber. `@voyant-travel/commerce` + `@voyant-travel/catalog` (minor — `evaluatePromotions` hook + `pricing_applied_offers` + `booking_id` columns on `catalog_quotes` + `pricing_applied_offers` on `booking_catalog_snapshot` + draft field rename) + `@voyant-travel/storefront` (likely just patch — the existing public routes start returning real data).

### PR5 — Operator UI primitives

- `packages/commerce-react/src/promotions` (registry components for the operator dashboard): offer list, offer form, offer detail, redemption history.
- DMC + operator starter wires the components into `/admin/promotions/*` routes.
- Integration tests of the form's discriminated-union scope picker (the trickiest piece of the UI).

**Acceptance**: an operator can manage offers entirely from the dashboard, no SQL needed. Fully closes #497.

### Cumulative acceptance criteria for #497

- [ ] An operator can create a 20% percentage offer scoped to `audience: customer`, valid this week — and storefront cards for customers show a 20% off badge with strikethrough price. Staff cards show the original.
- [ ] An operator can create a "10% off all Adventure category" offer — storefront filters for the category render the discount.
- [ ] An operator can create an `EARLYBIRD2026` code — customers entering it at checkout see the discount on the quote and pay the discounted total.
- [ ] An operator can create a "min 4 pax = 5% off" conditional offer — storefront cards show the conditional badge, and the discount applies on quotes where pax ≥ 4.
- [ ] An operator can run a global "10% off everything for the spring sale" — all customer-visible products show the discount; partner-visible products do not.
- [ ] Booking commits record the applied offer; operators can run a "redemptions by offer" report from the redemption table.

## 14. Out of scope (deferred follow-ups)

Tracked here so they don't get re-litigated during PR review:

- **Per-customer redemption caps.** Schema supports it (the redemption table can be queried per-customer via `bookings.personId`). Enforcement deferred.
- **Total redemption caps.** Same shape. Tracked but not enforced.
- **Recompute on category mutation.** When a product joins/leaves a category, existing category-scoped offers don't auto-pick-up the change until the offer is saved again. A future event surface (`category.products.changed`) + service hook closes this.
- **Loyalty programs.** Stateful; out of v1 scope entirely.
- **Bundle offers.** Multi-product joint pricing. Out of scope.
- **A/B testing of offers.** Variant assignment + measurement. Out of scope.
- **Affiliate / referral attribution.** Code-style with commission semantics. Different schema; out of scope.
- **Offer images / merchandising metadata UI.** Schema fields exist on the DTO; operator UI to manage them ships in a separate UI PR.
- **Multi-currency offers via FX.** Strict currency match in v1. FX-aware offers are a follow-up if needed.
- **Per-tenant scoping.** Single-tenant assumption in v1.
- **Localized offer names / descriptions.** v1 ships single-locale. A `promotional_offer_translations` table mirrors `destinations_translations` if/when a multi-locale storefront needs it.
- **Channel-scoped offers.** Modeling requires either per-product `market_product_rules` joins on the projection hot path or extending `IndexerSlice` with a channel dimension (`packages/catalog/src/indexer/contract.ts:21`). Either is larger work than promotions should drag in. Operators approximate via `audiences` + `markets` in v1.
- **Filter / sort by effective (post-discount) price.** Today's filter uses `priceFromAmountCents` (list price) since promotions doesn't overwrite it. A customer searching `< $200` won't find a `$250 → $180` discounted product via the filter. Real fix: the §15.1 ordered-extensions thread.
- **Atomic redemption recording.** Today's subscriber pattern accepts a small audit gap on permanent failure (mitigated by `pricing_applied_offers` on the snapshot enabling backfill). A reconciliation job that scans for snapshots with `pricing_applied_offers` but no matching redemption row would close the gap.

## 15. Resolved architectural threads

Two threads needed explicit user sign-off because they were the largest design forks. **Both resolved as the v1-pragmatic option (a)**; the alternatives are kept here as a record for the future revisit.

### 15.1. Should `ProductProjectionExtension` get an ordered, output-passing contract?

**Decision: NO for v1** — accept the list-price filter limitation; revisit when operator feedback shows discount-aware filtering matters.

**Today**: extensions run independently in parallel; result maps are merged (`packages/inventory/src/service-catalog-plane.ts:262 + :351`). Promotions can't read pricing's `priceFromAmountCents` output, so the v1 design has promotions emit annotations only and storefront consumers compute the effective price client-side (per §3.7 + decision §12.15).

**Cost of staying as-is**: catalog filter / sort uses the list price, not the effective price. A customer searching `< $200` won't find a `$250 → $180` discounted product via the filter. Storefront cards still display correctly.

**Possible fix**: change `ProjectionExtension.project(db, productId, slice)` to `project(db, productId, slice, prior: ReadonlyMap<string, unknown>)`, run extensions sequentially in declaration order, pass each prior extension's output. Promotions then becomes the LAST extension and can subtract from the pricing-emitted `priceFromAmountCents` to produce an effective price.

**Open question for the user**:
- (a) Accept the v1 trade-off (filter uses list price; revisit in v2 only if operators complain).
- (b) Land the `ProductProjectionExtension` ordering change as part of PR3 — bigger PR, touches every existing extension's signature, but produces a properly discount-aware index.

**Why (a) carries v1**: cards render badges + strikethrough prices correctly; quotes apply the real discount to `base_amount`; the only compromise is search/filter discoverability for "was $250, now $180" products. Acceptable trade-off given the alternative (a) cross-cutting contract change touching every extension and (b) a much larger PR3.

### 15.2. Owned-product commit transaction boundary

**Decision: keep the subscriber pattern.** Promotions does not refactor `bookEntity`'s commit path.

**Today**: `bookEntity` does sequential writes without a single enclosing `db.transaction(...)`; the owned `createBooking` path opens its own transaction in `packages/finance/src/service-booking-create.ts`. This affected the redemption-recording design — we picked the subscriber pattern (§7.3) instead of an inline hook because there's no coherent transaction to be atomic with.

**Open question for the user**:
- (a) Keep as-is. Promotions' subscriber pattern is correct for current `bookEntity` reality. If a permanently-failing subscriber is a concern, add a periodic reconciliation job (out of scope for v1).
- (b) Refactor `bookEntity` to wrap its commit path in a single transaction (separate PR, scope outside promotions). Once that lands, promotions could optionally re-add the inline hook for true atomicity.

**Why (a) carries v1**: subscriber is idempotent (per `(offer_id, booking_id)` unique upsert in §4.3), reads from `catalog_quotes.booking_id` + `pricing_applied_offers` (set during commit per §7.1.3), and the snapshot copy of `pricing_applied_offers` provides operational backfill if the subscriber permanently fails. The `bookEntity` transaction refactor has its own justification independent of promotions and shouldn't be coupled to this work.

## 16. References

- Parent issue: #497
- Catalog architecture: `docs/architecture/catalog-architecture.md` §5.4 (denormalization at index time), §5.3 (snapshot capture)
- Pricing rule-evaluation precedent: `packages/pricing/src/schema-option-rules.ts` (per-rule structure), `packages/pricing/src/service-rule-resolver.ts` (rule selection algorithm)
- Lifecycle audit completed in #500 / #511 / #510 / #512 — promotions evaluator + service mutations follow the `withDbFromEnv` + `dbFromEnvForApp` patterns established there
- Pricing catalog plane wiring (PR4 of #493): `packages/inventory/src/catalog-policy-pricing.ts`, `packages/pricing/src/service-catalog-plane-pricing.ts`
- Existing storefront DTO placeholder: `packages/storefront/src/validation.ts:392` (`storefrontPromotionalOfferSchema`)
- Existing booking-draft placeholder: `packages/catalog/src/booking-engine/contracts.ts:343` (`voucher: { code }`)
- Markets / channels vocabulary: `packages/markets/src/schema.ts` (`marketChannelScopeEnum`, `markets`, `marketChannelRules`)
