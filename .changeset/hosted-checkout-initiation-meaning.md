---
"@voyant-travel/payments": minor
"@voyant-travel/finance": minor
"@voyant-travel/inventory": minor
"@voyant-travel/catalog": minor
---

A hosted checkout is initiated with what the shopper is buying, in their
language, keyed to a customer rather than an email address.

`PaymentInitiationInput` is what a hosted-checkout provider renders to the
shopper, and three of its fields could not carry the meaning that page needs.

`description` is the only product-shaped field on the contract, so a caller that
sends an identifier leaves the provider nothing else to show — and the Booking
Session commit path sent `Booking Session bses_01k…`. It now names the product
and, where the target has one, its departure, both resolved in the Session's
locale. The name comes from `loadProductPaymentPolicyContext`, which takes an
optional `locale` and returns the product's translated `name`, falling back to
its base name rather than to a language the shopper did not ask for.

`locale` is new and optional: a BCP 47 tag for the language the shopper has been
reading the funnel in, so a hosted page is rendered in it instead of guessed
from the browser. The Booking Session populates it from its own scope.

`customer.reference` is new and optional: an opaque, stable reference to the
runtime's own customer record. Without it a provider that wants to reuse a
stored customer — and therefore offer a stored payment method — has to key that
binding on the email address, which binds two people who share an inbox, breaks
when the address is corrected, and forces the provider to retain personal data
purely as a join key. The Booking Session populates it from the CRM person the
buyer was identified as, falling back to the owning principal only on a
customer-actor Session: on a staff-created one the principal is the agent, not
the shopper.

All three are additive. An adapter that ignores them behaves exactly as before.
