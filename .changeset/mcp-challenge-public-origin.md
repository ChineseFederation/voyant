---
"@voyant-travel/hono": patch
---

Build the MCP RFC 9728 challenge from the configured public address instead of the request origin. Behind an edge that terminates TLS and rewrites `Host` to the upstream service, the request carries the internal origin, so the `WWW-Authenticate` header advertised a `resource_metadata` URL the client could not reach and the connector handshake died at its first hop. The challenge now reads `API_BASE_URL`, then `APP_URL`, `DASH_BASE_URL`, and the first `CORS_ALLOWLIST` entry — the same configuration the issuer and the protected-resource document derive from — and falls back to the request origin only when none is configured.
