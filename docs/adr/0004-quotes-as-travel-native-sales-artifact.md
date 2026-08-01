# ADR-0004: Quotes are the travel-native sales artifact

- **Status:** Superseded by [ADR-0018](./0018-proposals-as-travel-native-bespoke-sales-artifact.md) (2026-08-01)
- **Relates to:** [#1541](https://github.com/voyant-travel/voyant/issues/1541), [AI travel experience composition](../architecture/ai-travel-experience-composition.md), [trips implementation plan](../architecture/trips-implementation-plan.md), [ADR-0005](./0005-retire-transactions-runtime.md)
- **Builds on:** [ADR-0001](./0001-tenant-scoping.md) (deployment = tenancy boundary), [ADR-0002](./0002-contract-packages.md) (contract/runtime package split)

## Context

Voyant currently has several overlapping "priced proposal" concepts:

- CRM **Opportunity** tracks the sales pursuit: pipeline, stage, owner, value,
  person/organization, participants, products, and activities.
- CRM **Quote** is a thin informational proposal attached to an Opportunity.
- Transactions **Offer** is a richer priced proposal that can convert to an
  Order.
- The trips **Trip / Package Envelope** carries itinerary content,
  travelers, manual services, component pricing, and reserve/checkout flow, but
  it is a live working object rather than a frozen proposal artifact.

That language is backward for bespoke travel work. Travel consultants build and
track quotes. A quote is not just an informational price estimate; it is the
tracked pursuit, the sendable proposal, and the artifact the client accepts or
declines. The trips already has the itinerary and reserve workflow;
the missing piece is a versioned proposal that freezes the Trip content the
client saw.

The previous ubiquitous language said:

- Opportunity = the tracked sales deal.
- Quote = informational, not transactable.
- Offer = the transactable equivalent.
- The composition ladder was Quote -> Offer -> Order -> Booking -> Fulfillment,
  with `PackageOffer` left open as a future proposal artifact.

This ADR deliberately reverses that vocabulary for travel-native sales.

## Decision

**A Quote is the travel-native sales artifact.** It is the tracked pursuit that
moves through a pipeline, owns sales activity, and carries one or more
versioned proposal candidates. The generic CRM term **Opportunity** is retired
from the supported domain language.

**A Quote Version is the immutable proposal revision or alternative sent to the
client.** It freezes the relevant Trip / Package Envelope snapshot, including
components, manual services, travelers, pricing, currency, validity, and
proposal metadata. Editing a sent proposal mints a new Quote Version; it never
mutates the already-sent version.

Acceptance is whole-version for v1:

1. The client accepts exactly one Quote Version.
2. The accepted Version is recorded on the Quote.
3. Other open Versions on the same Quote are declined or superseded.
4. The Quote closes won.
5. The accepted Version seeds the composer reserve workflow.

Acceptance is not the same as confirmed fulfillment. Live catalog-backed lines
must be repriced and rechecked. Manual placeholders keep their quoted price but
move into staff supplier-confirmation work. The reserve workflow materializes
component Bookings and/or Orders under the Trip / Package Envelope and surfaces
pending supplier confirmation instead of pretending every component is secured.

Transactions **Offer** is not retired by this decision. It remains the
transactions package primitive for existing offer-to-order flows,
`orders.offerId`, and `order_terms`. It is no longer the name of the bespoke
travel sales artifact that staff agents build and clients accept. Any
retirement, rewrite, or repurposing of transactions Offer requires a separate
ADR.

Follow-up: [ADR-0005](./0005-retire-transactions-runtime.md) accepts that
retirement for v1.

## Consequences

### Positive

- The staff-facing language matches travel agency practice: agents track
  Quotes, send Quote Versions, and win or lose the Quote.
- The proposal artifact reuses the trips instead of inventing a
  parallel line model. A Version freezes a Trip snapshot rather than copying
  every itinerary concept into CRM.
- Revisions and alternatives share one primitive: a candidate Quote Version.
  A `supersedes` link models revisions; labels model side-by-side options.
- The acceptance workflow stays honest about travel operations. Accepted means
  "the client chose this Version"; confirmed means "the component suppliers and
  inventory commitments are secured."

### Negative

- This is a repository-wide vocabulary break. Code, contracts, routes, hooks,
  UI labels, links, and generated schema artifacts that currently say
  Opportunity must be renamed in planned slices.
- The term Quote becomes broader than the thin CRM table that exists today.
  Reviewers must watch for accidental half-renames where a Quote still means
  only an informational line list.
- The old Quote/Offer disambiguation is invalid. Documentation and future code
  must be explicit when talking about the transactions Offer primitive.

### Scope boundaries

This ADR decides language and target architecture. It does not perform the
schema rename by itself.

The implementation order is:

1. Rename CRM Opportunity to Quote.
2. Repurpose the existing thin CRM quotes table as Quote Versions.
3. Add Quote Version status, validity, sent/viewed/decided timestamps, labels,
   supersession, and Trip snapshot reference.
4. Update CRM contracts and backend routes.
5. Follow with client, UI, cross-package reference-grain cleanup, template
   migrations, Trip snapshot freezing, send/view/accept lifecycle, and
   accept-to-reserve wiring.

Migrations remain starter-owned. The package schema changes are exported by
the package; `starters/operator` (and, before its deletion, `templates/dmc`) owns migration generation
and application.

## Alternatives considered

### Alternative A: Keep Opportunity and add a new Quotes module

Rejected. It would create another sales artifact while leaving the existing
Opportunity/Quote/Offer/Trip overlap in place. The repository already has the
sales tracker and the trips; the missing concept is versioning and
freezing, not another module boundary.

### Alternative B: Keep Quote informational and use transactions Offer for custom travel

Rejected. Transactions Offer is useful, but it is not the shape staff agents
use to assemble bespoke itineraries with manual placeholders and component
reserve workflows. Forcing custom travel through Offer would duplicate Trip
component structure and keep staff vocabulary misaligned.

### Alternative C: Introduce `PackageOffer`

Rejected for now. `PackageOffer` named the right gap, but it adds a fourth
commercial proposal primitive. The same gap is better filled by Quote Version:
the CRM pursuit stays Quote, the proposal candidate is a Version, and the
Version freezes a Trip snapshot.

### Alternative D: Treat "Quote" as a UI label over Opportunity

Rejected. A UI-only label would leave public package APIs, routes, contracts,
and schema terms using Opportunity. That preserves the wrong ubiquitous
language and makes every integration translate the same concept twice.

## How to apply this decision

Use **Quote** for the tracked travel sales pursuit. Do not introduce new
Opportunity symbols, routes, contracts, or public exports.

Use **Quote Version** for a sent or sendable proposal candidate. A Version may
be a revision or an alternative, but it is immutable once sent.

Use **Transactions Offer** only when referring to the existing transactions
package primitive. Do not use Offer as the name of a staff-composed bespoke
travel proposal.

When a client accepts a Quote Version, route the outcome through the composer
reserve workflow. Do not silently create a confirmed Booking for manual or
unverified live components.
