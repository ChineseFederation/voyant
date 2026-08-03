# @voyant-travel/webhook-delivery-contracts

## 0.1.1

### Patch Changes

- b60d9d1: Republish so the package resolves for consumers.

  `0.1.0` was published without its `publishConfig` overrides applied, so the
  released manifest kept `exports: { ".": "./src/index.ts" }` while `files` only
  ships `dist`. Every consumer resolving the package hit a missing module, which
  also made `@voyant-travel/app-manifest` unimportable through its dependency on
  this package. No source change is required — the existing `publishConfig` is
  correct and is applied by the release pipeline.

## 0.1.0

### Minor Changes

- ed8610c: Extract the publisher-facing declarative surface out of the host runtime
  modules, so an app publisher can validate and digest a release without
  installing the operator.

  `@voyant-travel/app-manifest` owns the app manifest schema and
  `compileAppManifest`. `@voyant-travel/custom-fields-contracts` and
  `@voyant-travel/webhook-delivery-contracts` carry the two contracts the manifest
  builds on; the latter also gives a publisher `verifyWebhookPayloadSignature`,
  which previously required depending on the whole delivery runtime.

  No behaviour changes. `@voyant-travel/apps/compiler`,
  `@voyant-travel/apps/contracts`, and `@voyant-travel/custom-fields/contracts`
  re-export their previous surface, so existing imports keep working.
