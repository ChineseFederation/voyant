---
"@voyant-travel/bookings": patch
"@voyant-travel/finance": patch
---

Refuse to create a booking that reserves nothing, and allocate booking references through a tool.

`create_booking` used to return a booking id for a command that produced no items whenever the resolved option had several optional units and the caller sent no `itemLines`. The result was a booking holding no inventory, with no price and nothing to invoice, while the caller was told it had succeeded. The create now fails closed before writing anything and explains which choice is missing.

`generate_booking_number` is the new sanctioned way to allocate the immutable `bookingNumber` that anchors the durable create. Callers previously invented their own reference, which is how agent-authored bookings ended up with references built from the traveller's name.
