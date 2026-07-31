---
"@voyant-travel/mcp": minor
---

Rate-limit the MCP JSON-RPC endpoint (`/v1/admin/mcp`) per caller. Every request
is sorted into a `read` bucket (discovery and read-only `tools/call`) or a
tighter `write` bucket (`tools/call` on a non-`read` tier, a `destructive` risk
policy, or an action-ledgered capability), keyed independently so a read burst
never starves writes. Classification reads only existing manifest metadata
(`tier` / `riskPolicy` / `actionPolicy`).

Limits, the window, the per-caller key derivation, and the backing store are
deployment-configurable via the new `rateLimit` option on `createMcpApiRoutes`
and `createGraphMcpApiRoutes` (pass `false` to disable); they default to safe
values (120 reads and 20 writes per key per minute). Exposes
`createMcpRateLimiter`, `isRestrictedTool`, `DEFAULT_MCP_RATE_LIMIT`, and the
`McpRateLimitOptions` / `McpRateLimitBucket` types. This wires the previously
unused `hono-rate-limiter` dependency.
