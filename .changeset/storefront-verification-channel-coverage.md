---
"@voyant-travel/storefront": patch
---

Make an undeliverable storefront verification channel diagnosable before a
shopper hits it.

Both verification start routes mount unconditionally, so a deployment whose
notification providers cover only email looks healthy until a guest who gave a
phone number is answered with
`501 {"error":"No verification notification provider registered for channel
\"sms\"","code":"sender_not_configured"}` — and, because booking creation
requires a verified contact, cannot book at all.

The provider set comes from configuration, so the gap is knowable at boot.
`createStorefrontVerificationApiModule`'s bootstrap now reports it: it names the
undeliverable channels, says those routes will answer 501, and lists what is
deliverable. The `sender_not_configured` message itself now names the channels
that *are* covered, so an operator reading the response learns the provider set
resolved and only misses this channel, and a storefront learns which route to a
verified contact still works. An explicitly requested but unregistered provider
is now named rather than reported as a missing channel.

New public API: `resolveStorefrontVerificationChannelCoverage(bindings, options)`
reports `{ supported, unsupported }`, and
`buildStorefrontVerificationSenderBundle(bindings, options)` returns the senders
and that coverage from a single resolution of the provider set — the app's
resolver still runs exactly once per bootstrap, and not at all when every
channel has an injected sender. `buildStorefrontVerificationSenders` is
unchanged and now delegates to the bundle.

This does not supply an SMS-capable provider; that is provider configuration,
not a change this package can make.
