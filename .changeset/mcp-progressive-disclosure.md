---
"@voyant-travel/mcp": minor
"@voyant-travel/tools": patch
---

Progressive disclosure for the MCP tool surface (voyant#3927). `tools/list` used
to serialize every authorized tool on every connection — 264 tools / ~310 KB /
~78k tokens — before the agent had read the request. It now advertises only a
tier-0 of three meta-tools and discovers the long tail on demand:

- `search_tools(query, domain)` — names + one-line descriptions (no schemas).
- `describe_tool(name)` — the full projected input schema, output contract, and
  discovery metadata for one tool.
- `call_tool(name, args)` — dispatch a tool that is not eagerly registered.

Flat-name `tools/call` still dispatches the full authorized surface, so existing
clients keep working unchanged. Authorization is re-checked at both the index
(`search_tools` / `describe_tool`) and the dispatch (`call_tool` / flat name)
layers: an unauthorized tool is neither discoverable nor callable. The
scope-filtered `GET /manifest` index stays fine-grained. Measured for a full-scope
staff key, `tools/list` drops to ~1.5 KB / ~370 tokens (a ~210x reduction).

`McpApiRoutesOptions` gains an optional `eagerToolNames` allowlist to promote
specific tools into the resident tier-0 surface; it defaults to empty.

`ToolError` no longer throws when constructed with a `code` outside the documented
set — it falls back to the terminal `PROVIDER_ERROR` remediation instead of
crashing while computing `retryable`/`nextSteps`.
