---
"@voyant-travel/catalog-contracts": patch
"@voyant-travel/catalog": patch
"@voyant-travel/bookings-react": patch
---

Publish the payment plan on the Quote, so checkout can say what is due now and when the balance falls due.

A shopper under a deposit policy was never told they were paying a deposit. They reviewed a total, accepted a contract stating that total, pressed pay, and were charged something else — €378 reviewed and agreed, €189 charged. Nothing in the Session lifecycle carried the plan until Commit answered `payment_required`, which happens after the review step and after contract acceptance, so no storefront could state the terms at the moment the shopper agreed to them.

`quote.paymentPlan` now carries `policySource`, `currency`, `totalCents`, `dueNowCents` and every scheduled entry. It is a projection over the Quote's total and the selected departure — `resolveEffectivePaymentPolicy` then `computePaymentSchedule`, the same derivation Commit charges from, shared rather than duplicated so the two cannot come apart. Nothing is stored and no table changes; the field sits beside `pricing` rather than inside it, keeping it out of the price fingerprint that supersession compares.

`resolveContractVariables` accepts the quoted plan and prefers it over a host-computed schedule, so the accepted document states the real deposit, the real balance and its due date. A new `payment.dueNowCents` names what the card will actually be charged; `payment.amountCents` still means the booking total, so existing templates render unchanged.

Additive throughout — a deployment that wires no payment ports publishes no plan, and a storefront that does not read the field is unaffected.
