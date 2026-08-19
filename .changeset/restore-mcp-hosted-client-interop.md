---
"@voyant-travel/auth": patch
"@voyant-travel/auth-react": patch
"@voyant-travel/operator-settings-react": patch
---

Restore ChatGPT and Claude remote MCP connector interoperability. Scope-less
dynamic registrations now match authorization-server discovery, resource
metadata advertises only resource-enforced scopes, and admin-shell OAuth calls
are scoped into the admin realm exactly once.
