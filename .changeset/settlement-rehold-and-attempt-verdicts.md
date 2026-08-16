---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/notifications": patch
"@voyant-travel/catalog": patch
"@voyant-travel/db": patch
---

Stop settlement refusing a captured payment over a Hold token, and make the refusal it
does give loud and legible.

A card checkout was captured and never became a Booking: settlement refused
`hold_failure` against a Hold that was `active`, unexpired, correctly sized and bound to
the Session's current Quote, then spent all eight outbox attempts restating it. Two
independent faults produced that.

`commitPaidSession` read the Quote and the Hold as a pair off the payment's metadata, and
took the Hold *only* when a Quote was recorded with it. `prepare` writes that metadata
from the Commit it was called on and reuses an existing payment row for the same
idempotency key without rewriting it, so a checkout that reached `prepare` before taking
its Hold records the Quote alone — permanently. Settlement then passed no `holdId` and was
refused `hold_failure: missing` while the Hold sat there. The Hold is now resolved
independently, from the Session's live Holds bound to the settled Quote.

Separately, a Hold that is genuinely gone no longer refuses the Commit. Settlement runs
server-side against a Session whose money has already moved, and no client can keep a
15-minute reservation alive across a processor — the tab sleeps, 3-D Secure adds minutes,
a re-quote supersedes the Hold six seconds after taking it. It now asks inventory for the
capacity again, idempotently across the retry chain, and only a `no` from inventory
refuses: `hold_failure` gains a `capacity_unavailable` reason so "the token lapsed" and
"the seat is gone" stop arriving as the same verdict.

A refusal that no retry can change is now declared permanent, so it dead-letters on the
spot — the stranded-payment staff alert fires with that verdict instead of the eighth
attempt's, three quarters of an hour later — and the Session's Holds are released at that
point rather than left `active` with a null `released_at`. Retryable outcomes are
unchanged, and still keep their Hold.

`event_outbox` gains `attempt_errors`, one entry per failed delivery, so a chain that
fails several times retains what each attempt decided rather than only the last. The
dead-letter announcement carries it.
