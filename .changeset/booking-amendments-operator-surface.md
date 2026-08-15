---
"@voyant-travel/bookings": minor
"@voyant-travel/bookings-contracts": minor
"@voyant-travel/bookings-react": minor
"@voyant-travel/finance": minor
"@voyant-travel/finance-react": minor
---

Make changing a live booking a first-class operation instead of free-text data entry.

- **Deleting or resizing a Booking Item now returns the inventory it held.** `booking_allocations.booking_item_id` cascades, so deleting an item destroyed its allocation without giving the seats back — `availability_slots.remaining_pax` stayed decremented permanently with no row left to reconcile from. `deleteItem` now releases before the cascade, and `updateItem` keeps the allocation in step with a `quantity` change, refusing to oversell rather than silently desyncing.
- **The Booking Amendment engine is reachable from the operator.** Adding or removing a traveller on a confirmed booking runs preview → accept → apply: the change is priced, the departure is capacity-checked, and the supplier consequence is shown before anything is written.
- **A new `item_add` Amendment adds a catalog-linked service** — an extra excursion, a transfer — priced from the catalog and holding a real allocation. Supplier-sourced products are refused, since adding one needs a supplier reservation this system cannot make.
- **The money follows.** Applying an Amendment that owes money now raises a payment schedule for the difference, so "Generate payment link" pre-fills the delta instead of the booking total, and the generated link can be emailed to the customer from the same dialog.
