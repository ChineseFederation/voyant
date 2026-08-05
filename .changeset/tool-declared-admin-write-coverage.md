---
"@voyant-travel/graph-contracts": patch
---

feat(graph-contracts): let a Tool declare the admin write endpoints it fronts

`VoyantGraphToolDeclaration` gains an optional `adminWrites`, the list of admin
OpenAPI paths a Tool is the agent surface for.

Admin write coverage is otherwise inferred from a Tool's name, and that
inference reads the resource's trailing noun. Two resources whose noun is the
same word are therefore indistinguishable: `attach_departure_fleet_resource`,
which links an existing fleet record to one departure, also satisfied
`/v1/admin/operations/resources` — create, rename and delete of the coach
itself. Where the colliding word *is* the noun there is no name that avoids it,
so the Tool states its endpoints instead. A declaration is exhaustive: a Tool
that declares covers the resources behind those paths and no others.
