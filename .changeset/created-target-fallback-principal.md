---
"@voyant-travel/action-ledger": patch
---

Let an admitted created-target command name a concrete non-user principal.

`executeAdmittedCreatedTargetCommand` now accepts `fallbackPrincipalId` and
forwards it to the inner command, so a request that authenticates something
other than a user account — a verified storefront guest, for example — ledgers
under its own principal instead of failing the existing `unknown_request`
guard. The fallback is only consulted when the context carries no `userId`, so
it can never displace an authenticated account, and the synthetic identity
stays out of `userId` (and therefore out of `createdByUserId`). The
idempotency scope is now derived from that same concrete principal.
