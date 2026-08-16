# Voyant Platform Surface Roadmap

This roadmap turns downstream integration friction into an upstream package and
API plan for Voyant itself.

For the umbrella architecture doctrine and the remaining cleanup backlog, see
[Voyant Extensibility Rubric](./extensibility-rubric.md) and
[Voyant Extensibility Gap Analysis](./extensibility-gap-analysis.md).

For schema and migration conventions across modules, see
[Voyant Data Model And Schema Authoring](./data-model-schema-authoring.md).

For HTTP route conventions across the admin and public API surfaces, see
[Voyant API Route Authoring](./api-route-authoring.md).

For package and extension-surface classification, see
[Voyant Module, Provider, Extension, And Plugin Taxonomy](./module-provider-plugin-taxonomy.md).

For executable backend workload classification, see
[Voyant Execution Architecture](./execution-architecture.md).

For runtime cache backend guidance and cache-semantics rules, see
[Voyant Caching Architecture](./caching-architecture.md).

For public-media and private-document storage rules, see
[Voyant Storage Architecture](./storage-architecture.md).

For canonical notification delivery and provider-resolution rules, see
[Voyant Notifications Architecture](./notifications-architecture.md).

For shared authentication, identity, and actor-context rules, see
[Voyant Auth And Identity Architecture](./auth-identity-architecture.md).

For actor attribution, capability checks, approval gates, action history, and
domain-level reversal before broad AI automation, see
[Action Ledger, Roles, And Reversibility](./action-ledger-roles-and-reversibility.md).

For the shared admin runtime, extension surface, and localization model, see
[Voyant Admin Architecture](./admin-architecture.md).

For customer-facing storefront and public-contract rules, see
[Voyant Storefront And Public Contract Architecture](./public-api-architecture.md).

For AI-assisted itinerary planning, cross-vertical composition, and
reserve/buy orchestration, see
[AI Travel Experience Composition](./ai-travel-experience-composition.md).

For deferred later-stage architecture ideas that should stay visible without
becoming active requirements yet, see
[Voyant Future Architecture Considerations](./future-architecture-considerations.md).

## Principles

- Do not preserve Payload semantics as a long-term public contract.
- Keep admin CRUD and consumer-facing contracts separate.
- Prefer reusable domain packages over app-local adapters.
- Make every public surface explicit, typed, and stable enough for multiple
  agencies to build on top of it.

## Current State

Voyant already has the right transport split:

- `/v1/admin/*` for staff/operator surfaces
- `/v1/public/*` for customer, partner, and supplier surfaces
- `/auth/*` for session and workspace/authenticated-user operations

The current gap is no longer “invent the surface model”. The gap is:

- keep published npm releases aligned with the source-level surfaces already
  implemented in-tree
- finish the remaining public/storefront contracts that still force app-local
  compatibility layers
- add first-class lifecycle/document workflows where apps still need copied
  orchestration

Server API runtime taxonomy note:

- `@voyant-travel/hono` is Voyant's sole server API runtime implementation, not
  a swappable adapter or a plugin package in the same sense as Netopia or SmartBill
- reusable server API contributions use the `ApiBundle` terminology;
  product integrations remain plugins at the project configuration boundary

This document reflects the source tree on `main` as of 2026-04-14 and calls
out where the latest published npm train still lags behind source.

## Status Snapshot

### Release and package integrity

Resolved in source and published through the `0.3.1` npm train:

- `@voyant-travel/finance` exports the public finance schemas and service helpers
  used by `@voyant-travel/finance-react`
- `@voyant-travel/inventory` exports `publicProductsService`
- `@voyant-travel/bookings` exports `publicBookingsService` and public booking route
  helpers
- `@voyant-travel/inventory-react` exports the day, version, and media hooks and
  query helpers from the package root
- CI/release now smoke-test runtime exports in addition to tarball contents

Still release-sensitive after `0.3.1`:

- the newer source-level storefront and booking surfaces added after `0.3.1`
  still need the next npm release so downstream apps can remove local fallbacks
  without depending on `main`

### Auth and workspace surface

Resolved upstream for contracts, partially resolved for reusable UI:

- `@voyant-travel/auth-react` covers current user, workspace, status, active
  organization, members, invitations, invite, remove, cancel, and role update
  flows
- Voyant still does not ship reusable staff team-management registry UI

### Customer portal surface

Resolved upstream for the base platform contract, adoption still incomplete in
  downstream apps:

- `@voyant-travel/public-api/customer-portal` and
  `@voyant-travel/public-api-react/customer-portal` own the portal runtime and
  React surface; the beta `@voyant-travel/customer-portal` package names are not
  part of the v1 workspace package surface
- public/authenticated routes now cover bootstrap, profile, companions,
  booking list/detail, documents, marketing consent, email contact-exists, and
  phone contact-exists
- booking document coverage now includes native traveler documents plus
  booking-linked contract attachments and finance invoice/proforma renditions
  when a customer-safe download URL exists
- booking detail now includes booking-linked finance document summaries and
  payment history
- customer records now expose a first-class billing-address object backed by
  identity addresses, with public profile updates able to keep that address in
  sync
- booking summaries now include native `productTitle` and `paymentStatus`
  fields so account dashboards do not need extra booking-detail or finance
  fetches just to render list rows
- companion import from booking participants now exists as a first-class
  customer-portal action, so storefronts do not need app-local participant-
  history import helpers
- booking detail and a dedicated customer-portal route now expose a stable
  `billingContact` shape derived from booking wizard state with participant /
  customer fallback, so payment dialogs do not need admin-owned billing-contact
  adapters
- public customer-portal profile now includes middle-name derivation, top-level
  date-of-birth/address fields, consent provenance/source, and encrypted
  travel-document reads/writes from the shared `user_profiles` identity store
- public companions now expose first-class `typeKey` and typed traveler
  identity fields for names, date of birth, addresses, and documents, while
  still storing those values compatibly in named-contact metadata under the
  hood

### Storefront catalog surface

Partially resolved:

- public catalog routes now cover product search/filter/sort, category listing,
  tag listing, product detail, localized slug/SEO fields, and slug lookup
- `@voyant-travel/inventory` now exposes a reusable internal `catalogProductsService`
  for localized product hydration and locale-aware search-document generation,
  so background jobs do not need to reimplement product/category/tag/media/
  translation joins on top of raw tables
- public catalog list reads now also expose typed location summaries on product
  cards and support location-aware filters by title, city, country code, and
  location type, reducing the need for app-local destination listing adapters

Still missing:

- richer storefront filtering semantics only where apps need a broader
  destination model than the shared product-location contract
- first-class promo authoring/editorial workflows only if Voyant wants to go
  beyond the current shared transactions-backed applicability helpers

### Public pricing and availability surface

Partially resolved:

- public pricing and availability routes now cover snapshot-style reads
- `@voyant-travel/public-api` now exposes first-class public departure list/detail
  reads plus departure price preview over slots, pricing, and extras
- `@voyant-travel/public-api` now also exposes product extensions and departure
  itinerary reads so storefront booking flows do not need app-local wrappers
  for those payloads
- `@voyant-travel/commerce/promotions` now exposes storefront promotional-offer
  resolvers over Commerce-owned promotional offers, giving apps a first-class
  way to plug native product/departure promo applicability into the storefront
  contract without inventing their own resolver shape
- promotion create/update validation now recognizes storefront presentation and
  applicability metadata explicitly, so storefront promo payloads no longer
  live as unchecked blobs inside generic offer metadata

Still missing:

- richer public promotional offer payloads only if Voyant wants to own promo
  authoring/storage beyond the shared transactions-backed resolver
- any remaining app-local wrappers around older storefront-specific payloads

### Public booking and checkout surface

Canonical surface for Booking v1:

- Catalog Booking Session v1 is the sole pre-commit aggregate and public
  construction surface
- Session state, Quote, Hold, payment intent, idempotency, and Commit outcomes
  remain on their owning aggregates until Commit succeeds
- the Storefront SDK exposes the canonical create/resume/adopt/renew/update/
  quote/hold/commit/abandon operations
- Bookings public routes expose committed overview and guest access only
- `@voyant-travel/finance/checkout` now exposes a module-based checkout surface with typed
  collection-plan and initiate-collection contracts
- `@voyant-travel/finance/checkout` now also exposes a unified
  `/v1/public/finance/checkout/collections/bootstrap` contract that can start exact-amount
  collection from either a committed `bookingId` or a Booking Session id
- admin checkout reminder tracking is now backed by first-class notification
  reminder runs instead of app-local booking metadata
- bookings now expose a first-class admin overview lookup route and service
  helper that can resolve by booking id / booking number / booking code without
  requiring the public `bookingNumber + email` contract
- `@voyant-travel/public-api-react` now exposes typed operations, query helpers, and
  hooks for the public storefront contract over settings, departures, pricing
  preview, itinerary, extensions, and promotional offers
- `@voyant-travel/public-api-client` now provides the framework-agnostic TypeScript
  facade for custom storefronts, wrapping existing public storefront, booking
  session, committed Booking overview, and checkout collection contracts

Still missing:

- transactionally classify and cut over beta booking-session/draft rows before
  removing their retained physical tables
- migrate React storefront helpers to delegate to `@voyant-travel/public-api-client`
  instead of maintaining parallel fetch wrappers
- lifecycle contracts for legal previews, explicit payment result polling, and
  finalized checkout side effects still need backend route support before the
  SDK can expose them

### Public finance surface

Partially resolved:

- public finance now covers booking payment options, payment-session
  reads/starts, and voucher validation
- booking-scoped public finance document lookup now covers invoice and proforma
  renditions, including customer-safe download metadata when a ready rendition
  has a public or signed URL available
- booking-scoped public finance payment history now exists at
  `/v1/public/finance/bookings/:bookingId/payments` with invoice context
- admin checkout reminder tracking is now exposed as a first-class surface
- notifications now expose enriched admin reminder-run reads with rule, delivery,
  and entity-linkage context plus direct run lookup, so apps do not need
  custom SQL joins just to render reminder state for bookings, invoices, or
  schedules

Still missing:

- any remaining finance-side getters that downstream apps still need outside
  the checkout bootstrap path

Now covered through checkout:

- exact-amount booking collection/bootstrap when the requested amount does not
  match an existing schedule or invoice
- first-class booking checkout start APIs that combine checkout creation and
  provider initiation when a provider starter is configured
- customer-safe bank transfer instructions returned by checkout when a bank
  transfer resolver is configured
- invoice-backed due reminders for unpaid bank-transfer collection documents
  via `@voyant-travel/notifications`

Now covered through finance + provider adapters:

- first-class invoice/proforma settlement polling and reconciliation through
  `POST /v1/admin/finance/invoices/:id/poll-settlement`
- provider-driven settlement sync via configurable pollers, including a
  SmartBill adapter in `@voyant-travel/plugin-smartbill`

### Legal and finance document workflows

Pending:

- storefront default contract-template selection and template preview now exist
  in source, but richer defaulting policy may still be app-owned

Required upstream workflows:

- booking document preview workflows where downstream apps still need richer
  storefront-facing preview semantics

Now covered for legal:

- first-class contract document generate/regenerate workflow with canonical
  attachment persistence
- configurable admin routes for `generate-document` and `regenerate-document`
  through `createLegalApiModule()` / `createContractsAdminRoutes()`
- shared Liquid-compatible template rendering for contract templates, including
  loops, conditionals, and filters in html/markdown bodies plus lexical text
  nodes
- storage-backed contract document generators using Voyant storage providers,
  so apps can persist rendered artifacts without custom upload plumbing

Still missing for legal:

- no further shared infrastructure blockers; only product-level decisions about
  whether Voyant should go beyond the bundled basic PDF adapter

Now covered for finance:

- first-class invoice/proforma document generate/regenerate workflow with ready
  rendition persistence
- configurable admin routes for `generate-document` and `regenerate-document`
  through `createFinanceApiModule()` / `createFinanceAdminDocumentRoutes()`
- shared Liquid-compatible template rendering for invoice/proforma templates,
  including loops, conditionals, and filters in html/markdown bodies plus
  lexical text nodes
- storage-backed invoice/proforma document generators using Voyant storage
  providers for html/json/xml artifacts without app-local upload plumbing

Still missing for finance:

- no further shared infrastructure blockers; only product-level decisions about
  whether Voyant should go beyond the bundled basic PDF adapter

Now covered across finance + notifications:

- booking document bundle and email-send workflow for contract attachments and
  invoice/proforma renditions
- attachment-capable notification payloads and Resend delivery wiring for
  document sends

### Storefront support surfaces

Resolved upstream in source after `0.3.1`:

- first-class storefront settings contract via `@voyant-travel/public-api`
- generic email/SMS verification challenge flow via
  `@voyant-travel/public-api/verification`
- transport requirements for passport/document rules via
  `@voyant-travel/bookings/requirements`

App-owned for now:

- storefront lead-capture and newsletter intake should remain app-owned unless
  Voyant deliberately expands into broader CRM/marketing intake workflows

Optional future upstream candidates:

- a broader storefront transport model if apps need more than passport/document
  requirements
- a first-class promotional-offers data model if Voyant wants to own promo
  authoring/storage rather than just exposing a pluggable storefront contract

Now covered as a pluggable storefront contract:

- `@voyant-travel/public-api` can expose product/departure-applicable promotional
  offers and slug-based offer detail through injected resolvers, without
  forcing Voyant core to adopt a CMS-specific promo schema
- `@voyant-travel/commerce/promotions` now ships a shared resolver factory and
  metadata schema for that contract, so apps can back storefront promotional
  offers with native Commerce offers instead of custom resolver plumbing

### Product brochure workflow

Resolved upstream in source:

- products now expose a first-class brochure workflow through
  `GET/PUT/DELETE /v1/products/:id/brochure`,
  `GET /v1/products/:id/brochure/versions`,
  `POST /v1/products/:id/brochure/versions/:brochureId/set-current`,
  `DELETE /v1/products/:id/brochure/versions/:brochureId`, and
  `GET /v1/public/products/:id/brochure`
- public catalog product detail now exposes `brochure` separately from the
  normal media gallery
- `@voyant-travel/inventory/tasks` now includes
  `generateAndStoreProductBrochure()` so apps can generate a product PDF,
  persist it through a Voyant storage provider, and register it as the
  canonical current brochure without an app-local `product_media(document)`
  convention
- brochures can now be authored in code with Liquid-compatible templates via
  `createDefaultProductBrochureTemplate()`,
  `loadProductBrochureTemplateContext()`, and
  `renderProductBrochureTemplate()`
- brochure generation now supports pluggable printers; apps can inject their
  own printer implementation, use the bundled basic PDF printer, or use the
  bundled Cloudflare Browser printer adapter
- brochure history is now first-class: each new upsert creates a new version,
  one version is marked current, older versions remain queryable, and admins
  can promote or delete individual versions without losing brochure history

Still missing only if Voyant wants to expand further:

- richer brochure editorial UX beyond code-authored templates, version history,
  and one current public brochure artifact

### Shared editor surface

Resolved for base catalog CRUD and the remaining concrete deeper product-editing
gaps:

- packaged/shared registry coverage now exists for products, tags, categories,
  pricing categories, options, option units, availability, departures,
  schedules, product days, day services, versions, and media
- packaged itinerary day rows now include shared day-level media management
- packaged media sections can now register uploaded files through an injected
  upload handler instead of forcing every app to keep a local upload wrapper

## Near-Term Priority

1. Publish a new npm release so downstream apps can consume the storefront,
   booking-session, finance-document, verification, and booking-document-send
   surfaces already landed in source after `0.3.1`.
2. Continue catalog/customer-portal fit work where downstream storefronts still
   need richer search, pricing, booking-summary, and traveler-profile
   semantics.
3. Make explicit product decisions only where Voyant may want to expand into
   broader promo authoring/editorial UX, destination modeling, or richer
   brochure authoring/editorial workflows.

## Execution Slices

### Slice 1: release source surfaces already completed

Completed in the current source tree:

- customer-portal phone contact-exists preflight route and React hook
- legal default active contract-template selector with language fallback
- legal public template preview route
- public catalog localized slug/SEO fields and slug lookup route
- storefront settings via `@voyant-travel/public-api`
- storefront departure list/detail and departure price preview via
  `@voyant-travel/public-api`
- storefront product extensions and departure itinerary via
  `@voyant-travel/public-api`
- storefront verification via `@voyant-travel/public-api/verification`
- transport requirements via `@voyant-travel/bookings/requirements`
- booking-session state storage and repricing
- public finance booking documents
- checkout module formalization and admin reminder tracking

Next release action:

- publish those source surfaces on the next npm version so downstream apps can
  consume them without pinning to source

### Slice 2: checkout and payment completion

Completed in source:

- settlement polling / reconciliation behavior for unpaid bank-transfer
  documents through finance settlement routes and provider pollers

### Slice 3: legal contract document lifecycle

Completed in source:

- richer Liquid-compatible templating beyond simple path replacement
- stable template preview/render APIs for storefront acceptance and admin
  workflows
- explicit manual admin workflows for generate/regenerate document routes when
  lifecycle automation is optional
- storage-backed contract document generators for the common “upload rendered
  artifact” path
- bundled basic PDF document serializers/generators for apps that do not need a
  custom browser renderer

### Slice 4: finance document lifecycle

Completed in source:

- invoice/proforma generate/regenerate workflow with ready rendition
  persistence
- booking document bundle/list and send workflow via `@voyant-travel/notifications`
  for contract attachments and invoice/proforma renditions
- unpaid bank-transfer reminder and polling workflows through invoice reminder
  targets and finance settlement polling
- storage-backed invoice/proforma document generators for html/json/xml
  artifact persistence
- bundled basic PDF document serializers/generators for apps that do not need a
  custom browser renderer

### Slice 5: catalog and customer-portal fit

Completed in source:

- Commerce promotions now expose a native storefront promotional-offer resolver
  on top of promotional offers, and shared validation/editorial UI now support
  typed storefront presentation and applicability metadata instead of leaving
  storefront promo payloads as unchecked blobs
- products now expose a lightweight destination taxonomy with translations and
  product links, and the public catalog can filter/list products by
  destination id or slug

Still optional only if Voyant wants to go further:

- richer promo editorial workflows beyond the typed storefront offer metadata
  fields already supported on shared offers
- a broader destination knowledge model beyond taxonomy + translations + product
  links
- any remaining customer-portal identity semantics that go beyond the current
  shared profile, companion, booking-financial, and document coverage
