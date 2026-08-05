# @voyant-travel/availability

## 0.4.1

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/db@0.120.3

## 0.4.0

### Minor Changes

- 64df424: feat(operations): materialize real room inventory and produce a rooming list

  Before this, the only checked property of a room position was its maximum
  capacity. Room type, bed configuration, accessibility and the occupancy band a
  unit was contracted at all existed as data and were consulted, at most, as a
  _sort key_ in the auto-allocator — which is to say they could be silently
  ignored. A room position was sortable, not checkable.

  - **Positions carry their constraints.** `allocation_resources` and
    `product_option_resource_templates` gain `occupancy_min` (plus `occupancy_max`
    on the template), `room_type_id`, `bed_configuration`, `accessible` and an
    age band. `accessible` is promoted out of `flags`; the three historical flag
    keys are still honoured so rows written before this keep their meaning.
    A CHECK constraint rejects a minimum occupancy above the capacity.
  - **`generateFromRooms` stops discarding data.** It collapsed
    `occupancyMax ?? occupancyMin` into one number, so a triple sold to two people
    was indistinguishable from a double sold to two. It now carries the floor and
    the age band across from `option_units`.
  - **One constraint evaluator, three callers.** `room-constraints.ts` is pure
    over already-loaded facts and is shared by the assignment guard, the
    auto-allocator's filters and the conflicts projection, so the three can never
    disagree. Blocking violations (room type, unit, option, age band,
    unaccompanied minor, adult/child mixing) reject an assignment with 409 and a
    structured payload; advisory ones (bed preference, accessibility, occupancy
    floor) are reported, never a wall.
  - **Overrides are on the record.** `PATCH .../travelers/{id}` accepts
    `override: { reason }`. The reason and the exact list of rules it waived are
    written into the audit entry's `after` payload, inside the same transaction as
    the assignment.
  - **The auto-allocator filters instead of merely preferring.** Accessibility and
    option/unit matching were sort keys; they are now filters, given up one at a
    time in a documented order (bed preference → room type → option → option unit
    → age band → accessibility) with every relaxation reported as a
    `compromise`. A label prefix ("DBL #1") stays a preference — it is a name an
    operator typed, not something anyone contracted. Oversubscription is no longer
    an opaque `skipped` integer: `unplaced` names the sharing group, the
    travelers, the reason and the largest free block.
  - **Rooms can come from a contracted block.**
    `POST .../allocation/room-blocks/materialize` creates the positions **and**
    takes the matching `room_block_nights` pickup in one transaction, sized by the
    block's tightest night; the delete leg gives them back by reversing the
    pickup. Same authority split as the fleet-resource link:
    `allocation_resources` is what the departure operates, the nightly ledger is
    the cross-departure conflict oracle, and there is exactly one write path.
    Accommodations-less deployments get a clean 400.
  - **The preferences are enterable.**
    `PATCH .../travelers/{id}/rooming-preferences` and a workspace dialog write
    the bed preference and booked room type the rules check against. They were
    previously reachable only through the admin travel-details API.
  - **The rooming list is a rooming list.** The CSV is one row per occupant with
    the room type, bed configuration, occupancy band and accessibility a hotel
    needs, plus the booking, sharing group and bed preference. Rooms nobody holds
    still emit a row so a paid-for empty bed is visible. The print view becomes
    the supplier-facing sheet for room-shaped kinds; seat-shaped kinds keep the
    compact manifest.
  - **New conflict codes:** `under_occupied_resource`, `bed_preference_unmet`,
    `unaccompanied_minor`, `adult_child_mixing`. `incompatible_assignment` now
    also covers a room-type mismatch.

## 0.3.2

### Patch Changes

- b3cfd05: Stop advertising the never-maintained `remaining_resources` as live availability.

  `availability_slots.remaining_resources` can be seeded once when a slot is
  created and is then explicitly stripped on every update. Nothing anywhere
  decrements it as bookings, holds, amendments or refunds land, so its value only
  ever drifts upward relative to the truth. The storefront read it as a fallback
  whenever `remaining_pax` was unset, publishing a stale count on the public
  departure list, the product availability summary, and the price-preview
  allocation — a number that could only overstate what was left to sell.

  Storefront departures now derive capacity through a single
  `resolveDepartureCapacity` seam that reads only `remaining_pax`, the projection
  the platform actually maintains. When `remaining_pax` is unset the remaining
  capacity is reported as unknown (`null`) instead of a fabricated integer.
  Unknown degrades safely: `buildAvailabilityState` still derives `sold_out` only
  from an explicit `remaining === 0`, so an unknown count is neither presented as
  sold out nor as a concrete number of seats left. The column is marked deprecated
  on the schema and is no longer read by the storefront at all.

## 0.3.1

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/db@0.120.2

## 0.3.0

### Minor Changes

- a3c04c4: Record which Product Version an operated departure was materialized from.

  A departure had no way to name the Product definition it sells. Editing a
  product silently changed what every existing departure appeared to offer,
  including ones already sold — the gap the product model RFC calls out as the
  reason a departure cannot be reconciled, operated, or costed against a stable
  definition.

  `availability_slots` gains `product_version_id`. It is a soft reference:
  `product_versions` is owned by Inventory and a cross-domain foreign key would
  violate schema discipline, so the column stays plain text exactly like
  `product_id` beside it.

  Recurring generation resolves the version **once per rule**, so a publish
  landing mid-run cannot split one generation batch across two definitions, and a
  later run never rewrites departures an earlier run already bound. The version
  arrives through a resolver supplied by the deployment rather than a direct
  read — Inventory already depends on Operations, so reaching back the other way
  would close a dependency cycle. `resolveCurrentProductVersionId` on the
  Inventory side returns the highest version number, which is deterministic by
  construction.

  Departures created before this column existed are **reported, not backfilled**.
  The only signal available after the fact is what the product looks like today,
  which is precisely what may have changed since the departure was sold;
  assigning that retroactively would manufacture false provenance for exactly the
  records where provenance matters most. `reportUnboundDepartures` and
  `listUnboundDepartures` expose an operator-review queue that excludes departures
  which have already run, since their provenance can no longer affect what is
  sold. `countDeparturesOnVersion` gives the impact set for a product edit.

  Slot creation accepts an explicit `productVersionId`, so a caller can
  materialize a departure against a chosen version.

## 0.2.30

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
  - @voyant-travel/db@0.120.0

## 0.2.29

### Patch Changes

- Updated dependencies [0c30250]
  - @voyant-travel/core@0.137.0
  - @voyant-travel/db@0.119.1

## 0.2.28

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/db@0.119.0

## 0.2.27

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/db@0.118.5

## 0.2.26

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/db@0.118.4

## 0.2.25

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/db@0.118.3

## 0.2.24

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
  - @voyant-travel/core@0.133.0
  - @voyant-travel/db@0.118.2

## 0.2.23

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/db@0.118.1

## 0.2.22

### Patch Changes

- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0

## 0.2.21

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0

## 0.2.20

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0

## 0.2.19

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0

## 0.2.18

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/db@0.114.15

## 0.2.17

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/db@0.114.14

## 0.2.16

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/db@0.114.13

## 0.2.15

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/db@0.114.11

## 0.2.14

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/db@0.114.9

## 0.2.13

### Patch Changes

- 5617f37: Mark the schema-only Tool posture as not applicable because Operations owns and Tool-backs the
  provider-neutral availability services; duplicate availability Tools would compete for ownership.
- Updated dependencies [cabf662]
- Updated dependencies [c9b6144]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/db@0.114.7

## 0.2.12

### Patch Changes

- 49f55d0: Keep catalog booking and checkout as a two-phase flow, and atomically convert
  owned-product availability holds into on-hold booking allocations without
  consuming capacity twice. Hold placement and release are now idempotent across
  retries and duplicate tokens, converted holds retain an audit link to their
  booking allocation, and checkout-only intents receive structured validation
  errors from the reservation route.
- Updated dependencies [7e9f77a]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/db@0.114.6

## 0.2.11

### Patch Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.
- Updated dependencies [73ab096]
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5

## 0.2.10

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4

## 0.2.9

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/db@0.114.2

## 0.2.8

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/db@0.114.1

## 0.2.7

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/db@0.114.0
  - @voyant-travel/core@0.120.0

## 0.2.6

### Patch Changes

- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0

## 0.2.5

### Patch Changes

- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/core@0.118.0
  - @voyant-travel/db@0.112.2

## 0.2.4

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0
  - @voyant-travel/db@0.112.1

## 0.2.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0

## 0.2.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/db@0.111.2

## 0.2.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/db@0.111.1

## 0.2.0

### Minor Changes

- e3dc5a9: Declare package-owned Node deployment facets for product events, subscribers, workflows, access resources, tools, actions, and retain-data lifecycle behavior.

### Patch Changes

- a370024: Publish import-cheap package-owned Voyant deployment manifests for infrastructure and trips graph units.
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/db@0.111.0

## 0.1.3

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
  - @voyant-travel/db@0.110.1

## 0.1.2

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0

## 0.1.1

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/db@0.109.0

## 0.1.0

### Minor Changes

- 435a5d1: Extract the availability domain into a new foundational `@voyant-travel/availability` package, and complete D.2 per-package migration onboarding for the last schema-owning packages.

  - **@voyant-travel/availability (new):** owns the `availability_*` schema (slots, rules, start times, holds, pickups, capacity) — previously buried in operations. Ships its own D.2 migration.
  - **operations:** its availability **services and routes stay**, now importing the schema from `@voyant-travel/availability` (the barrel re-exports it for runtime consumers); operations' migration no longer owns the availability tables. Fixes the module direction — bookings/operations/accommodations consume availability, rather than reaching into operations for an inventory primitive.
  - **bookings:** drops the hard cross-package FK from `booking_allocations.availability_slot_id` to `availability_slots` (it referenced a stale local duplicate); the column is now a plain indexed id per module decoupling. The refund workflow keeps a runtime-only reference to the availability table.
  - **framework-migrations:** bundle migration drops the removed FK constraint.

  All package sources verified column-for-column against the bundle and apply together cleanly on a fresh D.2 database (union).
