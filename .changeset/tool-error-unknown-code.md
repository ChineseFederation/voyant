---
"@voyant-travel/tools": patch
---

Fix `ToolError` throwing a `TypeError` when constructed with a code outside
`ToolErrorCode`. Domain handlers may raise their own codes, which the MCP
transport forwards verbatim; looking up per-code defaults without a fallback
turned any such throw into an unrelated construction failure and masked the real
error as a generic `PROVIDER_ERROR`. Unknown codes now fall back to the
conservative terminal defaults and keep their code.
