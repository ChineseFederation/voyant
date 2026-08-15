---
"@voyant-travel/core": minor
"@voyant-travel/runtime": minor
---

Bind the observability sinks a served deployment ships with.

`analytics.runtime` had no provider anywhere in the repository, so every
deployment ran with the booking engine's `engine.*` events — including
`engine.hold.failed` and its `failure_reason` — reaching `noopAnalytics`. The
runtime now binds `consoleAnalytics`, a new built-in sink writing one JSON line
per event to stdout, unless the project supplies its own `analytics.runtime`; a
deployment that wants silence binds `noopAnalytics` explicitly.

The reporter was hard-coded to `consoleReporter`, which left the first-party
Sentry adapter unreachable from a generated project. `host.reporter` now accepts
the deployment's own `Reporter`, with the console one as the default.
