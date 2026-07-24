---
"@voyant-travel/notifications": major
"@voyant-travel/quotes": major
"@voyant-travel/finance": major
"@voyant-travel/framework": patch
---

Replace every notification mutation path with required-idempotency durable
admission, outbox publication, leased worker delivery, and canonical provider
replay. This major release explicitly supersedes the `0.136.0`
compatibility surface: request-scoped provider sends, `NotificationProvider.send`,
`NotificationService` exports, generic direct-send routes, bundled local/Cloud
provider shims, and optional notification idempotency are no longer supported.
Provider packages now implement the public durable provider port and its
non-delivering restart/replay/drift conformance probe. The send action becomes
available only for the exact selected graph provider that passes that behavioral
contract.

Framework graph resolution now treats an absent external provider package as a
valid disabled state for a conditional action. The action remains unavailable;
selection, typed-port conformance, and ambiguity checks still apply when a
provider is present.
