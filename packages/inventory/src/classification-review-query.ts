/**
 * SQL predicates for the operator classification-review queue.
 *
 * The review *state* (`reviewRequired` / `reviewReasons`) is computed in one
 * place — `resolveProductClassification` — from the resolved family and
 * duration. That resolver runs per-row in JS after a read, which is fine for
 * rendering a badge but cannot drive a paginated, counted list. This module
 * expresses the SAME two review reasons as row-level SQL predicates so the
 * product list read can surface the ambiguous rows as a discoverable queue
 * without a second, drifting definition of "needs review".
 *
 * Both predicates are deliberately conservative and mirror the resolver exactly:
 *
 *   - `missing_family` — the product has no family, or a dangling family FK.
 *     Same as `resolveProductClassification` seeing `family: null`.
 *   - `unresolved_duration` — no explicit `duration_minutes` AND the default (or
 *     first) itinerary has no dated days. Same as `resolveProductDuration`
 *     falling through to `unresolved`; the default-itinerary subquery matches
 *     the `itineraryDurationDays` subquery the list read already feeds the
 *     resolver (`is_default DESC, sort_order ASC` + `max(day_number)`).
 *
 * Ambiguous rows are never guessed — they simply become selectable. An operator
 * resolves them by assigning a family or authoring a duration.
 */

import { type SQL, sql } from "drizzle-orm"

import { productDays, productItineraries, products, productTypes } from "./schema.js"

/** Products with no family assigned, or a family FK that resolves to nothing. */
export function missingFamilyPredicate(): SQL {
  // agent-quality: raw-sql reviewed -- owner: inventory; references vetted table identifiers only.
  return sql`(
    ${products.productTypeId} is null
    or not exists (
      select 1 from ${productTypes}
      where ${productTypes.id} = ${products.productTypeId}
    )
  )`
}

/**
 * Products whose duration cannot be resolved: no explicit `duration_minutes` and
 * the default (or first) itinerary carries no dated day. Uses the same
 * default-itinerary selection the list read's `itineraryDurationDays` subquery
 * uses, so the queue and the rendered badge never disagree.
 */
export function unresolvedDurationPredicate(): SQL {
  // agent-quality: raw-sql reviewed -- owner: inventory; references vetted table identifiers only.
  return sql`(
    ${products.durationMinutes} is null
    and coalesce((
      select max(${productDays.dayNumber})
      from ${productDays}
      where ${productDays.itineraryId} = (
        select ${productItineraries.id}
        from ${productItineraries}
        where ${productItineraries.productId} = ${products.id}
        order by ${productItineraries.isDefault} desc, ${productItineraries.sortOrder} asc
        limit 1
      )
    ), 0) < 1
  )`
}

/** The three review-queue filter modes accepted by the product list read. */
export type ClassificationReviewFilter = "pending" | "missing_family" | "unresolved_duration"

/**
 * The predicate for a review-queue filter mode. `pending` returns any row that
 * needs review (either reason); the reason-specific modes narrow to one.
 */
export function classificationReviewPredicate(filter: ClassificationReviewFilter): SQL {
  switch (filter) {
    case "missing_family":
      return missingFamilyPredicate()
    case "unresolved_duration":
      return unresolvedDurationPredicate()
    default:
      // agent-quality: raw-sql reviewed -- owner: inventory; composed from vetted predicates.
      return sql`(${missingFamilyPredicate()} or ${unresolvedDurationPredicate()})`
  }
}
