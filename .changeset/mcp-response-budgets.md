---
"@voyant-travel/mcp": minor
"@voyant-travel/types": patch
---

Response budgets, `response_format`, and guided truncation for the MCP tool
surface (voyant#3928, RFC voyant#3921 Finding 7). Tool responses used to be
uncapped — a single `list_bookings` at the maximum page size could put more into
an agent's context than the entire tool catalog, and unlike the catalog that cost
is charged on every call.

- **Transport-level response budget.** `dispatchToResult` now enforces a
  serialized byte ceiling on every tool result, so the cap covers every tool
  uniformly instead of relying on each domain. Configurable through
  `McpApiRoutesOptions.responseBudgetBytes` / `GraphMcpApiRoutesOptions`;
  defaults to `DEFAULT_RESPONSE_BUDGET_BYTES` (~24 KB).

- **Guided truncation, never silent.** An over-budget list result has whole rows
  dropped until it fits, and the result states how many of the total it is
  showing and which of the tool's own input filters would narrow it (e.g.
  "narrow with `status`, `dateFrom`"). The `content` text and `structuredContent`
  are trimmed to the same row set, `structuredContent` stays valid against the
  untouched output schema, `_meta["voyant.travel/truncation"]` records what was
  withheld, and the call remains a success.

- **`response_format: "concise" | "detailed"`** is advertised on list-shaped
  tools and defaults to `concise`, which renders the text content as compact rows
  projected to their populated scalar fields; `detailed` renders the full nested
  records. `structuredContent` always carries the full-field rows. Measured on a
  booking-shaped list: detailed ~255 tokens/row vs concise ~109 tokens/row — 57%
  smaller — on the `content` block agents read.

Also documents in `@voyant-travel/types` `paginationSchema` that a row count is
not a payload budget (200 bookings and 200 contact points are not the same
bytes): `limit` stays a page-size ergonomic while the MCP byte budget is the real
ceiling on what a response costs an agent's context.
