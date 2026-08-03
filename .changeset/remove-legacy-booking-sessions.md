---
"@voyant-travel/bookings-contracts": minor
"@voyant-travel/bookings": minor
"@voyant-travel/bookings-react": minor
"@voyant-travel/finance": minor
"@voyant-travel/finance-react": minor
"@voyant-travel/schema-kit": minor
"@voyant-travel/storefront": minor
"@voyant-travel/storefront-react": minor
"@voyant-travel/storefront-sdk": minor
---

Remove the beta Booking-backed session and low-level public Booking creation
surfaces. Custom storefronts now construct reservations exclusively through
Catalog Booking Session v1, while Bookings exposes only committed-reservation
overview and guest-access routes.
