---
"@voyant-travel/framework-migrations": patch
---

Record the two generations of the Booking v1 status cutover as equivalent, so
already-current deployments can take operator 0.3.0.

The payment-effect guard in
`bookings/20260802200000_booking_v1_status_cutover` was narrowed in place, which
changed the migration's content hash without a companion equivalence entry. Any
deployment that had applied the original tripped `MigrationImmutabilityError`
and could go no further — everything ordered after `bookings` in the collector
plan was unreachable, and because each migration commits in its own transaction
a failed run left the schema partly advanced.

The equivalence is sound without an adoption increment, unlike the quotes →
proposals pairs. The guard only raises; it never writes. The narrowed predicate
is a strict subset of the original, so a database that recorded the original
matched zero rows against it and matches zero against the subset, and every
other statement in the file is byte-identical. The class of deployment the edit
was written for is exactly the class the original aborted on, so it never
recorded a ledger row to diverge from.

The closure is symmetric, so a rolled-back image shipping the original bytes
against a ledger written by the corrected one is accepted too. An unrelated hash
for this migration still fails.
