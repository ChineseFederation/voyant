---
"@voyant-travel/hono": minor
---

Expose the deployment's observability sink on the request context as
`c.var.reporter` (and `c.var.appName`). `createVoyantApp` already resolved a
`Reporter` for the error boundary, but composed route modules had no way to reach
it, so a module that emitted its own telemetry had to be handed a reporter
through every composition seam — and in practice was handed none, so it emitted
nothing. Falls back to `noopReporter`, so a module may emit unconditionally.
