---
"@voyant-travel/catalog-contracts": patch
"@voyant-travel/catalog": patch
"@voyant-travel/trips": patch
---

Stop the policy capture instant from superseding every Quote it is attached to.

Commit re-composes the Quote and compares price fingerprints to decide whether
the price still stands. The composed pricing carries
`policyEvidence.cancellation.capturedAt`, which
`captureCancellationPolicySnapshot` stamps with `new Date()` on every read — so
the two fingerprints could never agree. Every Commit against a product with a
published cancellation policy was refused `quote_failure / superseded` and had
its Hold released, deterministically and on the first attempt. Online checkout
was down for those products, on any payment method, with no race involved.

The capture instant now leaves the fingerprint input and nothing else does:
`policyId`, `policyVersionId`, `version` and the rules themselves stay in, so a
genuine price change or a policy version change still supersedes the Quote.
Both comparison sites use one helper with the value written at quote time, so a
normalization cannot be applied to some of them and not others.

The same comparison in `materialPolicyChanged` had the same defect, reporting
every catalog-backed Trip component as materially changed and demanding a
proposal re-acceptance no traveller could clear.
