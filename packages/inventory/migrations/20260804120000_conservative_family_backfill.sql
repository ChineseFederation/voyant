-- Conservative legacy family backfill.
--
-- A legacy product with authored itinerary days but no family assigned is
-- unambiguously a Tour: within `products`, an itinerary of dated days is the
-- Tour shape (Attraction Admissions, Events and Transfers do not carry one).
-- Assign the standard `tour` family to exactly those rows.
--
-- This is deliberately conservative:
--   * it only touches rows where `product_type_id IS NULL`, so an existing
--     family (standard or operator-authored) is never overwritten;
--   * it only assigns on a strong POSITIVE signal (>= 1 dated itinerary day);
--   * it joins to the seeded `tour` family, so on a deployment without it the
--     statement matches nothing rather than nulling a family out;
--   * it is idempotent — a second run finds the rows already classified.
--
-- Rows WITHOUT that positive signal (no family AND no itinerary) are left
-- untouched on purpose. They are genuinely ambiguous and must surface in the
-- operator classification-review queue (`?classificationReview=pending`) to be
-- resolved by a human, never silently guessed. Duration is not materialized
-- here: the shared resolver derives itinerary-derived duration live, and a row
-- with neither an explicit duration nor an itinerary stays `unresolved` and
-- likewise enters the review queue.
UPDATE "products" AS p
SET "product_type_id" = t.id
FROM "product_types" AS t
WHERE t.code = 'tour'
  AND p."product_type_id" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "product_days" pd
    JOIN "product_itineraries" pi ON pi.id = pd.itinerary_id
    WHERE pi.product_id = p.id
      AND pd.day_number >= 1
  );
