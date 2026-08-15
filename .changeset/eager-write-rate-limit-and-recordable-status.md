---
"@voyant-travel/finance": patch
"@voyant-travel/mcp": patch
---

Follow-ups from the review of the core-operator-writes change. The MCP rate
limiter now picks its bucket from the tool a request will DISPATCH rather than
the name on the envelope, so a write reached through `call_tool` — the ordinary
way to reach anything non-eager — is charged to the tight write bucket instead
of the loose read one, and a client namespace prefix (`functions.x`) can no
longer downgrade it either. `record_payment` accepts only the two recordable
payment states: `failed` and `refunded` were inserted and then ignored by the
balance recomputation, so the agent reported success against an invoice that
never moved. The server instructions and the `discovery` guide topic now name
the eager writes this caller actually received rather than the configured
default, so a read-only key, an opted-out deployment, or a graph without those
tools is no longer told a resident tool it cannot see.
