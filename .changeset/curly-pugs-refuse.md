---
"@voyant-travel/auth": patch
"@voyant-travel/auth-react": patch
---

Storefront admin responses accept fields the runtime provider owns

The storefront runtime is a port, and Voyant Cloud's control plane serves managed
storefronts with an `organizationId` this package does not model. The admin
response contracts were `.strict()`, so that one field rejected the object, the
object rejected the array, and the storefronts page rendered its error state on a
healthy 200 — indistinguishable from an outage, and no retry could clear it.

Request bodies stay closed; response objects now strip what they do not know.
Refresh on the packaged storefronts page also retries every query its failure
banner speaks for, instead of only the list.
