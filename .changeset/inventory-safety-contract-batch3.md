---
"@voyant-travel/inventory": patch
---

Declare safety-contract metadata on the ten remaining grandfathered
inventory actions and remove them from the legacy execute+tools allowlist:

- `action.create-product` and `authoring.action.compose-product` already
  claim their command idempotently via the existing `handler-command-claim-v1`
  `createdTarget` contract and insert their lifecycle event through the
  durable outbox; this adds `availability`, `effectBoundary: "multistage"`,
  and `durability: { strategy: "outbox" }`.
- `action.update-product`, `action.publish-product`,
  `action.unpublish-product`, and `action.archive-product` are plain local
  Postgres updates against an existing product; the publish/unpublish/archive
  lifecycle transitions call `updateProduct` under the hood and emit their
  event in-process. This adds `availability` and `effectBoundary: "local"`
  (`targetLifecycle: "existing"` was already declared).
- `extras.action.create-product-extra` and
  `extras.action.create-option-extra-config` already claim their command
  idempotently via the existing `handler-command-claim-v1` `createdTarget`
  contract; this adds `availability` and `effectBoundary: "local"`.
- `extras.action.update-product-extra` and
  `extras.action.update-option-extra-config` are plain local Postgres updates
  against an existing `id`; this adds `availability` and `effectBoundary:
  "local"` (`targetLifecycle: "existing"` was already declared).

No runtime changes.
