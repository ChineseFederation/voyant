---
"@voyant-travel/hono": minor
"@voyant-travel/finance": patch
"@voyant-travel/storefront": patch
---

Check committed OpenAPI documents against the routes actually served.

The published artifacts are the contract, but nothing tied them to the runtime,
so a new route, a removed route, or a renamed request field could all land
without the document noticing — adding `subjectRef` to the public verification
schemas did exactly that.

`diffOpenApiCoverage` (from `@voyant-travel/hono/openapi`) compares a document
generated from the live router against the committed one and reports
undocumented routes, stale operations, and request-field drift. Request bodies
are compared by property and required-field names rather than by full schema,
because generated and hand-authored schemas describe the same contract in
different but equivalent shapes.

Finance and storefront-verification now assert zero drift. Applying the check
surfaced pre-existing drift: three public payment-session operations accept
`providerConnectionId`, which the published document omitted. It is now
documented.
