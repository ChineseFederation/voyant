---
"@voyant-travel/finance": major
"@voyant-travel/catalog": major
"@voyant-travel/catalog-react": major
"@voyant-travel/action-ledger": major
"@voyant-travel/bookings": major
"@voyant-travel/bookings-react": major
"@voyant-travel/inventory": major
"@voyant-travel/operations-react": major
"@voyant-travel/charters": major
"@voyant-travel/cruises": major
"@voyant-travel/trips": major
"@voyant-travel/tools": major
"@voyant-travel/mcp": major
"@voyant-travel/bookings-contracts": major
"@voyant-travel/accommodations": major
"@voyant-travel/commerce": major
"@voyant-travel/storefront": major
"@voyant-travel/storefront-sdk": major
---

Replace the inline Finance booking-create HTTP and dual-create surfaces with one
handler-admitted, idempotent created-target Tool command. Booking rows, dependent
finance records, the canonical action-ledger result, and domain-event outbox
entries now settle in one transaction; exact retries resolve the original booking.

Remove the retired booking-create React mutation, sheet, page, and slot shortcut.
Unmount the legacy admin new/journey routes and semantic destinations, remove
catalog and inventory booking actions, and remove the standard storefront
`/shop/book/:entityModule/:entityId` route plus its booking page/journey exports.
Catalog browsing, booking read/detail, customer-portal sessions, and reusable
draft sections remain available; new booking creation is a Finance staff Tool.
Remove raw Bookings, Charter, and Cruise creation APIs and Tools. Delete the
dormant Catalog owned-commit contract and Inventory, Accommodations, Cruises,
Commerce, Storefront, and Storefront SDK booking-row creation bridges rather
than retaining unavailable legacy mutations. Require registry-minted,
unforgeable handler admission plus a single-use Finance-specific mutation lease
for Bookings domain settlement, and remove the Finance command's public
subpath.
