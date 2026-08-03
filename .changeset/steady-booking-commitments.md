---
"@voyant-travel/bookings-contracts": minor
"@voyant-travel/bookings": minor
"@voyant-travel/bookings-react": minor
"@voyant-travel/admin-contracts": minor
"@voyant-travel/admin-react": minor
"@voyant-travel/i18n": patch
"@voyant-travel/catalog": patch
"@voyant-travel/commerce": minor
"@voyant-travel/finance": minor
"@voyant-travel/notifications": patch
"@voyant-travel/operations-react": patch
"@voyant-travel/storefront": patch
"@voyant-travel/trips": patch
"@voyant-travel/trips-react": minor
---

Make commercial commitment the sole Booking creation boundary for Booking
Platform v1.

Bookings now use only `confirmed`, `in_progress`, `completed`, and `cancelled`
states. Quote, Hold, supplier-operation, and payment lifecycles remain owned by
their respective domains. The beta-data migration preserves evidenced
commitments, fails closed on ambiguous external effects, restores capacity for
abandoned attempts, and removes the obsolete Booking-backed session state.
