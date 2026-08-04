# Trips Implementation Plan

Status: execution plan
Audience: engineers implementing `@voyant-travel/trips` across an integration branch.

This plan turns [`ai-travel-experience-composition.md`](./ai-travel-experience-composition.md)
into a PR sequence. The goal is to build the full composer on a long-lived
feature branch, merge small reviewable PRs into that branch, then merge the
feature branch into `main` once the whole path is coherent.

Execution note, 2026-05-18: the local feature work has progressed through the
package scaffold, schema/contracts, deterministic trip service, catalog
component adapter, price aggregation, reserve workflow, checkout-start service
extraction, composer checkout handoff, Cruise Extension linking, and the
routes/hooks slice, operator admin-route/schema mounting, and real operator
price/reserve/checkout adapter wiring. The reference storefront composer block
now exists as the first public UI tracer, with the public route surface limited
to customer-safe trip creation, component add, price, reserve, and checkout
operations. The AI tool layer is now wired through the existing catalog MCP
surface with deterministic create/revise/price/reserve itinerary tools.
Component-level cancellation/change preview now exists for support-facing
flows: selected components can be previewed, locally cancellable placeholders
can be cancelled without touching sibling components, committed catalog
components call runtime cancellation adapters, and unsupported paths are
surfaced as staff remediation. The React client package exposes the support
cancellation operations for future admin UI work. Remaining integration work
starts with final integration hardening. `pnpm verify:fast` passes locally for
the feature branch state, publish tarball verification now passes after
aligning the React package build output with its published exports, the
architecture status docs have been updated to reflect the package that landed,
and the new public packages have an explicit changeset. The composer service
has been split into operation-focused modules so `service.ts` is now only the
public rollup. The agent-quality report still flags non-blocking operator
template/generated-route-tree debt to address before or during final review.

## 1. Branching model

Use one integration branch:

```txt
main
  -> feature/trips
       -> tc/00-implementation-plan
       -> tc/01-package-scaffold
       -> tc/02-schema-contracts
       -> ...
```

Rules:

- Branch every slice from the latest `feature/trips`, not from
  `main`.
- Open every slice PR against `feature/trips`.
- Keep `feature/trips` passing the smallest relevant verification
  lane after each merge.
- Regularly merge or rebase `main` into `feature/trips` so the final
  PR is integration work, not archaeology.
- Do not merge `feature/trips` into `main` until the final acceptance
  checklist in §5 passes.

Each slice PR should include its own tests and any doc updates needed to keep
the integration branch understandable.

## 2. Implementation principles

- Deterministic composer services come before AI tools.
- The composer is catalog-based. Admin, storefront, partner, and AI surfaces
  select Catalog Items and persist catalog provenance (`entityModule`,
  `entityId`, `sourceKind`, optional connection/ref). They do not select
  products, hotels, cruises, or other vertical-owned records directly.
- `sourceKind: "owned"` is a catalog fulfillment detail, not a composer mode.
  Owned rows dispatch through internal Voyant handlers when the corresponding
  module is installed; sourced rows dispatch through supplier/inventory-source
  adapters. OTA deployments may omit the products module entirely.
- The composer reuses the catalog booking engine's per-line Booking Session,
  Quote, Hold, Commit, and snapshot lifecycle. It does not introduce a second
  single-line booking engine.
- Split by lifecycle boundary, nest by dependency, aggregate by customer
  experience.
- Keep taxes, cancellation rules, supplier references, and fulfillment status
  component-level. Aggregate views may summarize them, but must not erase them.
- Use **Extra** as the generic dependent child-line term. Use **Cruise
  Extension** only for the cruise-specific pre/post hotel or land-program
  category; its catalog definition may be shared across cruises/sailings.
- Flights are not part of the first live-booking slice unless public-safe
  flight search, price, reserve, and order-status routes are included in the
  same feature branch. Until then, flights are manual placeholders.

## 3. PR Sequence

### PR 00: implementation plan

Branch: `tc/00-implementation-plan`

Scope:

- Add this plan.
- Cross-link it from the composer architecture doc.
- Normalize terminology discovered during planning.

Acceptance:

- `git diff --check` passes for changed docs.

### PR 01: package scaffold

Branch: `tc/01-package-scaffold`

Scope:

- Create `packages/trips`.
- Add package exports for `.` plus planned subpaths:
  - `./schema`
  - `./validation`
  - `./service`
  - `./routes`
  - `./testing` if test helpers are needed
- Wire `package.json`, `tsconfig`, Vitest config, and package index exports
  using existing package patterns.
- Do not add starter wiring yet.

Acceptance:

- Package typecheck passes.
- A placeholder package test proves the package is picked up by the workspace.
- Public exports follow the repository package-surface rules.

### PR 02: schema and contracts

Branch: `tc/02-schema-contracts`

Scope:

- Add the minimum durable schema for the composer:
  - `trip_envelopes`
  - `trip_components`
  - `trip_component_events` or equivalent append-only audit trail
- Add Zod contracts for create/read/update operations.
- Model component references as soft references:
  - catalog-backed component: `entityModule`, `entityId`, `sourceKind`,
    optional `sourceConnectionId`, optional `sourceRef`
  - booking journey refs: `bookingDraftId`, `catalogQuoteId`
  - committed refs: `bookingId`, `bookingGroupId`, `orderId`,
    `paymentSessionId`, provider/supplier refs where available
- Include component kind/status enums:
  - kind: `catalog_booking`, `flight_placeholder`, `manual_placeholder`,
    future `flight_order`, future `external_order`
  - status: `draft`, `priced`, `unavailable`, `held`, `booked`,
    `checkout_started`, `failed`, `cancelled`
- Store aggregate price snapshots on the envelope and component price/tax
  snapshots on each component.

Acceptance:

- Unit tests cover contract parsing and invalid lifecycle/status transitions.
- Schema follows `docs/architecture/schema-discipline.md`.
- No cross-package foreign keys are introduced where link definitions or soft
  references are the established pattern.

### PR 03: deterministic trip service

Branch: `tc/03-trip-service`

Scope:

- Implement service methods:
  - `createTrip`
  - `getTrip`
  - `updateTrip`
  - `addComponent`
  - `updateComponent`
  - `removeComponent`
  - `reorderComponents`
- Support manual placeholders and catalog-backed trip components.
- Enforce basic invariants:
  - component belongs to one envelope
  - removed components cannot be priced or reserved
  - committed component refs cannot be mutated silently

Acceptance:

- Unit tests cover create/read/update/remove/reorder.
- Integration tests cover DB persistence if the package has DB test helpers.
- No AI, no checkout, no template code.

### PR 04: catalog component adapter

Branch: `tc/04-catalog-component-adapter`

Scope:

- Add an internal adapter that maps a `trip_component` to a per-line
  `BookingSelectionV1`.
- Reuse `@voyant-travel/catalog/booking-engine` services/contracts for:
  - shape lookup
  - quote
  - per-line booking draft creation/update where needed
- Support initial component types:
  - catalog-backed components from any installed/indexed catalog vertical
  - optional owned products/cruises only through their catalog rows and owned
    handlers
  - sourced products/stays/cruises through source adapters
  - manual placeholders
- Exclude flights from live booking in this PR.

Acceptance:

- Tests prove one envelope can hold multiple catalog-backed components.
- Tests prove each component maps to its own booking draft/quote reference.
- The composer does not reach into vertical internals when catalog
  booking-engine primitives are available.

### PR 05: price trip and aggregate taxes

Branch: `tc/05-price-trip`

Scope:

- Implement `priceTrip`.
- For catalog-backed components, call the catalog booking engine per component.
- For manual placeholders, carry explicit estimated price and warning state.
- Aggregate:
  - component subtotals
  - component tax lines
  - component totals
  - envelope total
  - quote expiries
  - warnings and partial failures
- Preserve per-component taxes. Do not collapse product, stay, flight, cruise,
  or Extra tax treatment into one blended tax line.

Acceptance:

- Tests cover product + stay aggregate pricing.
- Tests cover different tax lines on different components.
- Tests cover one priced component plus one manual placeholder.
- Tests cover partial quote failure without losing the rest of the trip.

### PR 06: reserve workflow

Branch: `tc/06-reserve-workflow`

Scope:

- Implement workflow-backed `reserveTrip`.
- Reserve/book components in dependency order.
- Persist per-component hold/booking status.
- Add idempotency for reserve attempts.
- Add compensation for partial failure:
  - release holds where supported
  - mark unsupported release paths explicitly for staff remediation
- Keep the aggregate envelope as the customer-facing object while component
  bookings/orders remain independent where lifecycle differs.

Acceptance:

- Tests cover all-success reserve.
- Tests cover second component failure with first component compensation.
- Tests cover unsupported sourced-hold release behavior.
- Tests cover idempotent retry returning the existing result.

### PR 07: checkout-start extraction

Branch: `tc/07-checkout-start-extraction`

Scope:

- Extract reusable logic from
  `apps/operator/src/api/catalog-checkout.ts` into framework-owned
  services.
- Preserve template ownership of:
  - payment provider config
  - bank-transfer details
  - per-booking contract template choice
  - CRM Proposal creation
  - storefront URLs
- Expose a service callable by both the existing single-line journey and the
  future composer checkout step.
- Keep payment schedules and document-generation intent on the underlying
  component booking/order, not on the trip envelope or on per-currency
  aggregates. The envelope may summarize totals, but it is not the source of
  truth for collection terms.

Acceptance:

- Existing single-line checkout behavior remains covered.
- Template route becomes thin glue around the extracted service.
- No composer-specific assumptions leak into checkout services.

### PR 08: composer checkout handoff

Branch: `tc/08-composer-checkout`

Scope:

- Implement `startCheckout`.
- Support one customer-facing checkout handoff for an envelope with multiple
  component bookings/orders.
- Use existing checkout collection primitives against the component booking or
  order schedule. A trip can show one unified payment experience, but each
  independent booking keeps its own schedule, contract, and terms.
- Return UI-ready state:
  - checkout target
  - provider redirect or payment session
  - bank instructions where applicable
  - hold expiry summary
  - terms/policy disclosure state

Acceptance:

- Tests cover product + stay checkout handoff.
- Tests prove component-level refs remain queryable after checkout starts.
- Tests prove the aggregate total equals the sum of component totals.

### PR 09: Cruise Extension linking helper

Branch: `tc/09-cruise-extension-linking`

Scope:

- Codify the reusable Cruise Extension pattern from
  [`cruises-module.md`](./cruises-module.md):
  - extension definitions are reusable `products`
  - they can link to one or more cruises/sailings
  - selected extension lines are nested or split by lifecycle boundary
- Add helper contracts/services where needed so templates do not invent the link
  shape repeatedly.

Acceptance:

- Tests or fixtures show one Cruise Extension linked to multiple cruises or
  sailings.
- Tests show selected extension behavior can be represented as an Extra inside
  the cruise component or as a sibling component under the same envelope.

### PR 10: routes and React hooks

Branch: `tc/10-routes-hooks`

Scope:

- Add Hono route factory for composer operations:
  - create/get/update trip
  - add/update/remove component
  - price trip
  - reserve trip
  - start checkout
- Add React hooks in the appropriate package:
  - `useTrip`
  - `useTrips`
  - `useTripComponents`
  - `usePriceTrip`
  - `useReserveTrip`
  - `useTripCheckout`
- Keep routes thin: validate input, resolve services, call service methods,
  serialize response.

Route naming rule: expose `/trips` for public/admin clients. Do not add a
composer-level `/drafts` route; `draft` is a status, not the API resource.

Acceptance:

- Route tests cover validation and service dispatch.
- Hook tests cover request shape and cache invalidation.
- Public/admin route capability differences are explicit.

### PR 11: operator runtime adapter wiring

Branch: `tc/11-runtime-adapters`

Scope:

- Mount `createTripsApiModule(...)` in the operator starter with
  request-scoped runtime dependencies.
- Quote composer components through `quoteEntity` with the same source
  registry, owned handler registry, promotion evaluator, and operator tax
  transform as `/v1/{admin,public}/catalog/quote`.
- Reserve composer components through `bookEntity`, persisting independent
  component booking/order references under the envelope.
- Start composer checkout by handing each held component booking into the
  existing catalog checkout-start service.
- Keep compensation best-effort:
  - use catalog `cancelEntity` where the adapter supports cancellation
  - mark unsupported release paths for staff remediation

Acceptance:

- Operator typecheck and lint pass with the mounted runtime dependencies.
- Composer package typecheck and tests still pass.
- A missing runtime dependency still returns an explicit 501 in package route
  tests for templates that do not wire adapters.
- The implementation remains an operator-template adapter layer; the core
  composer package does not import template code.

### PR 12: reference storefront composer block

Branch: `tc/12-reference-storefront-block`

Scope:

- Add a non-AI reference UI that can compose a small itinerary:
  - itinerary timeline/cards
  - component add/remove
  - manual placeholder state
  - live price and expiry badges
  - reserve/buy CTA
  - staff handoff state
- Reuse existing UI packages and design conventions.
- Keep it configurable enough for the operator starter without making the
  template own core behavior.
- Add public-surface support to the composer React client and mount public
  composer routes in the operator starter for the storefront tracer.
- Keep admin-only mutation/reference endpoints off the public composer route
  surface.

Acceptance:

- The reference block can compose product + stay and show an aggregate total.
- Reserve/buy calls the composer services, not starter-local orchestration.
- Browser verification covers desktop and mobile if the UI is mounted in a
  runnable app.

### PR 13: AI tool layer

Branch: `tc/13-ai-tools`

Scope:

- Add AI-safe tools only after deterministic services exist:
  - `create_trip`
  - `revise_trip`
  - `price_trip`
  - `reserve_trip`
- Reuse catalog MCP discovery tools for search/get/quote where possible.
- Persist structured decisions, not prompt-dependent raw plans.
- Enforce customer-safe audience filtering for storefront agents.

MCP naming rule: use Trip naming for composer tools. This feature is still in
beta, so do not carry `*_itinerary_draft` aliases.

Acceptance:

- Tool tests prove deterministic services are called with validated payloads.
- AI tools cannot mutate committed bookings directly.
- Public/customer tools cannot access admin-only inventory or operational
  fields.

### PR 14: cancellation and change preview

Branch: `tc/14-cancel-change-preview`

Scope:

- Add component-level cancellation/change preview APIs.
- Return one customer-facing preview while preserving per-component rules:
  - refund estimate
  - penalty
  - supplier cancellation deadline
  - staff action required
  - unsupported automation
- Support cancelling selected components under an envelope without implying
  cross-component atomic cancellation unless the workflow can guarantee it.

Acceptance:

- Tests cover cancelling stay + flight placeholders while leaving a product
  component intact.
- Tests cover a component that requires staff remediation.
- UI/API response makes component boundaries visible to support staff.

### PR 15: integration hardening

Branch: `tc/15-integration-hardening`

Scope:

- Run broad verification.
- Confirm no temporary beta compatibility shims remain in public/admin surfaces.
- Update architecture docs with actual implemented decisions.
- Create final rollout notes for merging `feature/trips` into `main`.

Acceptance:

- `pnpm verify:fast` passes at minimum.
- `pnpm verify:full` passes before the final merge if the branch touched broad
  packages/templates.
- All composer docs match the code that actually landed.

### PR 16: service-size cleanup

Branch: `tc/16-service-split`

Status: implemented locally on the integration branch.

Scope:

- Split `packages/trips/src/service.ts` into operation-focused
  modules while preserving the existing `./service` public export surface:
  - `service-types.ts` for lifecycle result/dependency contracts
  - `service-trips.ts` for trip create/read/update/component CRUD
  - `service-pricing.ts` for quote application and aggregate pricing
  - `service-reservation.ts` for reserve/compensation
  - `service-checkout.ts` for checkout handoff
  - `service-cancellation.ts` for preview/cancel
  - `service-internals.ts` for shared event/status helpers
- Keep `service.ts` as the rollup that exports the public helpers and
  assembles `tripsService`.
- Do not change route, MCP, or React contracts in this cleanup PR.

Acceptance:

- `packages/trips/src/service.ts` drops below the agent-quality
  file-size threshold.
- `pnpm --filter @voyant-travel/trips typecheck`
- `pnpm --filter @voyant-travel/trips test`
- `pnpm verify:fast`

## 4. Suggested first tracer

The first end-to-end tracer should be deliberately small:

```txt
Trip / Package Envelope
  Component 1: product booking
  Component 2: hospitality stay booking
  Component 3: manual placeholder transfer
```

It should prove:

- multiple components under one customer-facing envelope
- per-component booking draft and quote refs
- aggregate price display
- per-component tax lines
- manual placeholder warnings
- reserve workflow with component statuses
- checkout handoff after successful reserve

Do not include live flights in this tracer unless public-safe flight surfaces
are implemented in the same feature branch.

## 5. Final acceptance before merging to main

The integration branch is ready to merge when:

- A customer-facing flow can create, price, reserve, and start checkout for a
  composed trip with at least two live catalog-backed components.
- Component bookings/orders remain separately inspectable after aggregate
  checkout starts.
- Tax lines remain component-level and are aggregated without losing source
  treatment.
- Partial failure produces deterministic compensation or staff remediation
  state.
- Cruise Extensions are represented as reusable definitions and selected lines
  follow the lifecycle boundary rule.
- AI tools, if included, call deterministic composer services and cannot bypass
  lifecycle, pricing, availability, or audience checks.
- Documentation, route contracts, and package exports reflect the shipped
  behavior.

## 6. Rollout notes for `feature/trips`

### Merge target

- Keep slice PRs targeting `feature/trips` until the final acceptance
  checklist above is true.
- Merge `feature/trips` to `main` only after the operator starter
  has been smoke-tested with the reference storefront composer route and the
  release train has a clean verification story.

### Required verification before final merge

- `pnpm verify:fast`
- `pnpm verify:package-exports`
- `pnpm verify:publish-tarballs`
- `pnpm --filter operator build`
- Storefront smoke test: `GET /shop/composer` returns 200 from the operator
  starter dev server.

### Full-verification blocker to resolve or explicitly waive

`pnpm verify:full` includes non-report agent-quality enforcement. The current
feature branch still has large-file and generated-route-tree findings in
changed files. The composer-owned service-size finding has been resolved by PR
16. The remaining findings are inherited from the operator starter,
starter-local checkout/booking files, and the generated TanStack route tree;
resolve those or record deliberate review waivers with follow-up owners/issues
before requiring `verify:full`.

### Production-hardening follow-ups

- Move generic checkout-start behavior out of `apps/operator` into
  framework-owned catalog/checkout services before non-operator starters rely
  on the composer package.
- Replace hospitality/cruise placeholder or stamping holds with real supplier,
  room, cabin, or sailing inventory locks where supported.
- Add public-safe flight search, price, reserve, order-status, and cancellation
  surfaces before treating flights as live composer components.
- Build support/admin UI for component-level cancellation preview, cancellation
  execution, and staff-remediation queues.
- Implement Proposal Versions per ADR-0018 for proposal approval, proposal
  documents, and longer sales cycles while keeping reserve materialization at
  component lifecycle boundaries.
