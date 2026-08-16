---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog": minor
"@voyant-travel/finance": minor
---

Let a shopper choose to settle a booking in full when a deposit policy applies.
Commit accepts `payInFull`, which collects the Quote total as a single `full`
instalment instead of the policy's deposit; the Quote's payment plan advertises
the choice as `payInFullCents` alongside `dueNowCents`, and is null when the
plan already collects the whole total. The flag may only ever increase what is
collected — a request that would collect less than the policy's own row is
refused — and the choice travels with the payment so settlement re-derives the
amount it actually collected.

A Booking Session now also collects one amount at a time: `findLiveBookingSessionPayment`
reports what a Session is already collecting, and a Commit that would open a
second checkout beside it at a different amount is refused as `payment_in_flight`
rather than charging the shopper twice.
