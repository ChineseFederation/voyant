---
"@voyant-travel/auth": patch
"@voyant-travel/auth-react": patch
"@voyant-travel/operator-settings-react": patch
---

Let ChatGPT Web and Claude Web actually complete the MCP connector handshake.

Two contracts disagreed with themselves. Discovery advertised `mcp:read`,
`mcp:write`, and `offline_access`, but a dynamic registration that omits `scope`
— which is what a hosted client sends — was stored with `mcp:read` alone, so
`authorize` answered the server's own advertised scopes with `invalid_scope`.
The registration default now matches what discovery publishes; an explicit
`scope` on the registration is still binding, and the operator consent screen
plus the staff-derived permission filter remain the authorization boundaries.

The consent screen and the MCP settings page then spelled the admin realm into
URLs that the shell's realm-scoping fetcher scopes on their behalf, producing
`/api/auth/admin/admin/oauth2/...` and a 404 on every consent decision, consent
lookup, and connector listing. Those requests are written on the shared `/auth`
prefix now, and a failed consent reports its status and the server's own error
detail instead of one indistinguishable sentence.
