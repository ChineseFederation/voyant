---
"@voyant-travel/payments": minor
---

Let the payment port express a stored instrument.

`PaymentAdapterCapabilities` gains `storeInstrument`, `PaymentInitiationInput`
gains a `storeInstrument` intent, and `PaymentInitiationResult`,
`PaymentStatusResult` and `PaymentCallbackEvent` gain a `PaymentStoredInstrument`
summary. All optional, so an adapter or caller written against an earlier
revision keeps its exact behavior.

Storage separates the two permissions card network rules treat differently.
`merchant_initiated` reuse rests on the merchant's terms, which the caller
already knows the shopper accepted and states as a fact. `shopper_reselect`
rests on explicit consent for that purpose, which can only be collected where
the payment details are entered, so the caller grants permission to ask and
learns the answer from the reported instrument. `PaymentInstrumentStatus` covers
the case where a reissued card outlives the agreement that authorized it.

Conformance gains two cases. Every adapter must now store nothing when the
caller asked for no storage, whether or not it declares the capability; a
storage-capable adapter must additionally never report a reuse the caller did
not grant.
