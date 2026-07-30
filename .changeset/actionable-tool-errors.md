---
"@voyant-travel/tools": minor
"@voyant-travel/mcp": minor
"@voyant-travel/storefront": patch
---

Make tool errors actionable. `ToolError` now carries `retryable`, `nextSteps`,
and optional `candidates`/`didYouMean` alongside the existing `code`/`meta`. Each
`ToolErrorCode` has a documented remediation and defensible retry semantics
(`AUTHORIZATION_DENIED`, `INVALID_INPUT`, `NOT_FOUND`, a permanent
`PROVIDER_ERROR` and the rest are terminal; only the new transient
`PROVIDER_UNAVAILABLE` is retryable), so a caller can tell "retry" from "stop".
The fields default per code, so existing throw sites stay valid.

`APPROVAL_REQUIRED` and `CONFIRMATION_REQUIRED` now state their exact
remediations ("request approval via request_action_approval, then re-call with
_voyant.approvalId" / "re-call with _voyant.confirmed=true"). The storefront
verification rate limit now reports the transient, retryable
`PROVIDER_UNAVAILABLE` instead of `PROVIDER_ERROR`.

The MCP error envelope in `dispatchToResult` surfaces `retryable`, `nextSteps`,
`candidates`, and `didYouMean` as first-class properties, not buried in `meta`.
