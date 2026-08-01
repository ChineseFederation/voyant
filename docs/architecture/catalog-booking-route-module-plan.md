# Catalog Booking Route Module Plan

Status: first implementation slice in progress for
[issue #418](https://github.com/voyant-travel/voyant/issues/418)

Implementation note: the initial route module keeps the reusable quote, draft,
hold, and book contract in `@voyant-travel/catalog/booking-engine`; operator-specific
slots, order management, checkout start, and snapshot enrichment remain in the
operator starter.

## Problem

`@voyant-travel/catalog` publishes the booking engine services and
`@voyant-travel/catalog-react/booking-engine` publishes hooks that call the booking
journey HTTP contract. Package consumers still need to recreate the Hono route
layer that those hooks expect before `@voyant-travel/bookings-react/journey` can be a
safe installable package swap.

The operator starter currently has a working implementation in
`apps/operator/src/api/catalog-booking.ts`, but it mixes three concerns:

- the reusable BookingJourney route contract
- operator-specific helpers such as slots, order administration, and booking
  snapshot enrichment
- deployment-specific runtime wiring for registries, tax policy, auth, and
  checkout handoff

Issue #418 should extract the reusable contract without pulling template-only
dependencies into `@voyant-travel/catalog`.

## Goals

- Export a `createCatalogBookingApiModule()` or equivalent route factory from
  `@voyant-travel/catalog/booking-engine`.
- Cover the route family used by `@voyant-travel/catalog-react/booking-engine`:
  - `POST /v1/{admin,public}/catalog/quote`
  - `PUT /v1/{admin,public}/catalog/drafts/:id`
  - `GET /v1/{admin,public}/catalog/drafts/:id`
  - `DELETE /v1/{admin,public}/catalog/drafts/:id`
  - `POST /v1/{admin,public}/catalog/holds/place`
  - `POST /v1/{admin,public}/catalog/holds/release`
  - `POST /v1/{admin,public}/catalog/book`
- Accept runtime injections for source adapters, owned handlers, content
  enrichment, snapshot capture, actor identity, adapter context, and optional
  post-commit hooks.
- Use shared route parsing and error conventions from `@voyant-travel/hono`.
- Keep admin and public surfaces explicit so package consumers know which
  public paths must be allowed by their app auth policy.
- Migrate the operator starter to consume the shared module for the reusable
  route family while keeping template-only routes local.

## Non-Goals

- Do not move `/slots` into `@voyant-travel/catalog` in the first slice. Slot lookup
  depends on availability, products, product content, suppliers, and
  template-specific source-content behavior.
- Do not move admin order routes into the first reusable module:
  - `GET /v1/admin/catalog/orders`
  - `GET /v1/admin/catalog/orders/:id`
  - `POST /v1/admin/catalog/orders/:id/cancel`
- Do not move `GET /v1/admin/bookings/:id/catalog-snapshot` into the first
  reusable module. It enriches snapshots with operator-facing labels and owned
  product details.
- Do not add in-package tenant scoping to `packages/*`. The app-level Hono
  auth and deployment boundary continue to own tenant and actor policy.

## Proposed Package Surface

Add a route module file in the booking engine package:

```ts
// @voyant-travel/catalog/booking-engine
export function createCatalogBookingRoutes(
  options: CatalogBookingRoutesOptions,
): Hono

export function createCatalogBookingApiModule(
  options: CatalogBookingRoutesOptions,
): ApiModule
```

The API module should use `module.name = "catalog"` with both `adminRoutes`
and `publicRoutes` mounted at the catalog module path by `@voyant-travel/hono`:

- admin routes become `/v1/admin/catalog/*`
- public routes become `/v1/public/catalog/*`

If the package needs a lower-level escape hatch, also export a route factory
that returns relative routes (`/quote`, `/drafts/:id`, `/holds/place`,
`/holds/release`, `/book`) so templates can compose the surface manually.

## Runtime Options

The route factory should accept callbacks rather than importing template
runtime modules:

```ts
interface CatalogBookingRoutesOptions {
  resolveDb(c: Context): AnyDrizzleDb
  resolveSourceRegistry(c: Context): SourceAdapterRegistry
  resolveOwnedHandlers?(c: Context): OwnedBookingHandlerRegistry | undefined

  resolveActorId?(c: Context): string | null
  resolveCorrelationId?(c: Context): string
  resolveAdapterContext?(input: CatalogBookingAdapterContextInput): SourceAdapterContext
  resolveEntityProvenance?(input: CatalogBookingProvenanceInput): Promise<CatalogBookingProvenance>

  contentEnricher?: QuoteContentEnricher
  onContentEnricherError?: QuoteEntityDeps["onEnricherError"]
  captureSnapshotContent?: SnapshotContentCapturer

  resolveHoldTtlMs?(input: CatalogBookingHoldTtlInput): Promise<number>
  onDraftConsumedError?(event: CatalogBookingDraftConsumedError): void
  onCommitted?(event: CatalogBookingCommittedEvent): Promise<void> | void
  transformQuoteResult?(event: CatalogBookingQuoteTransformInput): Promise<QuoteEntityResult>
  transformBookResult?(event: CatalogBookingBookTransformInput): Promise<BookEntityResult>
}
```

Defaults should be conservative:

- `resolveActorId` reads `userId` from Hono context when present and otherwise
  returns `null`.
- `resolveCorrelationId` uses `x-request-id`, then `crypto.randomUUID()`.
- `resolveEntityProvenance` uses `readSourcedEntry(...)` and falls back to
  `OWNED_SOURCE_KIND`.
- `resolveHoldTtlMs` returns 30 minutes unless the template overrides it.
- `resolveAdapterContext` uses the resolved connection id or source kind plus
  the correlation id.

## Request Validation

All JSON routes should use `parseJsonBody(...)` from `@voyant-travel/hono`; query
routes in later slices should use `parseQuery(...)`.

Add local route schemas near the route module. They should validate only the
HTTP contract and keep engine validation inside the engine services:

- quote body: entity pointer, optional source pointer, scope, parameters,
  draft, and TTL
- draft upsert body: entity pointer for creation, source pointer, draft
  payload, current step, current quote id, and TTL
- hold place body: entity pointer, draft id, optional TTL, and parameters
- hold release body: entity module and hold token
- book body: quote id or draft id, optional booking id, party, payment intent,
  parameters, and idempotency key

For the draft-first book flow, `POST /book` should keep the current behavior:
when `draftId` is supplied without `quoteId`, load the draft, require
`current_quote_id`, and pass the draft payload into engine parameters.

## Error Mapping

The package route module should normalize engine errors to HTTP responses:

- `NO_ADAPTER_REGISTERED` and `NO_HANDLER_REGISTERED`: 503
- `QUOTE_NOT_FOUND`: 404
- `QUOTE_EXPIRED` and `QUOTE_MISMATCH`: 409
- `RESERVE_FAILED`: 502
- missing draft: 404
- draft without current quote: 409
- unsupported hold primitive: 503 for place, 204 no-op for release

Use the shared Hono validation error shape for invalid JSON and invalid
payloads. Keep existing booking-engine error payload fields where clients may
already depend on them: `error`, `code`, and optional `context`.

## Operator Starter Migration

After the package module exists, update
`apps/operator/src/api/catalog-booking.ts` to:

- import the package route factory
- mount the shared route family for both admin and public catalog surfaces
- pass operator runtime callbacks:
  - `getBookingEngineRegistryFromContext`
  - `getOwnedBookingHandlerRegistryFromContext`
  - operator-specific hold TTL resolver
  - operator tax quote transform
  - actor id from `userId`
- keep these routes local:
  - `/v1/{admin,public}/catalog/slots`
  - `/v1/admin/catalog/orders*`
  - `/v1/admin/bookings/:id/catalog-snapshot`

This keeps the package extraction small and gives the template an immediate
consumer test.

## Implementation Slices

1. Add route factory and module exports.
   - Create `packages/catalog/src/booking-engine/routes.ts`.
   - Export the route types and factories from
     `packages/catalog/src/booking-engine/index.ts`.
   - Add a package export only if consumers need
     `@voyant-travel/catalog/booking-engine/routes`; otherwise keep the root
     booking-engine export as the public surface.

2. Add route unit tests.
   - Verify every expected path is present on both admin and public surfaces.
   - Verify invalid JSON and invalid payloads return shared validation errors.
   - Verify quote delegates to `quoteEntity` dependencies with resolved
     provenance and adapter context.
   - Verify draft CRUD uses the draft service and preserves create-vs-update
     behavior.
   - Verify draft-first book resolves `current_quote_id`, marks the draft
     consumed, and logs rather than fails when the consume update races.
   - Verify hold place/release behavior for missing handlers and happy paths.

3. Migrate the operator starter.
   - Replace duplicated shared route handlers with the package route factory.
   - Keep operator-specific slots, orders, snapshot enrichment, and tax helpers
     in the template.
   - Confirm existing storefront and operator journey wrappers still call the
     same URLs.

4. Document consumer setup.
   - Update `@voyant-travel/catalog` or `@voyant-travel/catalog-react` docs with the
     minimum server setup.
   - Document required public auth bypass path:
     `/v1/public/catalog`.
   - Document the registry and owned-handler injections a template must supply.

5. Publish as a patch release.
   - Add a changeset for `@voyant-travel/catalog`.
   - Include `@voyant-travel/catalog-react` docs only if its README changes.

## Verification Plan

Run the smallest checks that cover the blast radius:

- `pnpm --filter @voyant-travel/catalog test`
- `pnpm --filter @voyant-travel/catalog typecheck`
- `pnpm -C apps/operator typecheck`
- `pnpm lint:changed`
- `pnpm verify:package-exports` when adding or changing package exports

If the operator migration touches route mounting or public auth allowlists, run
the relevant storefront booking journey smoke test manually against the operator
template.

## Open Questions

- Should the public route factory mount only the BookingJourney contract, or
  should it expose a hook for app-owned public child routes under
  `/v1/public/catalog`?
- Should checkout handoff be a route hook on `POST /book`, or should checkout
  remain a separate app route under `/catalog/checkout/start`?
- Should route responses preserve the current operator starter's loose
  response shapes exactly, or should they be parsed through
  `quoteResponseV1` and `bookResponseV1` before returning?
- Should `captureSnapshotContent` be wired in the first implementation slice,
  or deferred until a template uses it from the route layer?

## Acceptance Criteria

- A consumer can install `@voyant-travel/catalog`,
  `@voyant-travel/catalog-react`, and `@voyant-travel/bookings-react/ui` without copying the
  operator starter's booking route handlers.
- The package exposes a documented route module or factory for both
  `/v1/admin/catalog/*` and `/v1/public/catalog/*`.
- The route module supports the exact HTTP calls made by the current React
  hooks.
- The operator starter consumes the shared route module for the reusable route
  family.
- Template-only catalog routes stay out of `@voyant-travel/catalog`.
