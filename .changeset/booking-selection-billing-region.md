---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog": minor
"@voyant-travel/inventory": minor
"@voyant-travel/bookings": minor
"@voyant-travel/bookings-react": minor
---

The booking selection's billing address carries a `region`, and the address it
already declared now survives to the Booking.

`bookingSelectionPublicV1.billing.address` had `line1`, `line2`, `city`,
`postal`, `country` and no administrative subdivision, so a checkout could not
record a state, province, or county. Romania needs it twice over: an invoice
carries the *judet*, and Bucharest has no ordinary city/county pair — its six
Sectors *are* the county-level subdivision. The only encodings available were
overloading `city` with `"Sector 3"` or hiding the county in an address line,
both lossy (voyant#4290).

`region` is free-form with ISO 3166-2 subdivision codes (`RO-B`, `RO-CJ`,
`US-CA`) as the recommended encoding. It is not *enforced* as ISO: the
`bookings.contact_region` column it lands in is free text and already holds both
`"Cluj"` and `"Ile-de-France"`, so gating the selection on a code would reject
data the destination accepts. A Bucharest Sector is modelled as the Sector in
`city` and `RO-B` in `region`.

**The rest of the address was being dropped.** `normalizeBookingSelection`
projected the billing address down to `country` alone — a leftover from the
Session tracer (voyant#4039) — so a caller that filled in the billing step lost
every line of it at the Session edge, and the Booking's `contact_*` columns came
back empty even though the columns had been there all along. The projection now
keeps all six fields, and they are carried the rest of the way:
`SelfServiceBillingParty` gained the address, the products handler puts it on
the booking-create command, and `createSourcedBookingCommitment` writes it for
supplier-sourced bookings.

The Session's card-payment handoff also fills `CardPaymentBilling`'s `state`,
`city`, `postalCode`, and `details`, which it previously left empty — a
processor that computes tax from the billing address needs the subdivision, not
just the country.

Address fields are now width-checked against the columns they settle into
(`line1`/`line2` 500, `city`/`region` 100, `postal` 20, `country` 2). Previously
unbounded: a payload that overran a column was admitted at the Session and failed
at commit, where the caller could no longer tell which field was at fault. This
is a tightening — a caller sending a full country name in `country` rather than
an ISO 3166-1 alpha-2 code is now rejected at the Session instead of at commit.

The operator's booking journey billing step draws a "County / region" input, and
`address.region` is addressable as a booking-field requirement.
