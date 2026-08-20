---
"@voyant-travel/auth": patch
"@voyant-travel/bookings": patch
"@voyant-travel/db": patch
"@voyant-travel/mcp": patch
"@voyant-travel/operator-settings-react": patch
---

Add a deployment-wide MCP tool exposure policy with safe defaults, risk-level,
write, and sensitive-data controls, plus per-tool overrides. Enforce the policy
consistently in tool discovery and invocation, while keeping staff permissions
and OAuth scopes as hard upper bounds.
