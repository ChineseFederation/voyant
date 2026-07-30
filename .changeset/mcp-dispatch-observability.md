---
"@voyant-travel/mcp": minor
---

Instrument the MCP transport so agent behaviour is observable. A new
`observability.ts` hangs off the shipped vendor-neutral Reporter seam
(`@voyant-travel/hono/observability`, RFC #1553) — no new logging framework, no
vendor SDK, no `console.log`. The `POST /` handler now emits one structured
event per `tools/call` carrying the tool name, caller identity, granted scopes,
duration, outcome, and — on failure — the error code. Unknown-tool and
argument-validation failures are captured as distinct outcomes (`unknown_tool`,
`validation_error`) rather than blurring into a successful call, and both
`tools/list` and `GET /manifest` emit the served payload size.

Telemetry carries shapes, names, and codes only — never argument or result
payloads (`docs/architecture/booking-pii.md`), covered by a test. Instrumentation
is best-effort and can never break a `tools/call`. `createMcpApiRoutes` and
`createGraphMcpApiRoutes` accept an optional `reporter` and `appName`, defaulting
to the no-op reporter so the behaviour is opt-in.
