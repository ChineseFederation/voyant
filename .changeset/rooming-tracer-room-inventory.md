---
"@voyant-travel/availability": minor
"@voyant-travel/operations": minor
"@voyant-travel/operations-react": minor
"@voyant-travel/i18n": minor
---

feat(operations): materialize real room inventory and produce a rooming list

Before this, the only checked property of a room position was its maximum
capacity. Room type, bed configuration, accessibility and the occupancy band a
unit was contracted at all existed as data and were consulted, at most, as a
*sort key* in the auto-allocator — which is to say they could be silently
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
