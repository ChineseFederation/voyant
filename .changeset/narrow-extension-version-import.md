---
"@voyant-travel/app-manifest": patch
---

Read the admin extension version from its narrow subpath.

The control plane reads `VOYANT_APP_CONTRACT_VERSIONS` inside a Worker, where
the SDK's iframe client is dead weight. `@voyant-travel/admin-extension-sdk/version`
carries the constant on its own.
