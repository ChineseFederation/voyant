---
"@voyant-travel/core": minor
"@voyant-travel/hono": minor
"@voyant-travel/operations": minor
---

feat: serve the compatibility redirects and the acceptance metrics

The redirect table and the metrics aggregator were built and unit-tested but
nothing called either, so the redirects redirected nothing and the usage counter
read zero because no request could ever reach it — the one reading that would
have licensed deleting the surfaces it exists to protect. Both are now wired to
a request.

- **`legacyRedirects` (`@voyant-travel/hono/middleware/legacy-redirects`)** is
  the HTTP edge for `resolveAndCountLegacyRedirect`: a superseded deep link
  answers `308` to its canonical successor, carries its query string across, and
  records the hit. It is mounted unconditionally by `serveAdminHost`, ahead of
  static serving and auth — the only seam that sees these origin-root UI paths —
  and deliberately not by the framework app, where a storefront's `/catalog/*`
  content would collide with the compatibility table.
- **`getLegacyPathUsageStore` / `setLegacyPathUsageStore`
  (`@voyant-travel/core`)** bind one usage store per process, so the counter the
  middleware writes is the counter the dashboard reads. A multi-process
  deployment binds a durable store; until it does, "usage is zero" is only that
  process's zero.
- **`GET /v1/admin/operations/acceptance/aggregates`** serves
  `computeAcceptanceMetrics` over `createAcceptanceMetricsProviders`, following
  the existing `/aggregates` dashboard convention. Readiness failures,
  reconciliation drift and unassigned travelers are single raw-SQL counts; the
  two money signals come from the departure-profitability port that already
  backs the departure workspace, and the envelope reports whether that provider
  was bound so an unmeasured zero is not read as a measured one. The response is
  uncached: legacy-path usage gates a deletion review and must not answer from a
  snapshot. No traveler column is projected by any statement.
