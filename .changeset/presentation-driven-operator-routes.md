---
"@voyant-travel/core": minor
"@voyant-travel/framework": minor
"@voyant-travel/operator-standard": minor
"@voyant-travel/auth": minor
"@voyant-travel/storefront": minor
"@voyant-travel/finance": minor
"@voyant-travel/quotes": minor
"@voyant-travel/mcp": minor
---

Make `createStandardOperatorRouteFiles` a pure function of resolved
deployment-graph data (voyant#3976 item 10.1).

The standard operator route generator previously hardcoded the presentation
IDs and route tables for auth, storefront, finance, quotes, and MCP consent, so
a package could not get admin routes emitted without editing
`@voyant-travel/operator-standard`. Each presentation now declares its own
route contribution on its `presentations` graph entry via `contribution` and
`routes`, and the generator emits from those declarations.

`VoyantGraphPresentationDeclaration` gains optional `contribution` and `routes`
fields (`VoyantGraphPresentationRouteDeclaration`), validated in the deployment
graph: when `routes` is non-empty, `contribution` must be a non-empty string,
each `route` must start with `/`, and each `member` must be a non-empty string.
The product BOM now carries the full presentation declarations rather than just
their IDs. This is a behaviour-preserving refactor — the emitted route-file set
is byte-identical to before.
