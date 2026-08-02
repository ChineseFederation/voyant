---
"@voyant-travel/bookings": patch
---

Register the roster-change preview and reconcile amendment actions in the
booking action-ledger capability registry.

`BOOKING_VOYANT_ACTIONS` derives from every amendment declaration, but
`BOOKING_AMENDMENT_CAPABILITIES` is hand-listed and had not been extended when
those two actions were added. The graph therefore lowered two capabilities the
canonical registry did not define.
