---
"@voyant-travel/bookings-contracts": minor
"@voyant-travel/bookings-react": minor
"@voyant-travel/bookings": minor
---

Record contracts, invoices, proformas, and credit notes that were issued outside Voyant against a booking.

A Booking Document can now be one of those four commercial kinds as well as a traveller document, and carries the identity its own issuer gave it (`issuedBy`, `issuedSeries`, `issuedNumber`, `issuedAt`). Recording is not issuing: nothing allocates a number from an invoice or contract series, nothing renders from a template, and no `invoices` or `contracts` row is created. A database check requires an issued kind to carry the issuer's number and date, and a unique index over the document's whole issued identity makes recording the same document twice replay the first record instead of doubling it, while keeping two issuers' identically-numbered documents apart. The insert and its action-ledger entry commit in one transaction.

Adds the `record_booking_document` and `list_booking_documents` Tools so an agent migrating historical bookings can attach the paperwork itself, and adds the matching fields to the admin Upload document dialog.
