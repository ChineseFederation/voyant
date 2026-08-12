---
"@voyant-travel/relationships": major
"@voyant-travel/relationships-react": major
"@voyant-travel/flights-contracts": minor
"@voyant-travel/flights-react": major
---

Stop serving the processor token, and define what a person merge does to a
stored instrument.

`processor_token` is the one column on `person_payment_methods` that can charge
a customer, and it was included in every list and read response, so any
authenticated admin client received it to render a brand and four digits. It is
now projected out server-side. Callers that mean to charge name the method by
id and let the server resolve the token.

The saved-method arm of the flights `PaymentIntent` follows: it carries a
`methodId` instead of a token, which removes the synthesized `acct:` placeholder
that existed only because no real token was available client-side. It is a
distinct arm rather than a variant of `card` because the two are different
facts, and collapsing them would put a chargeable credential back on every
client that renders a saved card.

Merging two people reparents their payment methods but does not merge the
customer records those methods are bound to at the provider. A projected method
from the losing person therefore rests on an agreement given by a record that no
longer exists, so it is retired to `requires_new_agreement` rather than silently
carried over. The row stays visible to the operator, which makes the state
explainable instead of a card vanishing mid-merge. Manual rows carry no provider
binding and no authorization to lose, so they move unchanged.

The response now also carries `source`, `providerId`, `authorizedReuses` and
`status`, which is what a future storefront read path checks before offering a
stored method back to a shopper.
