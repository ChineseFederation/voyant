---
"@voyant-travel/catalog": patch
---

Stamp `hold_expires_at` on the draft when `POST /catalog/holds/place` succeeds.

`hold_expires_at` is the only evidence of a hold that anything downstream reads:
the public self-service create refuses a draft without it (`hold_required`) for
precisely the verticals that implement `placeHold`, and the reaper releases by
it. Nothing on the public path wrote the column — `updateBookingDraft` is its
only writer and no route called it with `holdExpiresAt` — so placing a hold took
the inventory and still guaranteed the create would be refused. Public
self-service booking against a holds-implementing vertical could not succeed at
all.
