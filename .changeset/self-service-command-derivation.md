---
"@voyant-travel/catalog": minor
"@voyant-travel/inventory": minor
"@voyant-travel/finance": patch
---

Add a per-vertical derivation primitive for public self-service booking.

`OwnedBookingHandler.deriveSelfServiceCommand()` turns a public draft plus an
accepted quote into a durable create command. It is pure — Finance still owns
the mutation inside its claim — which is what distinguishes it from the removed
`commit()`: the handler now describes the booking, it does not make one.

Implementations must ignore operator-only draft fields, and the products
handler does: a public caller can write the draft, so honouring `priceOverride`
would let them name their own price, `suppressNotifications` would let them
silence the operator, and `internalNotes` / `documentGeneration` would let them
write operator-facing state. All four are dropped, with tests asserting each is
absent from the derived command rather than merely falsy.

A vertical that does not implement the primitive has no public creation path,
and the deployment's create action stays unavailable for it. Products is the
first and only implementation.

`@voyant-travel/finance` gains a `consumeSources` hook that runs inside the
booking-create transaction, so the draft, quote, hold, and verification
challenge commit or roll back with the booking.
