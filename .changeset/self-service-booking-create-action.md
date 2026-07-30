---
"@voyant-travel/finance": minor
"@voyant-travel/tools": minor
---

Add a separate self-service action over the durable booking-create command.

`create-booking-self-service` is a second action, not a widening of the staff
Tool: it carries its own capability identity (and therefore its own fingerprint
domain), allows only the `customer` actor, is bound to the route transport so
it is unreachable from MCP, and declares a narrow public invocation contract in
which the caller supplies only an idempotency key.

`executeFinanceBookingCreateCommand` is replaced by two explicit entrypoints —
`executeFinanceStaffBookingCreateCommand` and
`executeFinanceSelfServiceBookingCreateCommand` — over one private mutation
core. Each validates exactly one static policy expectation rather than
selecting it from caller-supplied admission metadata, so neither can be driven
by the other's admission. `verify:booking-create-authority` now enforces that
boundary mechanically.

`@voyant-travel/tools` gains `assertAdmittedActionPolicy` for command
entrypoints that hold an admission but no `ToolContext`.
