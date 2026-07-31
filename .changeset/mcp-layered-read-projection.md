---
"@voyant-travel/mcp": minor
---

Collapse the read tool surface into per-domain query tools (layered read
projection, voyant#3932).

**Breaking change.** The ~133 flat read tools (`get_*`, `list_*`, `search_*`)
are removed as individually discoverable or callable MCP tools. Each domain's
reads are now reached through one `<domain>_query` tool whose input is a
discriminated union on `resource` — `inventory_query({ resource: "products",
… })`, `bookings_query({ resource: "booking", bookingId })`. The projection is
pure transport-layer: no domain `tools.ts` changed, grouping is derived from the
`owner` each `ToolManifestEntry` already carries.

Scope filtering prunes resources WITHIN a group, so an unauthorized read is
neither a discoverable resource nor a callable one — its query tool simply omits
it, and a group with no authorized read never appears. Writes are NOT collapsed:
their per-action risk, confirmation, ledger and approval policy stay one Tool
each. `GET /v1/admin/mcp/manifest` stays fine-grained — it is the capability
index, not the agent surface.

Migration: replace a flat read call `list_products({ status })` with
`inventory_query({ resource: "products", status })`; discover the query tool for
a record with `search_tools` (search the record noun, e.g. `products`,
`bookings`) and read its discriminated-union schema with `describe_tool`.

This measurably lowers agent discovery cost on the real composed graph: the
six-journey real-surface discovery eval drops from ~48,553 to ~36,974 tokens,
and the aggregate describe schema of the read surface falls from ~433,234 to
~115,559 bytes.
