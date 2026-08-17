---
"@voyant-travel/bookings": patch
"@voyant-travel/catalog": patch
"@voyant-travel/public-api": patch
"@voyant-travel/identity": patch
---

Finish the `active_storefront_channel_required` → `active_channel_required` error-code
rename, and correct the verification challenge's declared TypeID prefix.

The rename was announced when the storefront entity was retired, but four call sites
were missed: booking-inquiry submission, booking-engine session start, and two public
shopping guards. All four resolve the caller through `activePublicApiOrigin` already —
only the string a client sees was stale, so a consumer matching on the documented code
got no match on exactly these paths.

`customerVerificationLinkable.idPrefix` still read `svch`, from before the table was
renamed off the storefront entity. `typeId("customer_verification_challenges")` mints
`cvch_` per the prefix registry, so the field named a prefix nothing produces. Rows
created before the rename keep their `svch_` ids — the id is opaque and rewriting it
would invalidate every challenge in flight — so the field now names the current prefix
rather than the only one in the table. It is informational; nothing resolves ids
through it.
