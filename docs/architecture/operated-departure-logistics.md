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
- automatic conflict detection across departures for shared fleet and staff.

Those features should link resources through `refType`/`refId` to their owning
fleet, people, supplier, or facility records instead of copying those entities
into availability.
