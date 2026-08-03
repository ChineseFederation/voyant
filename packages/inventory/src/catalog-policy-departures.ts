/**
 * Catalog plane field policy for product → departures denormalization.
 *
 * These fields don't live on the `products` table — they're aggregated
 * from `availability_slots` (filtered to `status = 'open'` and future
 * `startsAt`) at index time and projected onto the product search
 * document. See `docs/architecture/catalog-architecture.md` §5.4.
 *
 * Storefront product cards filter and display by departure surface:
 *   - "departing in May" (filter: `departureMonths[]` includes "2026-05")
 *   - "available this weekend" (filter: `departureDates[]` overlap)
 *   - "available now" (filter: `hasUpcomingDeparture:true`)
 *   - sort by next departure (`nextDepartureDate` asc)
 *   - show capacity badge (`availableUnitsTotal`)
 *
 * Wire this policy into the products registry by composing with
 * `productCatalogPolicy`:
 *
 *   const registry = createFieldPolicyRegistry([
 *     ...productCatalogPolicy,
 *     ...productDeparturesCatalogPolicy,
 *   ])
 *
 * and wire `createProductDeparturesProjectionExtension` into
 * `createProductDocumentBuilder` so the values land in the doc.
 *
 * Reindex semantics: every aggregation depends on `now()` — the same
 * product reindexed an hour later will produce slightly different
 * documents because the future window slides. Operators rely on the
 * channel-push reconciler + scheduled refresh to keep these fields warm
 * without storming the indexer on each tick. Per architecture §5.4,
 * `reindex: "facet-affecting"` is the right tier — these fields drive
 * facets but aren't on the merchandisable hot path.
 *
 * Out of scope here:
 *   - Sold-out / cancelled / closed slots. The projection only counts
 *     `status = 'open'` so storefront filters never surface unavailable
 *     departures. A "show sold-out" toggle is a query-time concern.
 *   - Per-option splits. Today's projection rolls up to the product;
 *     per-option faceting is a follow-up if storefronts need it.
 *   - Duration buckets (nights/days). Slots carry these but products
 *     with mixed-duration slots can't be summarized in one number.
 */

import { defineFieldPolicy, type FieldPolicyInput } from "@voyant-travel/catalog/contract"

const PRODUCT_DEPARTURES_FIELD_POLICY: FieldPolicyInput[] = [
  // ── Earliest open future departure ──────────────────────────────────────
  // Two frames, each named by its suffix so a consumer never has to guess
  // which one a field is in (#4116):
  //   - `…At`   — an instant (ISO 8601, UTC-normalized).
  //   - `…Date` — a bare local calendar date in `departureTimezone`.
  // `nextDepartureDate` also backs catalog sort by soonest available.
  {
    path: "nextDepartureAt",
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
  {
    path: "nextDepartureDate",
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

  // ── End of that departure ───────────────────────────────────────────────
  // The last `departureDates[]` entry is the last departure *start*, so a
  // multi-day departure's end can't be derived from the facets. Project it
  // in both frames rather than leaving consumers to infer it from
  // `durationDays`. Null when the slot declares no `ends_at`.
  {
    path: "nextDepartureEndsAt",
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
  {
    path: "nextDepartureEndDate",
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

  // ── Frame declaration ───────────────────────────────────────────────────
  // The IANA zone every `…Date` field above (and `departureDates[]` /
  // `departureMonths[]`) is expressed in — the next departure's own zone.
  // Without it a consumer holding both an instant and a bare local date has
  // nothing to reconcile them with and renders one of the two a day out.
  //
  // Distinct from the product-level `timezone` in `productCatalogPolicy`,
  // which is `blob-only` (not indexed) and describes the product's operating
  // zone rather than the zone a given departure was materialized in.
  {
    path: "departureTimezone",
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

  // ── Existence + count facets ─────────────────────────────────────────────
  // `hasUpcomingDeparture` is the cheap "available now" filter. The count
  // lets storefront sort by "lots of options available" without exposing
  // the date list to the query layer.
  {
    path: "hasUpcomingDeparture",
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
  {
    path: "upcomingDepartureCount",
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

  // ── Calendar-bucket facets ──────────────────────────────────────────────
  // `departureDates[]` powers fine-grained "this weekend" / "next week"
  // filters; capped at 180 days of distinct calendar dates so document
  // size stays bounded for daily-slot products. `departureMonths[]` is
  // the longer-tail facet — 24 months of "YYYY-MM" tokens covers an
  // operator's typical forward-published inventory horizon.
  {
    path: "departureDates[]",
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
  {
    path: "departureMonths[]",
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

  // ── Capacity ────────────────────────────────────────────────────────────
  // Sum of `remaining_pax` across upcoming open slots. `null` when ANY
  // counted slot is unlimited — unbounded capacity can't be summarized in
  // a number, and emitting a partial sum would mislead the storefront
  // ("3 seats left" when one slot is actually unlimited).
  {
    path: "availableUnitsTotal",
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
 * Resolved departures policy. Compose with `productCatalogPolicy` when
 * building the products registry.
 */
export const productDeparturesCatalogPolicy = defineFieldPolicy(PRODUCT_DEPARTURES_FIELD_POLICY)

export { PRODUCT_DEPARTURES_FIELD_POLICY }
