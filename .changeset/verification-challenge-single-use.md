---
"@voyant-travel/storefront": minor
---

Bind storefront verification challenges to a subject and make them single-use.

A verified challenge is a bearer credential. Until now nothing stopped one from
being replayed indefinitely, or from authorizing an action it was never
verified against. Challenges can now carry a `subjectRef` (the booking draft,
for a self-service create) recorded at start, and `consumeVerifiedChallenge()`
spends one in a single conditional `UPDATE` that requires the challenge to be
verified, unconsumed, within its consumption window, and to match the expected
purpose, subject, and destination.

Because every condition lives in the `UPDATE` predicate rather than in a
preceding read, there is no check-then-spend window and concurrent callers
cannot both win. The function takes a transaction so it commits atomically with
whatever it authorizes.

Adds `subject_ref`, `consumed_at`, and `consumed_ref` columns to
`storefront_verification_challenges`.
