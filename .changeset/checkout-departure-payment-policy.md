---
"@voyant-travel/catalog": patch
"@voyant-travel/inventory": patch
---

Measure the customer payment policy at checkout from the departure the shopper selected, not from `products.startDate`.

The policy gates on the distance to departure, and Commit measured that distance from the product row's own `startDate` — which, for any slot-based product, is the listing's window and not the departure being bought. A product seeded with today's date collapsed a 50% deposit policy to full payment on a departure five weeks out; a product dated months ahead did the reverse, offering a deposit on a trip leaving tomorrow and dating the balance in the past. Checkout and `generatePaymentScheduleForBooking`, which has always read the Booking's selected `startDate`, could therefore compute two different plans for one booking from one policy.

Resolution now mirrors exactly what the Booking itself records — the selected slot's local date, then the product row — so the two schedules agree by construction. The checkout line item a hosted payment provider renders names the same departure.

Operators running a deposit policy will see checkout start collecting the deposit on departures where it previously collected the full amount.
