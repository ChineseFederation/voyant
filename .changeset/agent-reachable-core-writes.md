---
"@voyant-travel/finance": minor
"@voyant-travel/mcp": minor
---

Make the core operator writes reachable from a conversation. Finance gains a
`record_payment` Tool over `POST /finance/invoices/{id}/payments`, which had no
agent-facing front at all, so an agent asked to record a payment correctly
reported that no such action existed. The MCP transport now registers a default
eager set — `book_product` and `record_payment`, promoted only for a caller
authorized for them — instead of defaulting to an empty domain tier that made
every write depend on the consumer admitting the meta-tools; pass
`eagerToolNames: []` to opt out. A read the projection folded into a
`<domain>_query` group now answers with the query tool and `resource` to call
instead of "it does not exist or your grant does not authorize it", over
`call_tool`, the flat name, and `describe_tool`, and is counted as the new
`unreachable` telemetry outcome rather than as an unknown tool.
