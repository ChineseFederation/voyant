# @voyant-travel/proposals-contracts

## 0.111.0

### Minor Changes

- ee1092f: Route legacy inquiry intake through the canonical Inquiry aggregate, retain read-compatible Booking inquiry projections, add a resumable provenance-preserving legacy cutover job, and retire the duplicated Proposals checkout-inquiry runtime surface.

  See the [Proposals checkout-inquiry migration note](../docs/migrations/removed-proposals-checkout-inquiry.md) for removed exports and replacement paths.

### Patch Changes

- 3ad167f: Add the typed, replay-safe Proposal conversion provider for first-class Inquiries.

## 0.110.0

### Minor Changes

- 8413c21: Close three gaps between what a Proposal says and what it can do.

  A version with no frozen Trip snapshot could be sent but never accepted — the public accept route answered 409 for the life of the proposal, and neither the operator nor the customer was told. The public payload now carries `acceptance: { available, reason }` mirroring the two gates acceptance actually applies, the customer page withholds the Accept control rather than explaining a 409 afterwards, and the admin send response carries a `snapshot_required` warning surfaced to the operator who is the only party who can fix it. Sending a line-item proposal for review is still allowed.

  Public decline read no body and dropped the customer's explanation, while its sibling request-edits kept it. Decline now takes the same optional `message` and routes it through `recordPublicProposalFeedback`, filed as a decline rather than an edit request (`proposal.proposal_feedback.declined`) and returned as `feedbackId`.

  Payment terms existed only operator-wide, so a negotiated deposit could not be attached to the deal it belonged to. `proposal_versions.payment_terms` holds finance's `PaymentPolicy` per version, editable while draft and frozen once sent, stated on the public payload as amounts against that version's total. Finance's cascade gains a `proposal` layer between the booking-level override and the catalog layers, resolved from `booking_origins` so an accepted proposal's booking is billed on the terms the customer agreed to instead of the operator default. Deployments without the proposals module are unaffected — the layer is an optional runtime port and costs no extra read when unwired.

## 0.109.0

### Minor Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

## 0.108.3

### Patch Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.

## 0.108.2

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.

## 0.108.1

### Patch Changes

- 790a18d: Keep quote version PATCH payloads sparse so omitted status does not trigger lifecycle-only status guards.

## 0.108.0

### Minor Changes

- a74471e: Quotes admin surface. A pipeline board (`/quotes`) plus a full quote workspace (`/quotes/$id`): editable deal fields, client (person and/or organization — B2C/B2B), travelers with an explicit PAX count, line items, tags, owner, the activity timeline, and the quote's versions nested inline. The quote value is derived from its line items and recomputed server-side on every change. Saving snapshots the current line items into a new proposal version that supersedes the prior one (one current version at a time); versions show a sequential number, Active/Expired status, and an editable valid-until on the active version. Adds `quotes.paxCount` plus `createdBy`/`updatedBy` audit fields (stamped from the acting user), an owner picker sourced from team members (falling back to the current user), and the `nav.quotes` operator label. The detail is a staged editor (edit freely; Save commits everything + snapshots a proposal version), with a quote description and images shown on the client proposal, and a "Send to client" action that surfaces the shareable proposal link (re-copying resolves the deployment's public proposal URL, not the admin origin). Products-based versions can be sent for review without a Trip snapshot; since acceptance reserves a frozen Trip, the public proposal exposes an `acceptable` flag and hides Accept (keeping Decline) for product-only proposals so clients never hit a guaranteed 409. All new copy is in en + ro.

## 0.107.0

### Minor Changes

- c8189fc: Split the legacy `@voyant-travel/crm-contracts` package into
  `@voyant-travel/relationships-contracts` and
  `@voyant-travel/quotes-contracts`. Runtime packages and public validation
  imports now depend on the domain-specific contract packages.
