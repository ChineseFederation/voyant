---
"@voyant-travel/webhook-delivery-contracts": patch
---

Republish so the package resolves for consumers.

`0.1.0` was published without its `publishConfig` overrides applied, so the
released manifest kept `exports: { ".": "./src/index.ts" }` while `files` only
ships `dist`. Every consumer resolving the package hit a missing module, which
also made `@voyant-travel/app-manifest` unimportable through its dependency on
this package. No source change is required — the existing `publishConfig` is
correct and is applied by the release pipeline.
