---
"@voyant-travel/notifications": patch
---

Fix storefront contact verification failing with `provider.send is not a
function`. The `storefront.verification.runtime` contribution handed the app's
configured `NotificationProvider` set straight to Storefront, whose provider
contract expects a bare `send(payload)` — the two shapes agree on `name` and
`channels` (enough for channel routing to succeed) but a `NotificationProvider`
only delivers through `durableDelivery`, so every
`POST /v1/public/storefront-verification/{email,sms}/start` returned 400 and
guest booking stayed blocked behind `401 verification_required`.

`resolveProviders` now adapts each provider, delivering through
`durableDelivery` under a payload-derived idempotency key, so an identical
challenge replays instead of re-sending while a freshly minted code always
sends. A provider without a durable capability now fails closed naming itself
rather than throwing a bare `TypeError`.

The two contracts are also pinned against each other at compile time: the
config primitive's untyped read is narrowed to `NotificationProvider` once, and
the payload/result shapes are asserted assignable, so drift in either package
breaks the build instead of a shopper's checkout.
