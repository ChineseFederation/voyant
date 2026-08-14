---
"@voyant-travel/bookings-react": patch
"@voyant-travel/db": patch
"@voyant-travel/finance": patch
"@voyant-travel/legal": patch
---

Say when a booking contract could not be generated instead of dropping it in
silence. Retire the unsubscribed `booking.contract_document.requested` event,
record a failed action-ledger entry on the booking whenever confirmation cannot
produce the customer contract, and stop offering "Generate invoice and contract"
on deployments with no customer contract template to render. The outbox drain
now also names which event types it delivered to zero subscribers, alongside the
count it already reports, so the drain job's own log identifies the silence
rather than only sizing it.
