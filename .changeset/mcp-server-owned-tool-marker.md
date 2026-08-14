---
"@voyant-travel/mcp": minor
---

Mark server-owned MCP tools with `_meta["voyant.travel/server-tool"]`

The guide Tools, the tier-0 meta-tools, and the synthetic `<domain>_query` groups
are owned by the server rather than the tenant registry, so they cannot carry
`voyant.travel/tool` — and until now they carried nothing at all. A client reading
`tools/list` could not tell one of them from a registry Tool whose metadata went
missing, which is the opposite call: skip the first, fail closed on the second.

Each now carries a positive marker with a `kind` of `guide`, `meta`, or
`read-query`, so every advertised entry is classifiable. Purely additive to the
wire format: nothing changes for registry Tools, and a client that ignores `_meta`
on these entries is unaffected.
