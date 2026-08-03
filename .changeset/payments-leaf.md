---
"@voyant-travel/payments": minor
---

Depend on `@voyant-travel/graph-contracts` instead of `@voyant-travel/core` for
`definePort`.

`@voyant-travel/payments` is the canonical payment adapter contract — 25 type
exports against 5 values, every file importing only its siblings. Its single
external import was `definePort`, which pulled in the whole runtime kernel and
forced every adapter author to install it.

With that repointed the package has no workspace dependencies and joins the
public surface as a leaf, so implementing a payment adapter no longer requires
the DI container, registry, event bus, saga, or locking.
