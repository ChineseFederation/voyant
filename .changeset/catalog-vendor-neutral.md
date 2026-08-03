---
"@voyant-travel/catalog": minor
"@voyant-travel/plugin-voyant-connect": minor
---

Remove the last vendor references from the catalog spine.

`offers-runtime` resolved its offers client by importing
`@voyant-travel/connect-sdk` directly, contradicting the design already stated
in `offers/operator-routes.ts` — *"the package never imports
`@voyant-travel/connect-sdk`"*. The channel now supplies that client through
`CatalogSourcesRuntimeExtension.createOffersClient`, and catalog no longer
depends on the SDK.

`BookingEngineEnv` named seven `VOYANT_*`/`VOYANT_CONNECT_*` variables that
nothing in catalog read; they were passed straight to the channel. It is now an
opaque environment record.
