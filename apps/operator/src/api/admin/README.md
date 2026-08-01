# Admin API routes

Add deployment-local operator routes as `src/api/admin/**/route.ts`. They mount
under the authenticated `/v1/admin` surface; application-local anonymous
overrides are not supported.

```ts
// src/api/admin/orders/[orderId]/route.ts
import type { VoyantRouteHandler } from "@voyant-travel/hono"

export const GET: VoyantRouteHandler = (c) => {
  return c.json({ orderId: c.req.param("orderId") })
}
```

Directories become URL segments: `[orderId]` becomes `:orderId`, `[...slug]`
becomes `*slug`, `[[...slug]]` becomes `*slug?`, and `(internal)` groups do not
add a segment. Export one or more named `GET`, `POST`, `PUT`, `PATCH`, `DELETE`,
`HEAD`, or `OPTIONS` handlers. Type-only exports are allowed; default and other
runtime exports are rejected.

Use `parseJsonBody(...)` for JSON and `parseQuery(...)` for query strings. The
build-time compiler emits `.voyant/runtime/project-api.generated.ts`; do not
register these routes manually or edit the generated file.
