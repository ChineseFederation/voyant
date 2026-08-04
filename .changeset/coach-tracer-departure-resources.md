---
"@voyant-travel/operations": minor
"@voyant-travel/operations-react": patch
---

feat(operations): attach a Resource to a departure, materialize seats, allocate atomically

A coach could not be pointed at the departure it operates, could not be laid out
before the first sale, and the plan's conflicts were computed nowhere the server
could see.

- **A departure can attach a fleet `resources` record.** `allocation_resources`
  gains a `"resource"` ref producer that writes the departure's container and
  the cross-departure `resource_slot_assignments` commitment in one transaction,
  adopting an assignment the Resources admin already made rather than
  duplicating it, and refusing a coach already committed to an overlapping
  departure. `docs/architecture/operated-departure-logistics.md` records which
  table is authoritative for what.
- **`vehicle_seat` templates materialize.** `default_count` counts vehicles and
  each one gets its full seat map, so an empty coach can be drawn before the
  departure has sold a seat. Previously only the pax-derived path created seats,
  which needed bookings to already exist.
- **Idempotency parity.** Both materialisation paths now skip existing resources
  at `(kind, ref)` granularity and report `skippedExisting`. The pax-derived
  path used to raise `409 Resources already exist`; a retried request is now a
  visible no-op.
- **`POST /slots/{id}/allocation/auto-allocate/preview`** returns the plan
  without writing it, and is the first production caller of
  `validateSlotAllocationCapacity`.
- **`POST /slots/{id}/allocation/travelers/assignments`** places a set of
  travelers in one transaction, so a sharing group can no longer land
  half-placed. Per-traveler `expectedResourceId` is an optimistic-concurrency
  precondition.
- **`GET /slots/{id}/allocation/conflicts`** is a server-side projection with
  stable codes covering unassigned, over-capacity, duplicate, inaccessible,
  incompatible, oversubscribed group and split group, so UI, CSV and print
  agree. The unused client-side `buildValidationIssues` / `ValidationSummary`
  are removed.
- **Seat exports are reachable.** `export-rooming-list` takes a `kind`, and the
  filename union gains `seating`.
- **Retry and revision safety.** Allocation mutations accept an
  `Idempotency-Key`, resource update/delete and fleet detach accept
  `expectedUpdatedAt`, and the new legs append action-ledger mutation entries.
