---
"@voyant-travel/storefront": minor
"@voyant-travel/catalog": minor
"@voyant-travel/finance": minor
---

Authorize stored instruments from the operator's booking terms.

Keeping a shopper's card and charging it later while they are away is a
merchant-initiated transaction. Card network rules authorize it through the
merchant's own terms, which the shopper accepts at checkout, and require the
merchant to keep a record of that acceptance. It is not a checkbox beside the
card field.

Storefront settings gain `legal.storedInstrumentMandate` with an `enabled` flag
and a `revision`. The revision is what makes the record meaningful: without it
an acceptance says only that some terms were agreed at some point. The Booking
Session derives the storage intent from the mandate plus its existing contract
acceptance, and passes an `agreementReference` naming both.

Absent settings mean nothing is stored. Fail closed is the only safe default:
the operator is the merchant of record and carries the liability for an
agreement they never wrote.

The mandate is operator configuration and is omitted from the public storefront
settings projection. What a shopper reads is the booking terms themselves,
through the contract template.
