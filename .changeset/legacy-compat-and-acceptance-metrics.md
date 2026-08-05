---
"@voyant-travel/core": minor
"@voyant-travel/operations": minor
---

feat: compatibility redirects with usage counting and acceptance dashboard metrics

Instrument the transitional surfaces so their removal can later be gated on
evidence rather than assumption. Nothing is deleted here.

- **Compatibility redirects (`@voyant-travel/core`).** `resolveLegacyRedirect`
  maps the four superseded deep-link families — Extras, scheduled Catalog,
  Product detail, and operator Availability — to their canonical successors for
  the measured compatibility period. `resolveAndCountLegacyRedirect` resolves
  and counts a hit in one call for a route middleware, and never fails the
  redirect if the counter does.
- **Usage counting.** `LegacyPathUsageStore` counts hits per stable route key;
  the in-memory store seeds every known key at zero so "usage is zero" is an
  explicit, checkable fact for the release review rather than a missing row.
- **Acceptance metrics (`@voyant-travel/operations`).**
  `computeAcceptanceMetrics` reports readiness failures, reconciliation drift,
  unassigned travelers, missing costs, legacy-path usage, and rollup
  disagreement over injectable providers. Every field is a count or a
  route-keyed usage row — no traveler PII is read or emitted.
