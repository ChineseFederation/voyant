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
