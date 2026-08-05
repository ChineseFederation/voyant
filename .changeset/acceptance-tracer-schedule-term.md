---
"@voyant-travel/inventory": minor
"@voyant-travel/inventory-react": minor
"@voyant-travel/products-contracts": minor
"@voyant-travel/admin-contracts": minor
---

feat(inventory): resolve one operator-facing schedule term (Session/Occurrence/Departure)

The same Product/Departure model runs sixty-minute recurring Sessions and
multi-day Departures, so the operator needs to *see* the right noun without the
domain forking under it. This adds a single resolver that decides the noun once
and a localized label the UI reads.

- **One decision, in one place.** `resolveScheduleTerm` maps a Product's
  already-resolved duration to a `session | occurrence | departure` token: an
  explicit sub-day duration is a **Session** (the 60-minute whale-watch Boat
  Tour, a timed Activity, a scheduled transfer), an explicit full-day-or-longer
  duration or an itinerary-derived day span is a **Departure** (a Day Tour, a
  Multi-day Tour), and an unresolved duration — a single Event date or an
  opening-hours Attraction Admission — is an **Occurrence**. It reads no mutable
  Product truth to decide.
- **Every surface agrees.** `resolveProductClassification` now carries
  `scheduleTerm`, so the product list/detail read paths, the catalog-plane
  projection, and the legacy Catalog search document all emit it from the same
  resolver. The classification schemas in `products-contracts`,
  `admin-contracts` and the `inventory-react` mirror gain the field.
- **Presentation only.** A Session, an Occurrence and a Departure are the same
  `availability_slots` row bound to the same Product Version. The operator UI
  maps the token to a localized label (`common.scheduleTermLabels`, en + ro) and
  the product list renders the plural under the family; the domain never forks.
