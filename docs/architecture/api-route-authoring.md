# Voyant API Route Authoring

This guide defines how Voyant packages should author HTTP routes across the
admin and public API surfaces.

The goal is simple:

- keep route surfaces explicit
- keep request parsing and error handling consistent
- keep auth rules easy to reason about
- keep package routes aligned with the shared `/v1/admin/*` and `/v1/public/*`
  transport model

This is not a new routing framework. It is a consistency guide for Voyant's
server API surface.

Packages expose route factories, `ApiModule`s, or `ApiExtension`s. Hono is the
sole server API implementation; these names describe their role in Voyant
rather than suggesting a replaceable transport adapter.

For route ownership and deployment composition rules, see
[`api-route-ownership-and-composition.md`](./api-route-ownership-and-composition.md).

## Core Rules

### 1. Keep the surface split explicit

Voyant has three transport buckets:

- `/v1/admin/*` for staff and operator routes
- `/v1/public/*` for customer, partner, supplier, and other external-facing
  routes
- `/auth/*` for session and authenticated-user operations

Use `adminRoutes` for operator-facing CRUD and internal tooling.
Use `publicRoutes` for customer-facing and other external-facing contracts.

Do not add new package routes to the legacy `routes` surface unless there is a
strong backwards-compatibility reason.

**`/v1/public/*` names the audience, not the trust level.** It is not "the safe
surface": committing a booking, opening a payment session and reading a
customer's documents all live there. Every public route declares which storefront
key kind may reach it, and a route that declares nothing is secret-key-only — so
a browser cannot call it until you say so. Read
[`public-api-key-capability-line.md`](./public-api-key-capability-line.md)
before adding one.

Rule:

Every new package route should declare whether it belongs to the admin or
public surface.

Selected graph route bundles use coarse method-and-resource authorization by
default. A bundle may declare `authorization: "route"` only when one mount
intentionally mixes authorization rules that the coarse guard cannot express,
such as organization-admin writes and current-member self-service. Surface
authentication still applies, and every handler in that bundle must enforce
its own capability or identity rule.

### Application-local route files

Applications may author deployment-local API routes in these directories:

- `src/api/admin/**/route.ts` for the authenticated admin surface
- `src/api/public/**/route.ts` for the authenticated public surface

Each route file exports at least one named uppercase HTTP handler: `GET`,
`POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`. Route files
must not use a default export or expose other runtime exports. Type-only exports
are allowed.

```ts
import {
  parseJsonBody,
  parseQuery,
  type VoyantRouteHandler,
} from "@voyant-travel/hono"

export const GET: VoyantRouteHandler = (c) => {
  const query = parseQuery(c, listOrdersQuerySchema)
  return c.json({ query })
}

export const POST: VoyantRouteHandler = async (c) => {
  const body = await parseJsonBody(c, createOrderSchema)
  return c.json(body, 201)
}
```

Directory names map to Hono paths. Route groups such as `(internal)` do not
add a URL segment, `[orderId]` maps to `:orderId`, `[...slug]` maps to
`*slug`, and `[[...slug]]` maps to `*slug?`.

The build-time convention compiler inspects exports with the TypeScript AST and
emits `.voyant/runtime/project-api.generated.ts`. It rejects duplicate
surface, method, and canonical-path combinations. Auth is inherited from the
admin or public surface; application-local anonymous overrides are not
supported.

### 2. Keep `storefront` as a package concept, not an HTTP namespace

Voyant should keep `storefront` as the customer-facing package/runtime term:

- `@voyant-travel/public-api`
- `@voyant-travel/public-api-react`

But the HTTP surface should stay under `/v1/public/*`, not
`/v1/public/storefront/*`.

Rule:

Use `/v1/public/*` as the external-facing API umbrella. Do not add an extra
`storefront` URL layer by default.

### 3. Organize public routes by capability, not by frontend

Public routes should be grouped by the business capability they expose:

- bookings
- products
- pricing
- finance
- customer portal

Do not shape public routes around which frontend happens to call them.

Rule:

Public URLs describe the capability, not the app.

## Request Validation

### 4. Parse request bodies through `parseJsonBody(...)`

For JSON request bodies, use the shared Hono helper instead of open-coded
`await c.req.json()` plus local schema parsing.

Prefer:

```ts
const body = await parseJsonBody(c, createBookingSchema)
```

This gives routes:

- consistent invalid JSON handling
- consistent schema-validation responses
- consistent error codes and payload shape

Rule:

If a route accepts JSON, parse it through `parseJsonBody(...)`.

### 5. Parse query parameters through `parseQuery(...)`

For query strings, use the shared Hono helper instead of manual
`new URL(...).searchParams` plus ad hoc coercion.

Prefer:

```ts
const query = parseQuery(c, bookingListQuerySchema)
```

Rule:

If a route accepts query parameters, parse them through `parseQuery(...)`.

### 6. Keep route schemas local to the route contract

Route-level request schemas should live close to the route surface they define.

That usually means:

- package schema files for reusable request/response contracts
- route files using those schemas through `parseJsonBody(...)` and
  `parseQuery(...)`

Do not hide request-shape logic in ad hoc middleware or untyped body handling.

## Auth And Access Control

### 7. Let the shared auth middleware establish request identity

The Hono app-level auth middleware is responsible for attaching request auth
context.

Package routes should consume that shared context rather than rebuilding auth
checks locally.

Rule:

Routes should rely on the shared auth pipeline, not invent package-local auth
state handling.

### 7a. Declare in-band client authentication by exact method and path

Protocol endpoints that authenticate a non-user client inside the handler may
use an `ApiModule.clientAuthenticated` declaration. This is not an anonymous
path prefix: the framework admits only the declared concrete HTTP method and
the exact admin path, skips the staff actor guard for that request, and applies
the public-write rate limit. Parameterized and wildcard declarations are
rejected.

The route handler must validate the protocol credential before doing work.
Neighboring admin endpoints, other methods on the same path, and child paths
remain staff-authenticated. Package code must not use this posture for ordinary
admin CRUD or to replace the shared session pipeline.

Rule:

Use `clientAuthenticated` only for concrete protocol exchanges whose request
already carries authoritative client authentication; keep every other admin
route under staff authentication.

### 8. Use `requireUserId(...)` for authenticated user routes

If a route requires a signed-in user, use the shared helper:

```ts
const userId = requireUserId(c)
```

Do not read `c.get("userId")` manually and hand-roll 401 payloads.

Rule:

User-scoped routes should use `requireUserId(...)` instead of open-coded
presence checks.

### 9. Use actor and permission guards intentionally

Voyant has different auth concerns:

- authenticated user
- resolved actor/workspace context
- permission checks

Use the narrowest guard that matches the route:

- `requireUserId(...)` for “must be signed in”
- actor-aware middleware when the route depends on workspace/actor context
- permission checks when the route depends on explicit grants

Do not collapse all access control into one generic route guard.

Rule:

Pick the smallest auth primitive that matches the route’s actual needs.

### 9a. API tokens use Better Auth permissions

API tokens are Better Auth API keys for automation and cross-runtime calls, not
operator sessions. Their permissions use Better Auth's `Record<string,
string[]>` shape, for example `{ products: ["read"], workflows: ["trigger"] }`.

For Hono routes, API-key callers are admitted by `requireActor(...)` only when
the key has a method-derived permission for the route resource. See
`docs/architecture/service-api-keys.md` for the current derivation rules and
permission catalog.

Rule:

When adding a route that should be callable by third-party systems or external
automation, document the expected API token permission and keep the route's
resource segment aligned with that permission.

## Error Handling

### 10. Throw or normalize shared API errors

Use the shared API error model instead of hand-crafting route JSON for common
error classes.

Examples:

- `RequestValidationError`
- `UnauthorizedApiError`
- `ForbiddenApiError`

If a route needs to convert a local branch into a response immediately, prefer
`handleApiError(...)` over hand-built JSON payloads.

Rule:

Routes should use the shared Hono API error types so admin/public responses stay
consistent.

### 11. Keep validation and authorization failures structured

Validation failures should return the shared invalid-request shape.
Authorization failures should return the shared unauthorized/forbidden shape.

Do not let each package invent its own 400/401/403 response contract.

Rule:

Common API failures should serialize through the shared error boundary or the
shared error helpers.

## Route Design

### 12. Keep package routes thin

Routes should:

- validate the request
- resolve runtime services from the request context
- call package services or workflows
- serialize the response

Do not bury business orchestration in the route body if it belongs in a module
service or workflow.

Rule:

Routes should translate HTTP to package/service calls, not become the business
logic layer.

### 13. Prefer extension over override

When a package route surface needs customization, prefer:

- adding new package routes
- adding app-owned routes
- extending workflows or providers behind the route

Treat full route override as the last resort.

Rule:

Extend existing route surfaces before replacing them.

### 14. Keep response shapes explicit and stable

Route handlers should return typed, intentional payloads.

Do not rely on implicit table shapes or package-internal row objects as the
public contract by default.

That does not mean every route needs a separate DTO file, but it does mean the
response shape should be treated as a real surface, not an accident of current
service internals.

Rule:

Public and admin responses should be shaped on purpose, not leaked by
implementation detail.

## Public Mounting

### 15. Use `publicPath` only when the URL shape truly needs it

Modules and extensions can override their public mount path relative to
`/v1/public`.

That should be used sparingly:

- to mount a package directly at the public root when the contract is truly
  root-scoped
- to keep the public surface clean when the package name would add redundant
  path nesting

It should not become a way to make URL ownership ambiguous.

Rule:

Default to `{module.name}` for public routes. Use `publicPath` only when the
public contract is clearer because of it.

## OpenAPI Contracts

The published API specs are **generated from the route handlers**, never hand
authored. A module owns its OpenAPI contract the same way it owns its routes;
the deployment composes them, and the spec is emitted at build time from the
composed app (`@voyant-travel/hono/openapi`). See voyant#2114.

### 16. New and changed routes declare their contract with `@hono/zod-openapi`

Author the route as an `OpenAPIHono` app and a `createRoute(...)` definition,
then `.openapi(route, handler)`. `OpenAPIHono` is a drop-in `Hono` superclass,
so a module can migrate one route at a time — untouched routes stay plain and
simply do not appear in the generated doc yet.

```ts
import { OpenAPIHono, createRoute } from "@hono/zod-openapi"
import { listResponseSchema } from "@voyant-travel/types"

const listMarketsRoute = createRoute({
  method: "get",
  path: "/markets",
  request: { query: marketListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of markets",
      content: { "application/json": { schema: listResponseSchema(marketSchema) } },
    },
  },
})

export const marketsRoutes = new OpenAPIHono<Env>().openapi(listMarketsRoute, (c) =>
  c.json(marketsService.listMarkets(c.get("db"), c.req.valid("query"))),
)
```

- The request schemas you already pass to `parseQuery` / `parseJsonBody` drop
  straight into `request`; `c.req.valid(...)` replaces the explicit parse.
- Every response needs a declared schema. For offset-paginated lists this is
  `listResponseSchema(itemSchema)` from `@voyant-travel/types` — never a
  re-declared envelope (the canonical one exists precisely to stop the
  `count` vs `total` drift).
- Routes with a JSON body declare it as
  `request: { body: { required: true, content: { "application/json": { schema } } } }`.
  `required: true` is mandatory: `@hono/zod-openapi` only parses the body when the
  request carries `Content-Type: application/json` (Hono leaves the value as `{}`
  otherwise), so a body-backed route must require that content type — which the
  generated contract already declares. The shared `openApiValidationHook` enforces
  `Content-Type: application/json` for any declared JSON body, so a missing or
  non-json header is a clean `invalid_request` 400 rather than a `{}` slipping
  through the validator. This matters most for `.partial()` PATCH update schemas:
  `{}` *validates* against a partial schema, so without this gate a headerless
  request would run the handler with an empty patch and silently no-op (200) —
  dropping the caller's changes. This is a deliberate tightening over the old
  `parseJsonBody` (which parsed regardless of header); first-party callers send the
  header via the shared `fetchWithValidation` client, so they are unaffected.
- Request body size is still bounded the same way it was before the migration. The
  framework-level `requestBodyLimit` middleware (mounted app-wide in `createApp`)
  enforces its cap on the *actual* request body stream, not just the
  `Content-Length` header — so a chunked / HTTP/2 oversized body with no
  `Content-Length` is rejected with a `413 request_body_too_large` even though
  `.openapi()` json routes read via `c.req.json()` and never pass through
  `parseJsonBody` / `readBoundedRequestText`. Migrated routes are therefore bounded
  equivalently to the old `parseJsonBody` path; nothing extra is required per route.
  The guard is *content-type-aware*: `application/json` bodies are capped at 10 MiB
  (`jsonMaxBytes`, matching the old `parseJsonBody` `DEFAULT_REQUEST_BODY_LIMIT_BYTES`)
  so migrated `.openapi()` routes are not loosened, while non-JSON bodies (uploads)
  get the 26 MiB outer ceiling (`maxBytes` / `MAX_GLOBAL_REQUEST_BODY_BYTES`, sized to
  the largest legitimate body — the 25 MiB media upload + multipart envelope) so it
  never rejects valid uploads. The upload route still enforces its own 25 MiB cap.

### 17. The response schema is the wire contract — verify it

`@hono/zod-openapi` keeps the generated doc in step with the *declared* response
schema, but it does **not** check that the handler actually returns that shape.
A wrong response schema produces a clean — but lying — doc. So a route whose
response matters carries a contract test that validates the JSON-serialized
payload against its response schema (typing the fixture as the real Drizzle row
catches column drift; the round-trip catches `Date` → string and similar). This
is the only thing that catches response-shape drift.

Rule:

Declare the request and response schema on every new or changed route. Treat
the declared response schema as the contract, and back it with a contract test.
Never hand-edit a generated spec.

## Practical Checklist

When authoring or reviewing a Voyant API route:

1. Decide whether it belongs to the admin or public surface.
2. Keep the URL organized by capability, not by frontend.
3. Parse JSON through `parseJsonBody(...)`.
4. Parse query parameters through `parseQuery(...)`.
5. Use `requireUserId(...)` or the smallest matching auth/permission guard.
6. Use shared API error types for validation and authorization failures.
7. Keep business logic in services or workflows, not in the route body.
8. Prefer extension over full route override.
9. Treat the response shape as an intentional contract.
10. Declare the route with `@hono/zod-openapi` and back its response with a
    contract test (new and changed routes).

## Non-Goals

This guide does not introduce:

- a new router abstraction
- a generic request/response framework on top of Hono
- a requirement that every route define separate DTO files
- a new HTTP namespace beyond `/v1/admin/*` and `/v1/public/*`

The point is consistency and clarity, not more ceremony.
