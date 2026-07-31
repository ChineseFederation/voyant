---
"@voyant-travel/tools": minor
"@voyant-travel/mcp": minor
"@voyant-travel/finance": patch
---

Three fixes found by driving the MCP surface as a real client rather than a
scripted one.

`ToolDefinition` gains `resolvesIdempotencyKeyServerSide`. A handler-enforced
ledgered `execute` previously advertised `idempotencyKey` as caller-required
unconditionally, so `book_product` — whose purpose is that no token crosses
calls — told agents to supply the very thing it resolves for them.

A `<domain>_query` result now applies the concise projection to
`structuredContent`, not only the text block. Query tools advertise a permissive
output schema, so trimming cannot fail validation; a client reading structured
content previously saw none of the concise saving. Measured 52% smaller.

Server instructions distinguish a key that authorizes nothing from a read-only
one, instead of claiming reads work when every query returns empty.
