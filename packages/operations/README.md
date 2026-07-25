# @voyant-travel/operations

Operations owns operated execution truth: availability, allocation resources,
resource pools, ground logistics, and places.

New code should import owner paths such as `@voyant-travel/operations/availability`,
`@voyant-travel/operations/resources`, `@voyant-travel/operations/ground`, and
`@voyant-travel/operations/places`. The beta slice package names are not part of the
v1 workspace package surface.

## Agent Tools

`@voyant-travel/operations/tools` contributes staff-only, read-only availability Tools and
their request-scoped service context. The surface covers overview and KPI aggregates,
recurrence-rule list/detail, start-time list, departure list/detail, and closeout list. Write
operations remain intentionally absent until their action-ledger and argument-dependent risk
policies are designed.

`@voyant-travel/operations/dashboard` is a separately selectable composed module. Its
`get_operator_dashboard_summary` Tool coordinates the
provider-neutral aggregate services injected by Bookings, Finance, Inventory, Distribution, and
Operations. The Tool requires every underlying read scope with AND semantics; it does not query
another module's tables or move aggregate authority into Operations. Its output carries the
resolved UTC range, structural source projections, compact KPIs, and bounded operational alerts.
