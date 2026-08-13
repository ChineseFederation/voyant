---
"@voyant-travel/proposals": minor
"@voyant-travel/proposals-contracts": minor
"@voyant-travel/proposals-react": minor
"@voyant-travel/finance": minor
"@voyant-travel/storefront-react": patch
"@voyant-travel/framework": patch
---

Close three gaps between what a Proposal says and what it can do.

A version with no frozen Trip snapshot could be sent but never accepted — the public accept route answered 409 for the life of the proposal, and neither the operator nor the customer was told. The public payload now carries `acceptance: { available, reason }` mirroring the two gates acceptance actually applies, the customer page withholds the Accept control rather than explaining a 409 afterwards, and the admin send response carries a `snapshot_required` warning surfaced to the operator who is the only party who can fix it. Sending a line-item proposal for review is still allowed.

Public decline read no body and dropped the customer's explanation, while its sibling request-edits kept it. Decline now takes the same optional `message` and routes it through `recordPublicProposalFeedback`, filed as a decline rather than an edit request (`proposal.proposal_feedback.declined`) and returned as `feedbackId`.

Payment terms existed only operator-wide, so a negotiated deposit could not be attached to the deal it belonged to. `proposal_versions.payment_terms` holds finance's `PaymentPolicy` per version, editable while draft and frozen once sent, stated on the public payload as amounts against that version's total. Finance's cascade gains a `proposal` layer between the booking-level override and the catalog layers, resolved from `booking_origins` so an accepted proposal's booking is billed on the terms the customer agreed to instead of the operator default. Deployments without the proposals module are unaffected — the layer is an optional runtime port and costs no extra read when unwired.
