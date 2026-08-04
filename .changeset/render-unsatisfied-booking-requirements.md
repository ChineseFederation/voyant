---
"@voyant-travel/bookings-react": minor
---

Show the buyer which Booking Requirements are unsatisfied.

The Booking Session already validates a selection against the requirements it
published and rejects a quote or a commit with `selection_incomplete`, carrying
a machine-readable `unsatisfied[]` of `{ requirementKey, reason }`. No host
rendered it, so a buyer missing a passport number and a departure got one
generic sentence and had to guess — the whole enforcement chain stopping one
hop short of the person who can act on it.

`journey/lib/unsatisfied-requirements.ts` does two things and nothing else: it
maps `reason` onto human copy (en + ro, keyed by the contract's enum so an
unmapped reason is a build error rather than a blank line), and it parses
`requirementKey` into the control the descriptor named. It never re-evaluates a
requirement — the server is authoritative, and a second opinion computed in the
browser is the two-sources-of-truth defect this issue removes.

The journey steps anchor what they draw: a band's stepper row for
`paxBands.<code>`, the departure picker for `configureSubSteps.departure`, each
configure sub-step's own block, the traveler row and input for
`travelerFields.<key>.travelers.<n>`, the billing input for
`bookingFields.<key>`. Anything a surface does not draw — the operator's CRM
picker replaces the billing inputs, a vertical may declare a requirement no
step renders — groups at the owning step, and the Review step lists the whole
set next to Confirm, so nothing the server said can be lost.

`DateField`, `SelectField` and `PhoneField` gained the `error` prop `Field`
already had, which is what makes the per-input anchoring possible.
