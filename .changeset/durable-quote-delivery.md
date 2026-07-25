---
"@voyant-travel/quotes": major
"@voyant-travel/quotes-react": major
"@voyant-travel/notifications": minor
"@voyant-travel/operator-standard": patch
---

Replace the quarantined quote snapshot-and-send flow with one handler-admitted
durable command bound to the exact selected Notifications provider. Snapshot,
sent state, provider identity, durable delivery enqueue, action claim, and
replay result now commit atomically; provider execution remains worker-only.
The durable-send worker now resolves that same selected graph runtime instead
of rebuilding providers from host configuration.

Remove public quote acceptance's direct Trip reserve, cancellation, and
checkout authority. Public acceptance now records only the Quotes lifecycle
decision, while reservation and checkout remain separate approved domain
actions.

Remove the historical quote lifecycle Tool aliases; only canonical names and
stable capability IDs remain.
