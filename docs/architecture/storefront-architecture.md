# Voyant Storefront And Public Contract Architecture

This guide defines how Voyant should treat the customer-facing storefront and
the broader public API surface.

The goal is simple:

- keep `storefront` as the customer-facing product/runtime concept
- keep `/v1/public/*` as the external-facing HTTP boundary
- separate public contracts from admin CRUD semantics
- keep the final storefront application starter-owned while the shared public
  contract remains framework-owned

Storefront should be a first-class framework surface, not just a set of public
routes.

## Core Rules

### 1. Keep `storefront` as the customer-facing package concept

In Voyant, `storefront` should remain the product/runtime term for the
customer-facing discovery and booking experience.

That includes things like:

- catalog browsing
- departure detail
- pricing preview
- booking-session flows
- customer-facing extensions and itinerary reads

Rule:

Use `storefront` as the package/runtime concept for the customer-facing
experience.

### 2. Keep `/v1/public/*` as the HTTP umbrella

The HTTP transport boundary should stay:

- `/v1/admin/*` for staff/operator surfaces
- `/v1/public/*` for external-facing surfaces

`storefront` should not become a second nested HTTP namespace like
`/v1/public/storefront/*` by default.

Rule:

Keep `public` as the HTTP boundary and `storefront` as the product/runtime
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

Voyant should continue exposing public/storefront contracts through shared
packages and typed runtime helpers.

That means:

- public route contracts in shared packages
- typed React/runtime helpers for storefront consumers
- no forced app-local wrappers when the shared contract already exists

Rule:

The shared storefront/public contract should be reusable and typed, not
starter-local glue.

### 6. Public context should stay explicit

Public contract behavior may depend on context such as:

- locale
- market
- channel
- customer/session identity when authenticated

That context should be explicit in the public contract and routing model instead
of hidden as starter-local behavior.

Rule:

Storefront/public behavior should make locale/market/channel context explicit
when it affects the contract.

### 7. Mutable checkout sessions use scoped capabilities

Public catalog, availability, and pricing reads can stay anonymously readable
when the operator chooses to expose them. Booking/session checkout surfaces are
different: once a public flow creates a booking session, the booking id is only
an identifier and must not be treated as the bearer secret.

The public checkout/session model applies to an existing booking created
through the admitted Finance command:

- The authorized creation response supplies the short-lived checkout
  capability. Same-site storefronts may also receive the HttpOnly
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

### 8. Keep the frontend split clear

Voyant already has distinct frontend layers that should remain separate:

- public/storefront contract packages
- shared React/runtime packages
- reusable module components shipped from the relevant `*-react` packages
- app/starter-owned final storefront shell

These are complementary layers, not competing strategies.

Rule:

Keep public contracts, module React packages, and final storefront apps as
distinct layers. Reusable module UI belongs in `*-react`; storefront owns final
page composition and deployment-specific presentation.

### 9. Preserve editable storefront composition

Voyant should keep final storefront presentation editable in the app/starter or
surface package. The retired registry/source-installed block approach is no
longer the target package model.

That gives teams editable storefront presentation while the framework still
owns:

- the public contract
- the runtime hooks/providers
- the core route semantics
- reusable module components from `*-react` packages where they are justified

Rule:

Editable storefront composition remains part of the storefront strategy and
should not be replaced with a closed turnkey frontend system.

## Template Ownership

### 10. Storefront apps should remain starter-owned

The final storefront application should remain app/starter-owned.

That includes:

- brand expression
- final route composition
- page layout
- custom public UI flows

Voyant should own the contract and runtime surfaces beneath it, not the entire
frontend product.

Rule:

The final storefront UX is starter-owned even when the shared public contract
is framework-owned.

### 11. Shared public contracts should reduce app-local compatibility code

When a shared public/storefront contract exists upstream, downstream apps should
not need local wrappers just to consume it.

The purpose of the shared storefront surface is to reduce:

- app-local adapters
- duplicated public fetchers
- inconsistent payload shaping

Rule:

The public/storefront package surface should aim to remove local compatibility
layers, not create more of them.

## Practical Checklist

When adding or reviewing a storefront/public capability:

1. Decide whether it belongs in the shared public contract or only in an
   app/starter.
2. Keep the HTTP surface under `/v1/public/*`.
3. Keep `storefront` as the package/runtime term, not a nested HTTP namespace.
4. Shape the public payload around customer-facing needs, not admin CRUD.
5. Make market/locale/channel context explicit when it affects the contract.
6. Require a scoped checkout capability for PII-bearing session reads,
   customer-entered state updates, repricing mutations, finalization, and
   payment bootstrap.
7. Keep payment amounts server-derived from booking/payment targets.
8. Keep the final storefront shell starter-owned.
9. Preserve editable storefront composition while using `-react` for runtime
   helpers and reusable module components.

## Non-Goals

This guide does not introduce:

- a closed turnkey storefront product
- a second HTTP namespace for `storefront`
- a replacement for editable app/starter-owned storefront presentation

The point is a clear shared storefront/public contract, not a more rigid
frontend platform.
