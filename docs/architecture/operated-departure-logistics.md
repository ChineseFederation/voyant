# Operated-departure logistics

The availability-slot detail page is the workspace for operating one concrete
departure. Its Allocation tab uses the existing `allocation_resources` table
and the traveler's `allocations` map; it must not introduce a second resource
or assignment aggregate.

## Shared assignment primitive

An allocation resource belongs to exactly one availability slot and has a
`kind`, label, capacity, optional parent, and optional external reference. A
booked traveler is assigned by storing the resource ID under that resource
kind in `booking_traveler_travel_details.allocations`.

The standard workspace kinds are:

- `room`: a room, cabin-like unit, or other shared accommodation space.
- `vehicle`: a coach, minibus, aircraft, vessel, or other transport unit. It is
  a parent operational resource used to manage capacity and seats; travelers
  are not assigned directly to it.
- `vehicle_seat`: one named seat belonging to a `vehicle`; capacity is always
  one.
Modules may add kinds such as `cabin`, `flight_seat`, or `equipment`. Standard
kinds are always visible in the departure workspace so an operator can create
a one-off logistics plan without first editing a product template. Product
option templates remain the efficient way to materialize repeated layouts.

## The canonical slot↔booking join

Three different edges connect a booking to a departure today. They are not
interchangeable, and picking one per feature by accident is how the same
departure ends up with three different passenger counts.

| Edge | Written by | Read by |
|---|---|---|
| `booking_allocations.availability_slot_id` | the reservation/allocation path | the allocation manifest, the extras manifest, resource capacity, the departure workspace |
| `booking_items.metadata->>'availabilitySlotId'` | the product→booking convert flow | per-option-unit availability (`service-unit-availability.ts`) |
| `booking_items.availability_slot_id` | the booking-item writer | Finance's profitability read model (`service-profitability.ts`) |

**The departure workspace uses `booking_allocations.availability_slot_id`.**

It is the only one of the three that carries a *lifecycle*. An allocation has
its own status (`held`/`confirmed`/`fulfilled` versus
`released`/`expired`/`cancelled`) and its own `hold_expires_at`, so it can
answer "does this booking still consume a seat on this departure, and since
when" — which is the whole question a capacity counter asks. The two
`booking_items` edges are plain columns: they record which departure a line
item was sold against and cannot express that the claim was later given back.
`booking_allocations` is also the edge the traveler-assignment guardrails and
the existing manifests already join on, so the workspace's counters and its
rows agree by construction.

The other two stay where they are:

- `booking_items.metadata->>'availabilitySlotId'` is a **legacy** edge kept for
  per-option-unit availability. New code must not add readers.
- `booking_items.availability_slot_id` is **Finance's** edge. Revenue and cost
  attribution follow the priced line item, not the seat claim, and a cancelled
  allocation must not erase an invoice that was issued. Finance is deliberately
  not migrated onto `booking_allocations`, and the departure workspace reads
  Finance's answer through a runtime port rather than re-deriving money on the
  allocation edge.

## Shared booking lifecycle vocabulary

The status sets that decide "this booking still counts" and "this allocation
still holds a seat" live once, in
`@voyant-travel/bookings-contracts`'s `booking-lifecycle.ts`
(`ACTIVE_BOOKING_STATUSES`, `ACTIVE_BOOKING_ALLOCATION_STATUSES`). They are
pinned against the Drizzle enums in `@voyant-travel/bookings`'s `status.ts`;
the Drizzle `sql` fragment builders that bind them into raw queries live in
Operations' `availability/booking-statuses.ts`, because a contracts package
depends on `zod` only (ADR-0002).

One list is deliberately **not** converged: Finance's duplicate-booking guard
in `service-booking-create.ts` matches `('confirmed', 'in_progress')` only. It
asks a narrower question — "would a new booking for this party duplicate one
that has not yet been delivered" — and widening it to include `completed`
would change behaviour. It stays a distinct, locally-documented vocabulary.

## Invariants

- The traveler, resource, and availability slot must belong to the same live
  departure allocation.
- Assignments may not exceed resource capacity.
- A vehicle seat has capacity one and its parent must be a vehicle on the same
  slot.
- A vehicle may not have more child seats than its capacity. Lowering vehicle
  capacity below its existing child-seat count is rejected.
- Assigning a traveler to a vehicle seat implies that vehicle; the traveler
  allocation map must never contain a direct `vehicle` assignment.
- Parent resources cannot be deleted while child resources still reference
  them.
- Removing a resource clears traveler allocations that reference it and is
  recorded in the allocation audit log.

The admin route bundle is mounted behind the operator application's existing
authenticated admin boundary. Mutation audit entries retain the acting user ID.

## Attaching a fleet resource: which table is authoritative

An allocation resource may carry `refType = "resource"` with `refId` pointing at
a `resources` row, which is how a departure says "this is the coach that
operates it". Two tables then describe the same coach, and they answer different
questions:

| Table | Authoritative for | Scope |
|---|---|---|
| `allocation_resources` (`ref_type = "resource"`) | **what this departure operates** — the container travelers are assigned against, its capacity, its child seats | one slot |
| `resource_slot_assignments` | **fleet commitment across departures** — is this coach already promised elsewhere, and since when | every slot |

Neither is a copy of the other, and neither is optional:

- Every read the departure workspace does — manifest, exports, capacity
  counters, the conflicts projection — goes through `allocation_resources`. A
  departure never has to consult the Resources module to render or validate its
  plan.
- Only `resource_slot_assignments` spans departures, so it is the only table
  that can detect a double-booking. `allocation_resources` is slot-scoped by
  construction and can never see a clash.

There is exactly **one write path** (`service-allocation-resource-link.ts`).
Attaching writes both rows in one transaction, having first consulted the fleet
ledger as the conflict oracle; detaching removes the container and releases the
commitment. A live `resource_slot_assignments` row the Resources admin section
already created for the same (slot, resource) is **adopted**, not duplicated,
and its id is recorded on the allocation resource's `flags.resourceAssignmentId`.
That reconciliation is what stops a coach being held twice through two unrelated
tables.

An attach is idempotent: re-attaching the same resource returns the existing
link rather than raising, matching the materialisation paths.

## Materialising a layout, and what "already done" means

Both materialisation paths — pax-derived (`autoMaterializeAllocationResources`)
and template-default (`materializeSlotResourcesFromTemplateDefaults`) — agree on
**skip-existing at `(kind, ref_id)` granularity**. Materialising is a
converge-to-this-layout operation, so running it twice leaves the same rows and
reports `created: 0, skippedExisting: n`. The pax-derived path used to raise
`409 Resources already exist` instead; skipping is the only rule of the two that
is safe to retry, and the per-`(kind, ref)` granularity is what lets a second
room type materialise later without the whole `room` kind counting as done.

Replacing an existing layout stays an explicit operator action: delete the
resources, then materialise again.

`vehicle_seat` templates materialise from their `default_count` too, which
counts **vehicles**; the seat count comes from the template's layout. An
operator can therefore draw a coach before the departure has sold a single seat.

## Allocation conflicts are a server projection

"What is wrong with this plan" is answered once, server-side
(`service-allocation-conflicts.ts`), so the workspace UI, the CSV export and the
printed manifest cannot disagree. The rules are pure over already-loaded facts
and every conflict carries a stable machine code:
`traveler_unassigned`, `resource_over_capacity`, `duplicate_assignment`,
`inaccessible_assignment`, `incompatible_assignment`,
`oversubscribed_sharing_group`, `split_sharing_group`. Never rename a code; add
a new one. Detection only — nothing there repairs anything.

Departure-level drift (stale holds, oversold capacity, missing travelers) stays
in `service-departure-issues.ts`. The two projections are complementary: one
asks "does this departure's bookkeeping agree with itself", the other asks "can
this rooming or seating plan actually be operated".

## Deliberately deferred planner work

This shared primitive supports real rooming, vehicle, and seat assignment now.
Rich specialist planning remains additive UI over the same data:

- drag-and-drop rooming and bulk family/group moves;
- graphical multi-deck coach, aircraft, and vessel layouts;
- staff and crew assignment. Crew are operational resources assigned to a
  departure or duty, not traveler positions, so they must not use the traveler
  allocation map;
- crew qualifications, shifts, duty-time limits, and supplier contracting;
- vehicle registration, depot, route-leg, and maintenance constraints;
- automatic conflict detection across departures for shared fleet and staff
  beyond the overlapping-window check the attach path already performs.

Those features should link resources through `refType`/`refId` to their owning
fleet, people, supplier, or facility records instead of copying those entities
into availability — the `"resource"` ref above is the first of them.
