---
"@voyant-travel/catalog-react": minor
"@voyant-travel/catalog": minor
"@voyant-travel/i18n": minor
---

Retire the Boat Tours catalog surface — a subtype is not a browse scope.

Every other Catalog entry is a Product family (`tour`, `activity`, `attraction`, `event`, `transportation`) or a vertical with its own index. Boat Tours was neither: it locked `familyCode = tour` plus `subtypeCode = boat-tour`, making it a strict subset of Tours that showed the same products a second time.

Subtypes are free-form per deployment (`products.productSubtypeCode` accepts any kebab-case code), so promoting one of them to a nav surface hardcoded one operator's vocabulary and left every other subtype — `day-tour`, `wine-tour` — without an equivalent. Families are a closed, seeded set, so a family view means the same thing on every deployment.

`subtypeCode` remains a facet on the product filter rail, so a Boat Tour is found by filtering Tours the same way any other subtype is. `ScheduledScope` no longer accepts `"boat-tours"`, and `/catalog/boat-tours` (index and detail) is no longer routed.
