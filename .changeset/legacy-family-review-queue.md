---
"@voyant-travel/inventory": minor
"@voyant-travel/products-contracts": minor
---

feat(inventory): conservatively backfill legacy families and expose an operator-review queue

Ambiguous legacy Products must be resolved by a human, not guessed. This adds
the queue that makes them discoverable and a migration that only classifies what
is unambiguous.

- **Discoverable review queue.** The product list read accepts
  `classificationReview=pending | missing_family | unresolved_duration`. The
  predicates are expressed as row-level SQL that mirrors
  `resolveProductClassification` exactly (missing/dangling family; no explicit
  duration and no dated default-itinerary day), so the queue and the rendered
  review badge never disagree.
- **Conservative backfill migration.** A product with authored itinerary days
  but no family is unambiguously a Tour; the migration assigns the standard
  `tour` family to exactly those rows. It never overwrites an existing family,
  only fires on a strong positive signal, joins to the seeded family (so a
  deployment without it is a no-op), and is idempotent. Duration is not
  materialized — the resolver derives itinerary-derived duration live.
- **Ambiguous rows are left alone.** A product with neither a family nor a
  resolvable duration is untouched and surfaces in the review queue rather than
  being guessed.
- Migration-test coverage over a representative beta dataset that includes
  ambiguous rows proves no Product disappears, no capacity claim (availability
  slot) is lost, and only the unambiguous rows are classified.
