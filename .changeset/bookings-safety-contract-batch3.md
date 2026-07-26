---
"@voyant-travel/bookings": patch
---

Declare safety-contract metadata on the remaining grandfathered bookings
extras/requirements/status actions and remove them from the legacy
execute+tools allowlist:

- `extras.action.set-slot-extra-selection`,
  `extras.action.bulk-set-slot-extra-selections`, and
  `extras.action.bulk-update-slot-extra-collections` dedupe on the
  `(bookingId, travelerId, productExtraId)` unique index via
  `onConflictDoUpdate` and fully overwrite on a matching retry. They declare
  `commandTargetField: "slotId"`, `targetLifecycle: "existing"`, and
  `availability`/`effectBoundary: "local"`, anchored to the existing
  departure slot they mutate.
- `extras.action.update-booking-extra` and the eight
  `requirements.action.update-*` actions (booking answers, product/option
  booking questions, and their triggers) are plain local Postgres updates
  against an existing `id`, so they declare `commandTargetField: "id"`,
  `targetLifecycle: "existing"`, and `availability`/`effectBoundary: "local"`.
- `extras.action.create-booking-extra` already claims its command
  idempotently via the existing `handler-command-claim-v1` `createdTarget`
  contract; this adds `availability` and `effectBoundary: "local"`.
- The eight `requirements.action.create-*` counterparts are unguarded inserts
  with no natural-key dedup or idempotency claim, so a blind agent retry
  after a timeout would create a duplicate row. Quarantined with
  `availability: { status: "unavailable", reasonCode:
  "unsafe-unclaimed-create-target" }` pending a real created-target claim.
- `booking.status.cancel` stays available for admin routes and the
  action-ledger registry, but drops its graph Tool binding. Binding
  `cancel-booking` while keeping the action available would require tested
  multistage durability; marking the action unavailable would remove it from
  the graph-lowered ledger registry and break admin cancel. The Tool remains
  package-exported for direct callers.

No runtime changes.
