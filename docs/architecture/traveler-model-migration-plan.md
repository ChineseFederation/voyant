# Voyant Traveler Model Migration Plan

> Note (2026-06): `templates/dmc`, `apps/dev`, and the shadcn registry (`apps/registry` + `packages/ui/registry`) have since been deleted per the packaged-admin RFC (§5); path references to them below are historical.

This document defines the concrete migration plan for making `traveler` the
canonical travel-commerce term across Voyant.

The goal is not a cosmetic rename. The goal is to end with:

- one canonical term for travel-commerce person records: `traveler`
- explicit separation between CRM `Person`, booking/transaction `Traveler`, and
  booking-level contact semantics
- `passenger` used only in transport-specific operational contexts
- `participant` retained only in non-travel generic modules where it is
  semantically correct
- bookings, offers, and orders aligned to one domain model that fits Voyant's
  own standards work and the adjacent standards it builds on

This plan assumes:

- the repo is not yet in production
- internal churn is acceptable if it removes long-term naming and model debt
- repo-wide consistency matters more than preserving temporary compatibility
- standards alignment should be explicit and defensible

## Decision

Adopt `traveler` as the canonical term for travel-commerce records in:

- bookings
- booking sessions
- booking requirements
- customer portal
- notifications
- storefront
- sellability
- transactions
- OCTO-facing booking/order projections

Do not use `traveller`.

Reasoning:

- the repo already predominantly uses `traveler`
- mixing spellings would create a long tail of type and API noise
- one canonical spelling matters more than locale preference inside code

## Naming Standard

### Canonical terms

- `person`: CRM or identity master record
- `traveler`: a person traveling on a booking, offer, or order
- `bookingContact`: the booking's commercial or operational contact
- `traveler assignment`: a traveler's link to an item, fulfillment, or document

### Reserved contextual terms

- `passenger`: transport-specific operational contexts only
- `participant`: generic non-travel participation only

### Where `passenger` remains correct

- ground dispatch passenger manifests
- future air modules
- external supplier/provider contracts that explicitly use `passenger`
- transport inventory, manifests, and seat/ride operations

### Where `participant` remains correct

- CRM activities
- CRM Proposals
- external APIs or standards that explicitly use `participant` outside the
  traveler domain

## Standards Alignment

The target terminology is consistent with the current standards direction.

OpenTravel distinguishes:

- `Person`
- `PrimaryTraveler`
- `AdditionalTraveler`
- relationship semantics between travelers

See:

- [`/Users/mihai/builds/internal/voyant-all/docs/data-model-standard.md`](/Users/mihai/builds/internal/voyant-all/docs/data-model-standard.md:404)
- [`/Users/mihai/builds/internal/voyant-all/docs/open-travel/OpenTravel_2019A_ObjectSuite_Services/schemas/Common_5_0_0.xsd`](/Users/mihai/builds/internal/voyant-all/docs/open-travel/OpenTravel_2019A_ObjectSuite_Services/schemas/Common_5_0_0.xsd:6064)

OCTO-facing integration also requires:

- a primary contact choice
- linked person-to-item identities

See:

- [`/Users/mihai/builds/internal/voyant-all/docs/octo-adapter-contract.md`](/Users/mihai/builds/internal/voyant-all/docs/octo-adapter-contract.md:217)

Important implication:

Voyant should not use `participant` as a permanent umbrella term inside travel
commerce if the real concepts are:

- traveler
- booking contact
- staff assignment
- traveler-to-item assignment

## Current State Summary

The repo is currently mixed:

- public booking surfaces are mostly traveler-first
- legacy aliases still expose `passenger` and `participant`
- internal booking rows still use `booking_participants`
- transaction rows still use `offer_participants` and `order_participants`
- several services still use `participantType` as a real discriminator

The model currently allows:

- `traveler`
- `booker`
- `contact`
- `occupant`
- `staff`
- `other`

That means the current `participant` model is not just naming debt. It is also
carrying real domain behavior that must be split before the final rename is
honest.

## Target End State

### Bookings

Bookings should own:

- booking identity
- lifecycle
- traveler records
- traveler assignments to booking items
- traveler-scoped documents and fulfillments
- explicit booking contact snapshot or booking contact record

Bookings should not use one row type to mean all of:

- traveler
- booker
- contact
- staff

### Transactions

Offers and orders should mirror the same shape:

- travelers
- traveler assignments
- explicit commercial/contact identity

Transactions should not remain on a structurally different person model if
bookings have already standardized on travelers.

### Contact semantics

`booker` and `contact` should become explicit contact semantics, not traveler
row discriminator values.

Recommended target:

- `bookingContact` for bookings
- `offerContact` or shared transaction contact snapshot for offers/orders

### Staff semantics

`staff` should become an explicit internal assignment concept rather than a
traveler-row role.

### Occupant semantics

`occupant` must be decided explicitly:

- if it is a traveler subtype, keep it as traveler modeling
- if it only matters when assigning travelers to items, move it to assignment
  role semantics

Default recommendation:

- keep traveler rows canonical
- keep `occupant` as an assignment role unless a non-item traveler subtype is
  truly needed

## Migration Strategy

Use a **split first, rename second** strategy.

That means:

1. remove legacy aliases that are clearly dead
2. introduce explicit contact/staff concepts where `participantType` is doing
   hidden work
3. migrate traveler-owned rows and APIs to traveler naming
4. migrate transactions to the same model
5. clean up remaining docs, tests, generated registries, and templates

Do not start with blind search-and-replace.

## Phase 1: Freeze the Standard in Docs and Naming

Goal:

- define `traveler` as the canonical term
- document where `passenger` and `participant` remain valid
- align architecture docs before implementation churn spreads

### Changes

- update standards docs to use `traveler` as the canonical travel-commerce term
- change references that currently imply `participant` should remain the
  long-term booking model
- add guidance that `passenger` is transport-specific only

### Primary doc files

- `docs/architecture/traveler-model-migration-plan.md`
- `/Users/mihai/builds/internal/voyant-all/docs/data-model-standard.md`
- `/Users/mihai/builds/internal/voyant-all/docs/octo-adapter-contract.md`
- `/Users/mihai/builds/internal/voyant-all/docs/octo-alignment-plan.md`
- `docs/architecture/platform-surface-roadmap.md`

### Acceptance criteria

- there is one documented naming standard
- all new work can reference one canonical term
- no architecture doc still recommends `participant` as the desired booking
  person model

## Phase 2: Remove Legacy Surface Aliases

Goal:

- remove names that are already acknowledged as legacy
- shrink the public surface before deeper schema changes

### Remove

- booking `passengers` routes, hooks, schemas, and registry aliases
- booking `participants` compatibility routes where they only mirror traveler
  APIs
- session payload fallbacks that accept `participants` alongside `travelers`
- component aliases like `passenger-list` and `passenger-dialog`

### Primary package scope

- `packages/bookings`
- `packages/bookings-react`
- `packages/ui`
- `apps/registry`
- `apps/dev`
- `apps/operator`
- `templates/dmc`

### High-signal file groups

- `packages/bookings/src/routes.ts`
- `packages/bookings/src/routes-groups.ts`
- `packages/bookings/src/service.ts`
- `packages/bookings/src/service-public.ts`
- `packages/bookings/src/validation.ts`
- `packages/bookings/src/validation-public.ts`
- `packages/bookings-react/src/hooks/use-passengers.ts`
- `packages/bookings-react/src/hooks/use-passenger-mutation.ts`
- `packages/bookings-react/src/query-keys.ts`
- `packages/ui/registry/bookings/passenger-*.tsx`
- `apps/registry/public/r/voyant-bookings-passenger-*.json`

### Acceptance criteria

- no booking route exposes `/passengers`
- no booking route exposes `/participants` as a traveler alias
- public booking session input is `travelers` only
- traveler components/hooks no longer export passenger aliases

## Phase 3: Introduce Explicit Booking Contact Modeling

Goal:

- remove `booker` and `contact` from traveler-row semantics
- preserve the real business behavior currently hidden in `participantType`

### Why this phase is required

Current contact selection logic depends on traveler-participant role values in:

- `packages/notifications/src/service-shared.ts`

Current billing-contact behavior already suggests a proper booking-contact
direction in:

- `packages/customer-portal/src/service-public.ts`

### Recommended target

Add one explicit booking contact model:

- either booking-level snapshot columns
- or a `booking_contacts` table

Required fields:

- `firstName`
- `lastName`
- `email`
- `phone`
- address fields needed by billing and legal documents
- optional CRM linkage where appropriate
- source metadata where relevant

### Migrate dependents

- `packages/customer-portal`
- `packages/notifications`
- any booking document or finance context builders

### Acceptance criteria

- notifications recipient preference no longer depends on `booker`/`contact`
  traveler roles
- booking billing contact resolves from an explicit booking contact source

## Phase 4: Remove Staff From Traveler Rows

Goal:

- stop using traveler records to represent internal staff assignments

### Why this phase is required

Current code still treats `staff` as a valid traveler-participant type in:

- `packages/sellability`
- `packages/customer-portal`
- related validation and transaction flow code

### Recommended target

Create explicit staff assignment semantics:

- booking-level internal assignee if needed
- item-level service assignee if needed

Do not model staff as a traveler row.

### Acceptance criteria

- customer-portal traveler import no longer needs to filter `staff`
- sellability item-assignment logic no longer accepts `staff` as a traveler
  type
- booking traveler validation no longer includes `staff`

## Phase 5: Collapse Booking Core From Participant to Traveler

Goal:

- make booking storage and service naming match the real domain

### Schema migration targets

- `booking_participants` -> `booking_travelers`
- `booking_item_participants` -> `booking_item_travelers`
- `booking_participant_travel_details` -> `booking_traveler_details`
- `participant_id` -> `traveler_id` in booking-owned traveler references
- `booking_participant_type` enum removed or reduced to traveler-only semantics

### Code migration targets

- `bookingParticipants` -> `bookingTravelers`
- `BookingParticipant` -> `BookingTraveler`
- `createParticipant` / `updateParticipant` / `deleteParticipant` ->
  traveler-specific methods
- `participantId` fields renamed to `travelerId` where they truly reference a
  traveler

### Primary package scope

- `packages/bookings/src/schema-core.ts`
- `packages/bookings/src/schema-items.ts`
- `packages/bookings/src/schema-relations.ts`
- `packages/bookings/src/schema-shared.ts`
- `packages/bookings/src/service.ts`
- `packages/bookings/src/service-public.ts`
- `packages/bookings/src/pii.ts`
- `packages/bookings/src/routes.ts`
- `packages/bookings/src/routes-groups.ts`
- `packages/bookings/src/validation.ts`
- `packages/bookings/src/validation-public.ts`
- `packages/bookings/src/index.ts`

### Special note on item roles

`booking_item_participant_role` should be renamed consistently, but its values
may still stay:

- `traveler`
- `occupant`
- `primary_contact`
- `service_assignee`
- `beneficiary`
- `other`

The role enum is about assignment semantics, not whether the parent row should
still be named `participant`.

### Acceptance criteria

- bookings no longer expose or store traveler rows under `participant` naming
- booking PII and travel-detail APIs are traveler-named
- booking documents, fulfillments, and redemption records reference `travelerId`
  where they are traveler-scoped

## Phase 6: Rename Booking Requirements to Traveler Semantics

Goal:

- align intake/question terminology with the traveler model

### Current mismatch

Booking requirements still use:

- `scope = "participant"`
- `target = "participant"`
- `fieldsByScope.participant`

That does not match the desired booking domain if bookings are traveler-first.

### Migration targets

- `participant` -> `traveler` in requirement scopes
- `participant` -> `traveler` in booking question targets where the meaning is
  traveler-scoped
- `perParticipant` -> `perTraveler` where the meaning is traveler-scoped

### Primary package scope

- `packages/bookings/src/requirements`
- `packages/bookings-react/src/requirements`
- `packages/ui`
- `apps/registry`

### Acceptance criteria

- requirement APIs speak in traveler terms
- UI copy no longer mixes traveler and participant
- public transport requirement summaries use `traveler` scope keys

## Phase 7: Align Transactions to the Traveler Model

Goal:

- keep offers/orders structurally consistent with bookings

### Why this phase is required

Transactions currently duplicate the same generic pattern:

- `offer_participants`
- `order_participants`
- `offer_item_participants`
- `order_item_participants`
- `transactionParticipantIdentity`

If bookings move to travelers and transactions do not, Voyant will keep two
different standards for the same travel-commerce concept.

### Migration targets

- `offer_participants` -> `offer_travelers`
- `order_participants` -> `order_travelers`
- `offer_item_participants` -> `offer_item_travelers`
- `order_item_participants` -> `order_item_travelers`
- `participant_id` -> `traveler_id` in traveler-owned transaction references
- `transactionParticipantIdentity` -> `transactionTravelerIdentity`

### Primary package scope

- `packages/transactions`
- `packages/sellability`
- `packages/bookings/src/transactions-ref.ts`
- `packages/notifications` where transaction identity is projected

### Acceptance criteria

- offers/orders use traveler naming consistently
- transaction identity APIs are traveler-named
- conversion between offers/orders/bookings does not translate between
  participant and traveler models

## Phase 8: Update Integrations and Projections

Goal:

- make downstream adapters speak the same canonical language

### Required updates

- future external channel booking/order projections, including OCTO where required
- customer portal projections
- notifications template variables and recipient rules
- storefront configuration and validation
- generated registries and operator starters

### Important rule

External standards may still require contextual mapping:

- if an external contract says `participant`, map from Voyant `traveler`
- if an external transport contract says `passenger`, map from Voyant
  `traveler` or traveler assignment as appropriate

Do not let external field names dictate the internal canonical model.

### Acceptance criteria

- internal code is traveler-first
- adapter boundaries perform any required terminology translation explicitly
- template variables and docs use traveler terminology unless the external
  domain explicitly requires otherwise

## Phase 9: Final Cleanup

Goal:

- remove obsolete names and transitional compatibility code

### Cleanup scope

- tests
- changelogs where necessary
- seed data
- generated registry JSON
- templates
- migration metadata snapshots
- old docs that still teach the obsolete model

### Acceptance criteria

- no obsolete traveler-domain `participant` naming remains in bookings,
  transactions, requirements, UI, or docs
- no obsolete traveler-domain `passenger` aliases remain
- remaining `participant` uses exist only in generic CRM/non-travel contexts
- remaining `passenger` uses exist only in transport-specific contexts

## Recommended PR Split

Keep the migration reviewable by splitting into the following PR sequence:

1. docs standardization and naming decision
2. remove legacy passenger/participant aliases from public surfaces
3. introduce explicit booking contact model
4. remove staff-from-traveler-row behavior
5. booking core schema/service migration to traveler naming
6. booking requirements migration
7. transaction model migration
8. downstream integrations and final cleanup

## Implementation Constraints

### Avoid

- repo-wide search-and-replace without model changes
- mixing `traveler` and `traveller`
- preserving compatibility aliases longer than necessary
- using `passenger` as the umbrella term for non-transport bookings
- leaving bookings and transactions on different person-model standards

### Prefer

- additive migrations before destructive renames
- explicit adapter translation at external boundaries
- schema migrations grouped by coherent domain slices
- one canonical public term per concept

## Completion Definition

This migration is complete when:

- `traveler` is the canonical travel-commerce person term across the repo
- booking and transaction person records no longer rely on `participantType`
  for `booker`, `contact`, or `staff`
- contact and staff semantics have explicit homes
- transport-specific `passenger` usage is limited to transport operations
- generic `participant` usage is limited to non-travel modules such as CRM

At that point the repo will have one coherent standard that makes sense:

- by domain
- by context
- by platform architecture
- and by the standards Voyant is aligning to
