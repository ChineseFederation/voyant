---
"@voyant-travel/finance": patch
"@voyant-travel/storefront": patch
---

Reconcile embedded checkout sessions after browser-side payment confirmation.

Payment Element handoffs intentionally persist as `pending`: the shopper is not
redirected, and Stripe.js confirms the PaymentIntent in the browser. Status
refresh previously excluded that state, so the scheduled job woke successfully
but never selected the session and the booking engine could only time out while
showing a safe pending result.

Pending sessions are now eligible only after a processor identity has been
persisted (or an ambiguous initiation is explicitly marked uncertain). Plain
uninitiated drafts remain outside the bounded reconciliation batch.
