---
"@voyant-travel/bookings": major
"@voyant-travel/bookings-react": major
"@voyant-travel/operator-standard": major
---

Remove the `bookings:cancel` legacy compatibility action from the Bookings
access catalog. `bookings:cancel` is no longer a mintable or recognized
API-key/staff permission; stored grants naming it are now rejected as unknown
at mint time, and any that already exist stop matching anything.

Cancelling a booking has always been enforced under `bookings:write` (the
`cancel_booking` Tool requires `bookings:write`, not `bookings:cancel`), so
runtime enforcement is unchanged — this only removes a dead permission alias
from the mintable catalog.

`@voyant-travel/operator-standard` is bumped major alongside Bookings because
it distributes the Bookings access catalog via
`STANDARD_OPERATOR_DISTRIBUTION_POLICY`; consumers on the standard
distribution stop advertising `bookings:cancel` as a known permission too.

See the [caller migration page](../docs/migrations/removed-bookings-cancel-legacy-action.md)
for what to change.
