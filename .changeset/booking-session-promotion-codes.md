---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog": minor
"@voyant-travel/commerce": minor
"@voyant-travel/bookings-react": minor
---

Honour promotion codes on the Booking Session v1 quote.

`promotionCode` had been declared on the public booking selection and accepted
by the offer-preview and create-session routes since the beta quote path, but
`normalizeBookingSelection` projected it away before any handler saw it — so a
code could never change a price, and `createCatalogPromotionEvaluator`, the
adapter written for exactly this hook, had no call sites at all after
voyant#4188 deleted the beta `quoteEntity`.

The code now survives normalization and `composeQuote` evaluates promotions
through a new optional `CatalogCommerceRuntimeExtension.createPromotionEvaluator`
seam. Auto-applied offers are evaluated too, not only code-gated ones: the
catalog plane already advertises their discounted price, so quoting without
them left the listing and the quote disagreeing. The discount lands as negative
`discount` lines with `subtotal`/`taxTotal` scaled to preserve both the
effective tax rate and `subtotal + taxTotal === total`; base lines are left
alone so `fillMissingBookingItemSellAmounts` reconciles the booking to the
discounted total at commit. A deployment with no promotions module wired quotes
exactly as before.

`pricingBreakdownV1` gains `appliedOffers` and `promotionCodeStatus`. The
second is the missing piece behind voyant#4615: a rejected code does not make a
departure unbookable, so a valid quote needs somewhere to say the code was
wrong. Without it the operator's New booking form had to infer rejection from
`available === false` and told them a departure with 13 places left was invalid.

Redemption recording is live again. The `booking.confirmed` subscriber reads
the applied offers through catalog's new `readAppliedOffersForBooking`, which
spans `booking_session_quotes` and the legacy `catalog_quotes`, replacing a
direct cross-module select that only ever saw the dead legacy table.

On the manual booking form, `submitBlocked` no longer contains a bare
`hasPromotionCode` (with an unreachable guard beneath it) and the persistent
"not authoritative in Booking Session v1" alert is gone. A valid code applies
and reprices; a rejected one blocks submission with copy that names why —
unrecognised, expired, not yet valid, or not applicable — rather than a single
generic "not valid for this booking".
