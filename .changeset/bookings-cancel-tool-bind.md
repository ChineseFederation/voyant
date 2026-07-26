---
"@voyant-travel/bookings": patch
"@voyant-travel/operator-standard": patch
---

Re-bind `booking.status.cancel` to `@voyant-travel/bookings#tool.cancel-booking`
and quarantine the graph action as unavailable
(`unsafe-nonidempotent-transition`). Critical-risk Tool convergence requires the
binding; admin cancel continues to authorize through package
`BOOKING_STATUS_CAPABILITIES`. Update the operator-standard parity test so
unavailable Tool bindings are not selected and unavailable capabilities are
excluded from the graph-lowered ledger comparison.
