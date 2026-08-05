---
"@voyant-travel/auth": patch
"@voyant-travel/runtime": patch
---

Resolve the storefront sales channel on both auth profiles, not just self-host.

A managed deployment supplies its own `resolveCustomerAuthContext`, which brokers
storefront credentials through a control plane that has no channel concept. The
returned context therefore never carried `storefrontChannel`, so every
`/v1/public/*` catalog read answered `403 Public storefront channel context is
required.` on a guard that profile could never satisfy — while the
Storefront -> Channel link rows sat unread in the deployment database.

The runtime now decorates a host-supplied resolver with
`withResolvedStorefrontChannel`, which reads that binding through the existing
link-service provider and fills in the channel the host could not know. A
context that already carries a channel is returned untouched, and a lookup that
cannot resolve one leaves the host's context alone rather than failing the
request — the downstream guards still apply.

Each state in which a public request ends up without a channel (storefront not
resolved here, no binding, binding inactive) is now logged as a distinguishable
warning, so the identical 403 they all produce can be told apart from outside.
