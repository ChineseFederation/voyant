---
"@voyant-travel/app-manifest": minor
"@voyant-travel/custom-fields-contracts": minor
"@voyant-travel/webhook-delivery-contracts": minor
"@voyant-travel/apps": patch
"@voyant-travel/custom-fields": patch
"@voyant-travel/webhook-delivery": patch
---

Extract the publisher-facing declarative surface out of the host runtime
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
