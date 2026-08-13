---
"@voyant-travel/finance-react": patch
"@voyant-travel/storefront": patch
"@voyant-travel/trips": patch
---

Stop stamping `netopia` on operator-generated payment links, so they are payable on whatever processor the deployment actually runs. `useCollectPayment` defaulted `cardProvider` to `"netopia"` back when that was the only processor in tree, and every "Generate payment link" wrote it to `payment_sessions.provider`. On a deployment running any other processor the shopper could never pay: the card start reached the real adapter and created a live checkout session there, then the initiation result's `processorIdentity` failed the stored-provider guard, and the public route turned that into a bare 502 — leaving a live processor session attached to a payment session still marked `pending`.

The provider now stays unset until the processor claims it on start, which is what `createOrderPaymentSessions` already documents and what the payment-link retry route already did. Because an unstarted session then has neither a provider nor a redirect URL, the landing page can no longer read "card is on offer" off the session record: `payment-link-config` publishes a `cardPayments.available` flag (the card counterpart of its bank-transfer block, sourced from whether the deployment selected a payment adapter), and `PaymentLinkLandingPage` takes it as `cardPaymentAvailable`. This also restores the card option on sessions created by "Try again", which never carried a provider either. Deployments that supply no flag keep offering card, as they did before it existed.

The public start-card handler also logs the error it swallows — session id, stored provider, and the error's own code — instead of discarding it. The response stays deliberately opaque to the shopper; diagnosing this one otherwise meant reading platform logs and the session row by hand.
