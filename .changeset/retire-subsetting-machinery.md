---
"@voyant-travel/hono": minor
---

Remove the ADR-0007 module-subsetting validator from
`@voyant-travel/hono/composition`: `findCapabilityGaps`, `CapabilityDeclaration`,
`CapabilityGraph`, and `CapabilityGap`.

ADR-0007 is superseded and its runtime-manifest implementation was already
deleted; `createVoyantApp` has no `exclude` option, so nothing could reach these
and the only consumer was their own unit test. Modules are components of one
resident deployable, not deployment units — see ADR-0016.
