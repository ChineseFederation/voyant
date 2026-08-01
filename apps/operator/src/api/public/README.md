# Public API routes

Add deployment-local customer, partner, or supplier routes as
`src/api/public/**/route.ts`. They mount under the authenticated `/v1/public`
surface; application-local anonymous overrides are not supported.

```ts
// src/api/public/bookings/[bookingId]/route.ts
import type { VoyantRouteHandler } from "@voyant-travel/hono"

export const GET: VoyantRouteHandler = (c) => {
  return c.json({ bookingId: c.req.param("bookingId") })
}
```

Organize paths by capability, not by the calling frontend, and do not add a
`storefront` URL segment by default. `[bookingId]` becomes `:bookingId`, route
groups such as `(portal)` add no segment, and catch-all segments use `[...slug]`
or `[[...slug]]`.

Route files export only named uppercase HTTP handlers (`GET`, `POST`, `PUT`,
`PATCH`, `DELETE`, `HEAD`, `OPTIONS`) plus optional type-only exports. Use
`parseJsonBody(...)` for JSON and `parseQuery(...)` for query strings. Routes
are compiled into `.voyant/runtime/project-api.generated.ts`; no manual
registration is needed.
