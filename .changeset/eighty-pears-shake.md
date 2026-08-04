---
"@voyant-travel/bookings": patch
---

Stop the Booking v1 status cutover from refusing to run on abandoned checkouts
that never charged. The guard now trips only on a recorded payment
authorization, capture, or payment — or on a checkout still inside its provider
window — instead of on any historical provider session identifier. A session
that only carries provider identifiers is kept as the record that a checkout was
opened, rather than blocking a migration that no operator action could unblock.
