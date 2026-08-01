# Voyant Pay Architecture

> **Proposed provider direction:**
> [`remote-app-platform-rfc.md`](./remote-app-platform-rfc.md) classifies payment
> processors as deployment-selected payment adapters rather than installable
> apps. Netopia, Voyant Pay, and future processors implement one selected
> adapter port and conformance suite. Accounting integrations follow the remote
> OAuth app model instead. This document describes the current payment stack;
> its plugin terminology will migrate with that RFC.

This guide defines how Voyant should treat payments as a universal
infrastructure capability — shared across every vertical that takes money
from a customer (flights, owned products, accommodations, cruises / charters,
catalog-resold inventory, agency invoices).

The goal is simple:

- one canonical payment-processing model that every vertical reuses
- processor capabilities are declared, not assumed — UI gates on them
- a single `PaymentRequest` shape that any vertical can produce
- a single `PaymentStep` UI component that any vertical can render
- a single payment-link landing page that the customer sees regardless of
  what they're paying for
- vertical-specific orchestration (when, what schedule, what triggers
  payment) stays in the vertical; the payment mechanics stay universal

For the reasoning behind capability-gated steps and per-vertical reuse, see
[`extensibility-rubric.md`](./extensibility-rubric.md). For how this composes
with notifications + invoicing flows, see
[`notifications-architecture.md`](./notifications-architecture.md) and the
existing finance package conventions.

---

## Core Rules

### 1. One adapter contract for every payment processor

Every payment processor — Stripe, Adyen, Netopia, EuPlatesc, Mollie, manual
bank-transfer reconciliation — implements the same `PaymentProcessorAdapter`
interface and declares its capabilities up front.

Capability ids (mirror the `flight/...` namespace pattern):

```
payment/charge-saved-token   ← Stripe, Adyen        (one-click charge a stored token)
payment/payment-link         ← almost everyone      (generate a hosted payment URL)
payment/hosted-checkout      ← Stripe Checkout, Netopia redirect
payment/authorize-only       ← hotels (card hold without capture)
payment/capture              ← capture a previously-authorized hold
payment/bank-transfer        ← shows IBAN + reference, manual reconciliation
payment/refunds              ← full / partial refunds
payment/partial-capture      ← capture less than the authorized amount
payment/webhooks             ← processor sends payment-status callbacks
payment/recurring            ← subscriptions / scheduled charges (cruises balance)
```

Adapters that don't declare a capability either omit the corresponding
method or throw `CAPABILITY_NOT_SUPPORTED`. The orchestration layer reads
declared capabilities to route requests and to fail fast on unsupported
operations — same pattern as `FlightConnectorAdapter`.

Rule:

The contract stays additive. New capabilities go into the namespace; the
existing adapter interface only grows new optional methods, never breaking
ones.

### 2. One `PaymentRequest` shape, every vertical builds it

Every payment in the system flows through a single vertical-agnostic shape:

```ts
interface PaymentRequest {
  /** What is being paid for. Reference is opaque to the processor. */
  reference: {
    type:
      | "flight_order"
      | "booking"            // operator-owned product / catalog-resold booking
      | "accommodation_stay"  // accommodation booking line
      | "charter_booking"     // cruises / yacht charter
      | "invoice"             // standalone invoice (e.g. balance due)
      | "subscription"        // recurring (loyalty / membership)
    id: string
  }
  amount: Money
  description: string                 // "Booking #ABC123 — 2 pax, Paris hotel"
  lineItems?: PaymentLineItem[]       // surfaced on the landing page + receipts

  /** Who is paying — collected by the vertical before producing the request. */
  payer: {
    name: string
    email: string
    phone?: string
    billingAddress?: BillingAddress
    /** When the payer maps to a CRM person, link it for receipts + audit. */
    personId?: string
    organizationId?: string
  }

  /** Where to send the customer after the hosted checkout flow. */
  successUrl?: string
  cancelUrl?: string

  /** Echoed back on the webhook so the orchestrator knows what to update. */
  webhookContext?: Record<string, unknown>

  /** When the payment quote / link expires. */
  expiresAt?: string
  /** Soft deadline shown to the customer (distinct from hard expiry). */
  paymentDeadline?: string

  /** Currency override when different from the offer currency. */
  currency?: string
  /** Pre-tokenized payment method (e.g. a saved card) the caller wants to charge. */
  savedMethodToken?: string
  /** Capture mode. `authorize_only` for hotel guarantees. */
  captureMode?: "auto" | "authorize_only"
}
```

The contract layer ships this type. Verticals build it; processors consume
it. No vertical has its own payment-request shape. Adding a new vertical
means populating this interface — never extending the contract.

Rule:

If a vertical needs to pass extra data, route it via `webhookContext` (round-
tripped opaque) or via the vertical's own `reference` lookup at webhook
receive time. Do not bend `PaymentRequest` for vertical-specific fields.

### 3. One `PaymentStep` UI, capability-gated

`@voyant-travel/finance-react/checkout-ui` ships a single `<PaymentStep>` component that takes
a `PaymentRequest` and the active processor's `capabilities`. It renders
sections based on what the processor declares:

| Section | Visible when |
|---|---|
| Saved cards on file | `payment/charge-saved-token` declared AND person has saved methods |
| Charge new card now (inline / hosted) | `payment/charge-saved-token` OR `payment/hosted-checkout` |
| Send payment link | `payment/payment-link` declared (almost all processors) |
| Bank transfer (manual) | template declares this — always works |
| Hold seats — pay later | always (no processor needed) |
| Issue on agency credit | always (in-house decision) |

Every vertical that has a customer-facing checkout slots `<PaymentStep>`
into its own flow:

- flights → in the booking journey shell (already done, today bypasses the
  capability gate — Phase A fixes this)
- bookings → at checkout for owned products
- accommodations → at room checkout, with `authorize-only` mode for the
  guarantee
- cruises → at deposit + balance touchpoints
- catalog-resold → identical to bookings (different supplier-side flow,
  same customer-side payment)

Rule:

Verticals do not implement their own payment selectors. If a vertical
needs to render payment options, it imports `<PaymentStep>` from
`@voyant-travel/finance-react/checkout-ui` and feeds it a `PaymentRequest`. Branding /
notes / layout slots are exposed via render-prop slots.

### 4. One payment-link landing page

When the chosen flow is "send payment link", the customer lands on a
universal `/pay/:sessionId` page rendered by the
`<PaymentLinkLandingPage>` component from `@voyant-travel/finance-react/checkout-ui`.

It shows:

- order summary (line items from `PaymentRequest.lineItems`)
- total + due deadline
- tabs: **Pay by card** (processor hosted checkout) / **Bank transfer**
  (template-supplied IBAN block) / future tabs as plugins add capabilities
- branding slots (header logo, footer T&Cs link, customer-support contact)
  populated by the consuming template

The page is vertical-agnostic. A flight booking link, a hotel deposit
link, and a cruise balance link all use the same component — only the
order summary lines differ.

Rule:

Verticals do not host their own payment landing pages. The landing page is
universal; verticals contribute lines to the `PaymentRequest` and hook
into the `paid` webhook to update their order/folio/booking state.

### 5. Webhooks are universal but routing is per-vertical

Processor webhooks land on a single receiver in `@voyant-travel/finance-react/checkout-ui`
that:

1. Verifies the signature via the processor's `verifyWebhook` capability
2. Translates the processor-specific event into a canonical `PaymentEvent`
   (`payment.captured`, `payment.failed`, `payment.refunded`,
   `payment.authorized`, `payment.expired`)
3. Looks up the `PaymentSession` by id, reads its stored
   `webhookContext` + `reference`
4. Dispatches a typed event onto the core `EventBus` —
   `payment.{type}.received` — that verticals subscribe to

Each vertical owns its own subscriber:

```ts
// In flights:
eventBus.on("payment.captured.received", async (e) => {
  if (e.reference.type !== "flight_order") return
  await flightOrderService.markTicketed(e.reference.id, e)
})

// In accommodation resale:
eventBus.on("payment.authorized.received", async (e) => {
  if (e.reference.type !== "accommodation_stay") return
  await accommodationBookingService.recordGuarantee(e.reference.id, e)
})
```

Rule:

The webhook receiver does not know about flights, hotels, or cruises.
It translates + dispatches. Verticals subscribe to the canonical event
types and decide what to do.

### 6. Finance is the persistent record

Every payment session, capture, refund, and bank-transfer instruction
flows through `@voyant-travel/finance` for persistence. The payments package
holds runtime state (sessions, links, webhook events); finance holds the
durable record (payments, invoices, credit notes, supplier payments).

- payment session created → finance proforma invoice created
- payment captured → finance payment created, invoice marked paid
- payment refunded → finance credit note created
- partial capture → finance payment with partial amount, invoice partially
  reconciled

Rule:

The payments adapter doesn't write to finance directly. Webhook
subscribers in each vertical compose `paymentsService` + `financeService`
calls in the right order. This keeps finance authoritative on what was
actually paid + reconciled.

### 7. Demos come from three sources — never baked into shared code

The Voyant strategy for demos and testing has three sources, and only
three:

1. **Seeded data** — populate the DB with realistic example records
   (CRM people, payment methods on file, flight reference data). Lives
   in template seed scripts.
2. **Demo adapters / plugins** — full adapter implementations whose data
   happens to be synthesized, but go through the same contract + code
   paths as a production adapter. The demo flight adapter
   (`apps/operator/src/api/lib/flights-runtime.ts`) is the canonical
   example: the "demo" is in the data, not in the code path.
3. **Sandbox modes of real integrations** — Netopia sandbox, Stripe test
   keys, Mollie test mode. Real plugin, fake account.

Shared components (`@voyant-travel/finance-react/checkout-ui`, `@voyant-travel/flights-react/ui`,
`@voyant-travel/payments-react`) never carry "demo" defaults — no
`DEFAULT_CAPABILITIES`, no `DEMO_*` constants, no fallback that pretends a
processor declared capabilities it doesn't. When a prop isn't passed, the
component renders only what's universally available (`Hold seats — pay
later`, `Issue ticket on agency credit` — they don't need a processor).

The reason: switching a demo deployment to a real production deployment
should be a config change. Swap the plugin's keys from sandbox to live,
or swap the demo adapter for a real connector. No code path changes, no
removing demo branches, no surprises in production.

How to apply when adding a feature that needs sample data:

- Need example records? → seed
- Need an integration the real provider doesn't yet exist for? → write a
  demo adapter that implements the same interface
- Need to call a real provider during dev? → use its sandbox / test mode

If you find yourself writing `const DEMO_X = [...]` in a shared package
or `processorCapabilities ?? [everything]` as a fallback, that's the
signal to back out and route through one of the three sources above.

Rule:

The fallback in a shared component shows what's true without a plugin
(Hold + Credit for payments; "no data available" for catalogs). It never
invents capabilities the active plugin doesn't have. Templates wire real
plugins — sandbox mode is good enough for dev.

### 8. Payment schedules are vertical-specific orchestration

Recurring or multi-step payment flows (cruises deposit + balance, hotel
authorize-then-capture, subscription renewals) are composed by the
vertical, not by the payments package.

A cruise booking produces:

- one `PaymentRequest` for the deposit at booking time
- one `PaymentRequest` for the balance, scheduled N days before departure
  (handled by `@voyant-travel/finance` payment schedules and the selected
  notification reminder job)

Both go through the same `<PaymentStep>` (deposit at checkout) or
payment-link flow (balance emailed automatically). Neither requires
processor-specific code.

Rule:

The payments contract has no concept of "deposit" or "balance" or
"schedule". It sees individual `PaymentRequest`s. Compose them in the
vertical's booking service or in finance's payment schedules.

When a session linked to a booking payment schedule is completed,
`@voyant-travel/finance` emits `booking_payment_schedule.paid` after the
transaction commits. The event includes the booking id, schedule id,
schedule type, amount, currency, provider, and payment session id. Downstream
booking lifecycles can subscribe to that event to promote deposit-first
bookings from `on_hold` to `confirmed` without provider-specific webhook glue.
The generic `payment.completed` event also carries target metadata
(`targetType`, `targetId`, schedule id, guarantee id) for subscribers that
prefer one payment event stream.

---

## Package Layout

The Voyant Pay stack is **already built** — these are the actual
packages, not new ones to create:

```
packages/finance               ← state plus checkout orchestration: payment sessions, invoices, collection plans, paymentStarters seam, bank-transfer details
packages/finance-react         ← hooks and UI: usePublicPaymentSession, usePublicBookingPaymentOptions, <PaymentStep>, <PaymentLinkLandingPage>
packages/notifications         ← payment-link emails / SMS
voyant-travel/plugin-netopia   ← @voyant-travel/plugin-netopia — real Netopia integration with sandbox mode
packages/plugins/<future>      ← Stripe / Mollie / EuPlatesc plugins as needed
```

**There is no `@voyant-travel/payments` contract package and no
`@voyant-travel/payments-react` hooks package.** Earlier drafts proposed
both; they were rolled back when it became clear they duplicated
Finance / Finance React. The "contract" is the existing
Finance schemas plus the Finance checkout `paymentStarters` seam — that's the
canonical surface.

Plugin packages register themselves via Finance checkout's `paymentStarters`
record. Verticals depend on Finance React checkout UI for the components and on
Finance React hooks for the data — never on individual processor plugins.

Plugin selection happens at template-config time:

```ts
// apps/operator/voyant.config.ts
import { defineConfig } from "@voyant-travel/framework"

export default defineConfig({
  ...
  plugins: [
    "@voyant-travel/payment-stripe",
    // or "@voyant-travel/payment-netopia",
    // or both — orchestrator picks based on currency / region / customer
  ],
})
```

When multiple plugins are configured, a `PaymentRouter` chooses one per
`PaymentRequest` based on declared rules (currency match, region match,
customer preference). Defaults to first-declared.

---

## What Lives Where

| Concern | Lives in | Customizable |
|---|---|---|
| Payment sessions / payments / invoices state | `@voyant-travel/finance` | No — schema |
| Saved payment instruments (cards on file) | `@voyant-travel/finance` (`payment_instruments`) | No — schema |
| Collection plan + initiate flow | `@voyant-travel/finance/checkout` | Per-template policy options |
| `paymentStarters` registration | `@voyant-travel/finance/checkout` (DI seam) | Per-starter wiring |
| Bank-transfer details (IBAN block) | `@voyant-travel/finance/checkout` (`bankTransferDetails`) | Per-deployment |
| Real processor adapters | `packages/plugins/{processor}` (e.g. `plugin-netopia`) | No — adapter implementation |
| Public hooks (`usePublicPaymentSession`, `usePublicBookingPaymentOptions`) | `@voyant-travel/finance-react` | No — wraps finance routes |
| `<PaymentStep>` (capability-gated UI) | `@voyant-travel/finance-react/checkout-ui` | `extraOptions` slot per vertical |
| `<PaymentLinkLandingPage>` | `@voyant-travel/finance-react/checkout-ui` | Brand slots, IBAN block |
| Per-vertical wrappers (e.g. `FlightPaymentStep`) | per-vertical UI package | Maps `PaymentChoice` → vertical action |
| Email / SMS templates | `@voyant-travel/notifications` | Per-template overrides |
| Webhook routes (mounted) | template, plugin-supplied handler | One-line wiring |
| Plugin selection (Netopia / Stripe / …) | `voyant.config.ts` + plugin imports | Per-deployment |
| Branding / landing page polish | template `payments-portal` route | Per-deployment |
| Payment schedules (deposit + balance) | `@voyant-travel/finance` + `@voyant-travel/finance/checkout` | Per-vertical |

---

## How Each Vertical Plugs In

### Flights

The flight booking shell renders `<FlightPaymentStep>` (a thin wrapper
over `<PaymentStep>`). The wrapper translates the universal
`PaymentChoice` event into the flight contract's `PaymentIntent`, and
contributes the "Issue ticket on agency credit" extra option.

```ts
// In the booking journey shell:
<FlightPaymentStep
  value={paymentIntent}
  onChange={setPaymentIntent}
  savedMethods={mappedFromCrm}     // CRM person_payment_methods → SavedPaymentAccount
  capabilities={{
    chargeSavedCard: false,         // Netopia doesn't support saved tokens
    sendLink: true,                 // Netopia supports payment-link
    bankTransfer: true,             // template has bankTransferDetails configured
  }}
  onRequestPaymentLink={async () => {
    const session = await initiateCheckoutCollection({ bookingId, method: "send_link" })
    // notification email fires from checkout's pipeline
  }}
/>
```

Flight order persistence is currently in-memory in the demo adapter —
Phase B integrates flights into finance's `payment_sessions` so the
universal payment UI applies end-to-end.

### Accommodations

Two payment touchpoints — both use the same primitives:

- At booking: `<PaymentStep>` with `captureMode: "authorize_only"` (the
  card hold). Processor must declare `payment/authorize-only`. If it
  doesn't, the UI hides "card hold" and falls back to deposit / full prepay.
- At checkout: `<PaymentStep>` with `captureMode: "auto"` to capture room
  charges + incidentals.

Accommodation guarantee terms map onto capability calls:
- `card_hold` → `payment/authorize-only`
- `deposit` → standard charge
- `full_prepay` → standard charge
- `on_request` → no payment touched at booking

### Cruises / Charters

Big tickets, deposit + balance. Composed via `@voyant-travel/finance`
payment schedules:

- Booking creates two scheduled payments — deposit (e.g. 25%) due now, balance due 60 days before departure.
- At booking time, `<PaymentStep>` is rendered for the deposit only.
- A workflow + scheduler fires on the balance due date, creates a payment
  link, sends an email via notifications.
- Customer clicks → universal `<PaymentLinkLandingPage>` → pays.

Webhook subscriber in cruises marks the booking confirmed when both
payments complete.

### Owned Products (bookings)

Identical to flights — at checkout, build a `PaymentRequest` from the
booking, render `<PaymentStep>`. Webhook subscriber in bookings marks the
booking confirmed.

### Catalog (resold)

Customer-facing payment is **identical** to owned products. The
supplier-payment side (operator pays the supplier on their own terms) is
`supplier_payments` in finance — completely separate flow, doesn't even
touch this layer.

### Agency Invoices (standalone)

When finance generates an ad-hoc invoice not tied to a booking (consultancy
fee, change fee, late fee), the same payment-link flow applies: invoice
becomes a `PaymentRequest` with `reference: { type: "invoice" }`.

---

## Phased Rollout

Most of the stack already exists (`finance` + `checkout` + `plugin-netopia`
+ `notifications` + `finance-react`). The remaining work is to surface
it through a shared UI and adopt it in each vertical's checkout flow.

### Phase A — Capability-gate the existing flight payment step ✅

Smallest change. `FlightPaymentStep` learns to read a
`PaymentStepCapabilities` boolean record (`chargeSavedCard`, `newCard`,
`sendLink`, `bankTransfer`) and gates sections accordingly. When no
capabilities are passed, only Hold + Issue-on-credit render — honest
about what's actually wired. No invented capability ids in shared code.

Scope:
- ✅ `PaymentStep` (universal) in `@voyant-travel/finance-react/checkout-ui` with `PaymentChoice`
  events + capability-gated sections
- ✅ `FlightPaymentStep` is now a thin wrapper over `PaymentStep`,
  translating `PaymentChoice` ↔ flight `PaymentIntent`, contributing the
  flight-specific "Issue on agency credit" extra option
- ✅ Operator booking page passes nothing for capabilities (only Hold +
  Credit shows) until Phase B wires the existing checkout integration

### Phase B — Wire `@voyant-travel/finance/checkout` into the flight booking flow

Currently flights have their own in-memory order store
(`apps/operator/src/api/lib/flights-runtime.ts`). To use the real
payments stack, the flight order needs a corresponding `payment_session`
in `@voyant-travel/finance` so `<PaymentStep>` and `<PaymentLinkLandingPage>`
can read its state.

Scope:
- Decision: either (a) flights become their own `payment_session_target_type`
  (e.g. `flight_order`) — most direct, or (b) flight orders are created
  as generic `bookings` first, then existing checkout flows apply.
  Recommend (a) — flights have enough vertical-specific shape to deserve
  their own target type.
- Add `flight_order` to the `payment_session_target_type` enum
- Operator starter wires Finance checkout's `paymentStarters` from the
  configured plugin (Phase C deliverable)
- Booking page builds `PaymentStepCapabilities` from
  `paymentStarters` registration + `bankTransferDetails` configuration,
  passes them to the shell
- `onRequestPaymentLink` calls `useInitiateCheckoutCollection` (or the
  flight equivalent) → finance creates the session → notification fires

### Phase C — Wire the existing `@voyant-travel/plugin-netopia`

The Netopia plugin already exists with full sandbox support. The work
here is integration:

Scope:
- Operator starter imports `createNetopiaFinanceExtension()` from
  `@voyant-travel/plugin-netopia` and mounts it
- `voyant.config.ts` declares the plugin (or direct import for now)
- Sandbox creds via env (`NETOPIA_URL`, `NETOPIA_API_KEY`,
  `NETOPIA_POS_SIGNATURE`, `NETOPIA_NOTIFY_URL`, `NETOPIA_REDIRECT_URL`)
- Flight booking page detects the plugin is registered and sets
  `paymentCapabilities.sendLink = true`, `bankTransfer = true` (when
  bank-transfer details are configured)
- The Netopia callback route — already mounted by the plugin — updates
  the `payment_session` finance state. Vertical subscribers (flights /
  bookings / etc.) listen for the corresponding event and update their
  own state.

### Phase D — Customer payment-link landing page

`<PaymentLinkLandingPage>` is already in `@voyant-travel/finance-react/checkout-ui` (Phase A
shipped the skeleton). Mount it at `/pay/:sessionId` in the operator
template. Customer lands, reads the session via `usePublicPaymentSession`,
clicks Pay-by-card → redirects to Netopia hosted checkout, or reads the
IBAN block for bank transfer.

Scope:
- Public route `/pay/:sessionId` in operator starter (no auth)
- Page reads session via `usePublicPaymentSession` from finance-react
- Bank-transfer instructions sourced from template's
  `bankTransferDetails` config
- Branding slots populated by template

### Phase E — Second vertical adopts the same UI

Pick accommodation resale guarantee collection or owned-product bookings
(simplest). Build the accommodation payment flow using `<PaymentStep>` against
the same checkout endpoints. If anything about `PaymentChoice` /
`PaymentStepCapabilities` has to bend, fix it now while there are only two
consumers.

Scope:
- Accommodations (or bookings) checkout flow imports `<PaymentStep>` from
  `@voyant-travel/finance-react/checkout-ui`, builds capabilities from configured wiring
- Vertical-specific "extras" via `extraOptions` (e.g. "Charge to folio")
- Validates the abstraction against a real second usage

---

## Anti-Patterns

**Do not** build a parallel payments contract package. The canonical
contract IS finance + checkout + `paymentStarters` — they already work
and are battle-tested. Earlier drafts of this doc proposed a separate
`@voyant-travel/payments` package; it was rolled back when the duplication
became obvious. If you find yourself defining `PaymentSession` /
`PaymentEvent` / `PaymentProcessorAdapter` types again, stop and use
finance's instead.

**Do not** let verticals reach into processor plugins directly. Verticals
talk to `<PaymentStep>` and to checkout's hooks (via finance-react). The
plugin registers via `paymentStarters` — the vertical never sees it.

**Do not** store processor-specific tokens / sessions / metadata on
vertical schemas. The CRM `person_payment_methods` table holds tokens
(canonical record of "what cards does this person have on file");
per-payment metadata belongs on `payment_sessions` in finance.

**Do not** invent capability strings in shared UI components. The
`<PaymentStep>` takes a boolean record (`PaymentStepCapabilities`) the
parent fills in honestly from what's wired (configured `paymentStarter`,
`bankTransferDetails` registered, saved methods present). No magical
"capability declared" dance.

**Do not** map vertical-specific options into the `PaymentChoice` core
union. Use `extraOptions` + the `{ type: "extra", optionId }` event for
options like "Issue on agency credit" (flights) or "Charge to folio"
(accommodations).

---

## Reference

- `@voyant-travel/finance` — `payment_sessions`, `payment_instruments`,
  `payments`, invoices, schedules. Authoritative state.
- `@voyant-travel/finance-react` — public hooks (`usePublicPaymentSession`,
  `usePublicBookingPaymentOptions`, etc.). Single source of truth for the
  data the UI consumes.
- `@voyant-travel/finance/checkout` — orchestration layer. Collection plans,
  `paymentStarters` registration, `bankTransferDetails` resolver,
  notification dispatch.
- `@voyant-travel/plugin-netopia` — real Netopia integration with sandbox
  mode. Registers as a `paymentStarter`. Existing finance extension
  mounts the callback route.
- `@voyant-travel/notifications` — payment-link emails / SMS.
- `@voyant-travel/finance-react/checkout-ui` — `<PaymentStep>` + `<PaymentLinkLandingPage>`,
  pure UI on top of the above.
- `@voyant-travel/relationships` `person_payment_methods` table — canonical record of
  cards on file per person (tokenized).
- Accommodation resale guarantee terms map onto payment-step booleans in the
  checkout flow. Legacy hotel-ops guarantee-mode references should not be
  extended into hotel-operations flows.
