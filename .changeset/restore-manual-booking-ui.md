---
"@voyant-travel/bookings": minor
"@voyant-travel/bookings-react": minor
"@voyant-travel/inventory-react": minor
"@voyant-travel/i18n": patch
---

Restore a first-class manual booking flow for operator staff.

Bookings now expose a route-backed **New booking** action and a focused form
that collects the product/departure, billing contact, travelers, payment
schedule, price, notes, and initial status. The form defaults to `on_hold`,
requires an explicit review confirmation, and dispatches through Finance's
durable `create_booking` Tool with an authoritative booking number and a stable
idempotency key for safe retries.

Operated product details also expose **Create booking** with the product
preselected, and the new flow includes English and Romanian operator copy.
