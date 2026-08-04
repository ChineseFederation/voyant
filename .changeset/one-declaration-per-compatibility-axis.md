---
"@voyant-travel/app-manifest": minor
"@voyant-travel/apps": patch
"@voyant-travel/mcp": patch
---

Define every app compatibility version once, in the package a publisher can install.

`VOYANT_APP_CONTRACT_VERSIONS` collects the versions an app declares itself
compatible with — the dated `/v1/app/*` surface, the manifest schema, the admin
extension protocol major, and the event catalog — each derived from the constant
that owns it rather than restated as a literal. They were previously written out
by hand wherever a check needed them, including in another repository, so
nothing connected a bump to the checks meant to enforce it.

`APP_API_VERSION` moves here from `@voyant-travel/apps` and is re-exported from
its old path. The old home is a private package: a publisher pinning
`appApiVersions` could not read the contract they were pinning to.
