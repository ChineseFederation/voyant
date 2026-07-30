---
"@voyant-travel/bookings": minor
"@voyant-travel/finance": major
"@voyant-travel/hono": patch
---

Serve public booking creation from `POST /v1/public/bookings`.

The route was briefly mounted under Finance, which put a `bookings` resource in
the `finance` namespace while `/v1/public/bookings` already existed and was
owned by Bookings — two booking namespaces on one public surface. The cause was
a package dependency, not domain ownership: Finance depends on Bookings and not
the reverse, so a route in Bookings could not reach the durable create command.

Bookings now owns the route and Finance supplies the command through the new
`bookings.self-service-create.runtime` port, inverting that edge exactly as
`bookings.finance.runtime` already does. The dependency direction is unchanged,
the public surface has one booking namespace, and the operation is documented in
the bookings contract where a consumer would look for it.

**Breaking:** `createPublicBookingCreateRoutes` and
`PublicBookingCreateRouteOptions` are gone from `@voyant-travel/finance`,
replaced by `createSelfServiceCreateRuntime`.

`diffOpenApiCoverage` now scopes stale-operation reporting to the caller's own
mount, since one committed document can aggregate several API bundles, and
normalises a root-mounted route's trailing slash.
