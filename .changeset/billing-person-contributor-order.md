---
"@voyant-travel/catalog": patch
---

Wire `resolveBillingPerson` regardless of runtime-contributor load order.

Contributors load in alphabetical order by package name, and the check for
`bookings.relationships.runtime` ran while this contributor was being built.
That port is provided by `@voyant-travel/relationships`, which sorts after
`@voyant-travel/catalog` and therefore cannot ever have run yet — so the port
always read as absent and `resolveBillingPerson` was dropped from the
self-service booking source on every runtime.

`resolveBilling` then returned null and every guest self-service booking was
refused with `incomplete_draft`, after the shopper had verified a contact.
Authenticated customers resolve their own billing party and were unaffected,
which is why it stayed invisible.

The capability check now happens on call, where every contributor has run. A
deployment that genuinely ships no relationships runtime still returns null, so
only authenticated customers can book there.
