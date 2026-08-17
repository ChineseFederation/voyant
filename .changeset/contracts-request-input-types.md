---
"@voyant-travel/public-api-contracts": minor
"@voyant-travel/public-api": patch
---

Derive the customer-portal request-body aliases from `z.input` rather than
`z.infer`. `z.infer` is the schema's OUTPUT type, so a field carrying
`.default()` read as required and a caller could not satisfy it — every consumer
had to re-derive its request types by hand. `BootstrapCustomerPortalParsed` and
`CreateCustomerPortalCompanionParsed` expose the post-parse shapes the server
needs.
