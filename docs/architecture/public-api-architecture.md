# Voyant Public API And Public Contract Architecture

This guide defines how Voyant should treat the customer-facing public surface and
the broader public API surface.

The goal is simple:

- keep `public surface` as the customer-facing product/runtime concept
- keep `/v1/public/*` as the external-facing HTTP boundary
- derive sales Channel authority from resolved Public API identity
- separate public contracts from admin CRUD semantics
- keep the final public surface application starter-owned while the shared public
  contract remains framework-owned

Public API should be a first-class framework surface, not just a set of public
routes.

A public surface authenticates with one of two access keys, and which one it is
decides which routes it can reach. That split — and the fact that origin binding
is a browser control rather than a security boundary — is specified in
[`public-api-key-capability-line.md`](./public-api-key-capability-line.md).

## Core Rules

### 1. Keep `public surface` as the customer-facing package concept

In Voyant, `public surface` should remain the product/runtime term for the
customer-facing discovery and booking experience.

That includes things like:

- catalog browsing
- departure detail
- pricing preview
- booking-session flows
- customer-facing extensions and itinerary reads

Rule:

Use `public surface` as the package/runtime concept for the customer-facing
experience.

### 2. Keep `/v1/public/*` as the HTTP umbrella

The HTTP transport boundary should stay:

- `/v1/admin/*` for staff/operator surfaces
- `/v1/public/*` for external-facing surfaces

`public surface` should not become a second nested HTTP namespace like
`/v1/public/public surface/*` by default.

Rule:

Keep `public` as the HTTP boundary and `public surface` as the product/runtime
concept.

### 3. Public routes should be capability-based

Public routes should be grouped by business capability:

- products
- pricing
- bookings
- finance
- customer portal

They should not be shaped around which frontend happens to call them.

Rule:

Public HTTP paths describe capabilities, not applications.

## Public Contract

### 4. Public contracts should stay separate from admin CRUD semantics

Public customer-facing APIs should not simply leak admin service shapes,
internal CRUD records, or admin workflows.

The public contract should be designed around:

- customer-facing reads
- booking/session flows
- pricing previews
- safe public document/payment surfaces

Rule:

Public contracts should be customer-facing by design, not admin APIs exposed by
accident.

### 5. Public contracts should be typed and reusable

Voyant should continue exposing public/public surface contracts through shared
packages and typed runtime helpers.

That means:

- public route contracts in shared packages
- typed React/runtime helpers for public surface consumers
- no forced app-local wrappers when the shared contract already exists

Rule:

The shared public surface/public contract should be reusable and typed, not
starter-local glue.

### 6. Public channel context is server-derived

A public surface is the authenticated identity of one customer-facing frontend or
application. A Channel is the sales and distribution context that controls
assortment and commercial behavior. Those are separate identities:

- every active Public API resolves to exactly one active Channel
- a Channel may have zero or many Public surfaces
- an explicit Public API-to-Channel association is deployment-composed link data
- neither Public API nor Channel owns a cross-package foreign key to the other
- frontend route composition is never publication authority

Public runtime resolves Public API identity from the admitted Public API API key
or approved origin and then resolves its Channel. Public callers cannot select,
override, or probe Channel context by request parameter, header, body, or URL
shape. Admin callers may select a Channel only on authorized preview and
management surfaces.

**Direct is the default, and it is implicit.** `@voyant-travel/distribution`
provisions exactly one system Channel per deployment — `system_key = 'direct'`,
non-deletable, kind fixed, and left out of the counterparty list. A public surface
with no explicit binding resolves to it, and so does one whose bound Channel has
gone inactive: losing the Channel an operator chose is a reason to serve the
default, not a reason to take the public surface down. An explicit binding still
wins, which is what keeps `affiliate` / `reseller` / `api_partner` working.

This replaces the earlier fail-closed rule. Requiring an explicit binding meant
an operator had to hand-create a commercial counterparty representing
themselves, in a table carrying contracts and rate limits, before their own
website could read a departure — and nothing provisioned it, so every Public API
created after the one-shot backfill 403ed
([#4624](https://github.com/voyant-travel/voyant/issues/4624)). Public access is
still denied when no Public API resolves at all, and when the deployment has no
active Direct Channel — which now means a migration has not run, not that
someone forgot to configure something.

Rule:

Public Public API request context carries immutable server-derived Public API
and Channel identities. Public request input must never authorize Channel
selection.

### 7. Public context should stay explicit

Public contract behavior may depend on context such as:

- locale
- market
- channel
- customer/session identity when authenticated

That context should be explicit in the public contract and routing model instead
of hidden as starter-local behavior. Channel is explicit in the server-side
context object, but it is not caller-authored on public routes.

Rule:

Public API/public behavior should make locale/market/channel context explicit
when it affects the contract.

### 8. Publication gates the public commerce journey

Product listability, direct catalog and content reads, pricing, sellability,
booking-session creation, repricing, payment bootstrap, checkout finalization,
and channel push use the same Distribution publication policy for the resolved
Channel. Search projections are an optimization of that policy, not the only
enforcement point.

Identifier-based access to unpublished Products uses the ordinary public
not-found or unavailable response so the API does not disclose inaccessible
Products. Publication is necessary but not sufficient: lifecycle, availability,
pricing, allotment, policy, and sellability gates still apply independently. The
deprecated Product-level `visibility` and `activated` compatibility fields are
not sale or exposure authorities.

Rule:

Every public commerce boundary rechecks effective publication for the resolved
Public API Channel before returning customer-facing product, price,
availability, or booking state.

### 9. Mutable checkout sessions use scoped capabilities

Public catalog, availability, and pricing reads can stay anonymously readable
when the operator chooses to expose them. Booking/session checkout surfaces are
different: once a public flow creates a booking session, the booking id is only
an identifier and must not be treated as the bearer secret.

The public checkout/session model applies to an existing booking created
through the admitted Finance command:

- The authorized creation response supplies the short-lived checkout
  capability. Same-site public surfaces may also receive the HttpOnly
  `voyant_checkout_session` cookie from their host integration.
- PII-bearing session reads and all public session mutations require the
  capability, either via the cookie or the
  `X-Voyant-Checkout-Capability` header.
- The capability is scoped to one booking session, a narrow action set
  (`session:read`, `session:update`, `session:reprice`, `session:finalize`,
  `payment:read`, `payment:start`), and a short lifetime. Configure the signing
  secret with `VOYANT_CHECKOUT_CAPABILITY_SECRET`; it is independent from both
  auth-realm signing roots.
- Public finance booking payment options, payment-session reads, and
  payment-session creation require the same booking-scoped capability.
- Public payment-session creation derives currency and amount from the selected
  booking schedule, guarantee, or invoice. Public clients can choose the server
  target, provider, payer metadata, and return/cancel URLs; they cannot author
  arbitrary payable amounts on these routes.
- Public mutable session/payment routes accept `Idempotency-Key` so clients can
  safely retry creation, step updates, repricing, finalization, expiry, and
  payment bootstrap.

Rule:

Use the checkout capability for public booking-session secrets. Do not rely on
booking ids, payment-session ids, invoice ids, or URLs as bearer secrets for
customer checkout state.

## Frontend Layering

### 10. Keep the frontend split clear

Voyant already has distinct frontend layers that should remain separate:

- public/public surface contract packages
- shared React/runtime packages
- reusable module components shipped from the relevant `*-react` packages
- app/starter-owned final public surface shell

These are complementary layers, not competing strategies.

Rule:

Keep public contracts, module React packages, and final public surface apps as
distinct layers. Reusable module UI belongs in `*-react`; public surface owns final
page composition and deployment-specific presentation.

### 11. Preserve editable public surface composition

Voyant should keep final public surface presentation editable in the app/starter or
surface package. The retired registry/source-installed block approach is no
longer the target package model.

That gives teams editable public surface presentation while the framework still
owns:

- the public contract
- the runtime hooks/providers
- the core route semantics
- reusable module components from `*-react` packages where they are justified

Rule:

Editable public surface composition remains part of the public surface strategy and
should not be replaced with a closed turnkey frontend system.

## Template Ownership

### 12. Public API apps should remain starter-owned

The final public surface application should remain app/starter-owned.

That includes:

- brand expression
- final route composition
- page layout
- custom public UI flows

Voyant should own the contract and runtime surfaces beneath it, not the entire
frontend product.

Rule:

The final public surface UX is starter-owned even when the shared public contract
is framework-owned.

### 13. Shared public contracts should reduce app-local compatibility code

When a shared public/public surface contract exists upstream, downstream apps should
not need local wrappers just to consume it.

The purpose of the shared public surface surface is to reduce:

- app-local adapters
- duplicated public fetchers
- inconsistent payload shaping

Rule:

The public/public surface package surface should aim to remove local compatibility
layers, not create more of them.

## Practical Checklist

When adding or reviewing a public surface/public capability:

1. Decide whether it belongs in the shared public contract or only in an
   app/starter.
2. Keep the HTTP surface under `/v1/public/*`.
3. Keep `public surface` as the package/runtime term, not a nested HTTP namespace.
4. Shape the public payload around customer-facing needs, not admin CRUD.
5. Derive Channel from resolved Public API identity; never accept public
   caller-selected Channel authority.
6. Make market/locale/channel context explicit when it affects the contract.
7. Apply the shared publication guard before public catalog, pricing,
   sellability, booking-session, payment bootstrap, and checkout responses.
8. Require a scoped checkout capability for PII-bearing session reads,
   customer-entered state updates, repricing mutations, finalization, and
   payment bootstrap.
9. Keep payment amounts server-derived from booking/payment targets.
10. Keep the final public surface shell starter-owned.
11. Preserve editable public surface composition while using `-react` for runtime
   helpers and reusable module components.

## Non-Goals

This guide does not introduce:

- a closed turnkey public surface product
- a second HTTP namespace for `public surface`
- a replacement for editable app/starter-owned public surface presentation

The point is a clear shared public surface/public contract, not a more rigid
frontend platform.
