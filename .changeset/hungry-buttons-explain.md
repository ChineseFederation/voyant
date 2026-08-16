---
"@voyant-travel/bookings-react": patch
---

Say why **Create booking** is disabled, at the button

Manual booking create folded seven independent conditions into one
`submitBlocked` boolean and rendered a greyed-out button with no `title`, no
`aria-describedby` and no adjacent text, so an operator saw a dead button and
had to guess which of the seven was wrong.

The one message that did exist made it worse. "Select at least one option."
sits with the **Options** section near the top of the form, while the disabled
button is at the bottom past travellers, billing and the **Generate proforma** /
**Generate invoice and contract** checkboxes — which are also, to an operator,
options. A managed operator read it as those checkboxes, could not clear it
whatever they ticked, and opened a support ticket.

`submitBlocked` is now derived from `resolveManualBookingSubmitBlocker`, which
returns *which* condition applies — `sourced`, `product`, `timing`, `units`,
`settling`, `pricing` or `promotion` — in the same order `handleSubmit` checks
them, so the reason shown at the button is the reason a submit would have
raised. `submitBlocked` remains `blocker !== null`, leaving the #4588
error-clearing effect unchanged.

The reason renders in the action row beside **Create booking**, prefixed with
the button's own name, and the button carries `aria-describedby` pointing at it.
It is suppressed when it would repeat, word for word, an alert the same footer
already renders.

The units copy no longer collides with the document checkboxes: the anchored
message is "Set a quantity for at least one product option." and the
button-level one names the section — "Set a quantity in the Options section,
above. Those are the product's options, not the documents to generate." Both
locales updated.
