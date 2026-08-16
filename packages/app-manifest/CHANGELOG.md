# @voyant-travel/app-manifest

## 0.2.5

### Patch Changes

- Updated dependencies [b78b724]
  - @voyant-travel/graph-contracts@0.7.0

## 0.2.4

### Patch Changes

- Updated dependencies [36f3085]
  - @voyant-travel/graph-contracts@0.6.0

## 0.2.3

### Patch Changes

- Updated dependencies [1e0506f]
  - @voyant-travel/graph-contracts@0.5.0

## 0.2.2

### Patch Changes

- Updated dependencies [4f9a097]
  - @voyant-travel/graph-contracts@0.4.0

## 0.2.1

### Patch Changes

- 7d3ace7: Read the admin extension version from its narrow subpath.

  The control plane reads `VOYANT_APP_CONTRACT_VERSIONS` inside a Worker, where
  the SDK's iframe client is dead weight. `@voyant-travel/admin-extension-sdk/version`
  carries the constant on its own.

## 0.2.0

### Minor Changes

- 7de4013: Define every app compatibility version once, in the package a publisher can install.

  `VOYANT_APP_CONTRACT_VERSIONS` collects the versions an app declares itself
  compatible with — the dated `/v1/app/*` surface, the manifest schema, the admin
  extension protocol major, and the event catalog — each derived from the constant
  that owns it rather than restated as a literal. They were previously written out
  by hand wherever a check needed them, including in another repository, so
  nothing connected a bump to the checks meant to enforce it.

  `APP_API_VERSION` moves here from `@voyant-travel/apps` and is re-exported from
  its old path. The old home is a private package: a publisher pinning
  `appApiVersions` could not read the contract they were pinning to.

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

### Patch Changes

- Updated dependencies [ed8610c]
  - @voyant-travel/custom-fields-contracts@0.1.0
  - @voyant-travel/webhook-delivery-contracts@0.1.0
