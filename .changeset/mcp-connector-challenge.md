---
"@voyant-travel/auth": patch
"@voyant-travel/hono": patch
---

Emit the RFC 9728 `WWW-Authenticate` challenge on the MCP surface, and admit the OAuth endpoints in Voyant Cloud auth mode.

An anonymous request to `/v1/admin/mcp` previously fell through to a bare 401 with no challenge header. That header is the entry point of the connector handshake — an assistant dials the pasted URL with no credential and follows `resource_metadata` from there to discovery — so without it nothing downstream was reachable.

Managed deployments additionally returned 404 for every `/oauth2/*` path, because the cloud-mode allowlist predates them: discovery advertised an authorization server that rejected every request to it.
