# @voyant-travel/trips

Deterministic composition layer for customer-facing trips that group multiple
component bookings/orders into one itinerary, pricing, reserve, checkout, and
support experience.

This package is landing on the trips integration branch. It currently
includes the durable schema, Zod contracts, deterministic trip service,
catalog component adapter, checkout handoff, component-level cancellation
preview/cancel operations, Cruise Extension representation helpers, Hono
routes, and MCP tools.

Pricing and reservation have two distinct entry points, and they are not
interchangeable:

- **Staff and storefront composers** call `POST /{envelopeId}/price` and
  `POST /{envelopeId}/reserve` synchronously, dependency-injected exactly like
  checkout and cancellation. A composer price is a *read*: it resolves a
  non-binding v1 Offer Preview per component and aggregates it onto the
  envelope. Both legs answer `501` until the deployment configures their deps.
- **Agents** call the `price_trip` / `reserve_trip` tools, which are
  asynchronous durable operations. The package records an admitted command and
  immutable accepted result before provider dispatch. They remain unavailable
  unless the selected deployment provides `trips.durable-action-runtime` and
  passes behavioral replay, restart reconciliation, payload-drift, and exact
  backend-identity conformance. The framework ships no fallback provider. Use
  `get_trip_action_operation` to read the terminal outcome.

Collapsing the first into the second is what broke trip creation in
[voyant#4601](https://github.com/voyant-travel/voyant/issues/4601): the composer
UIs kept calling routes that no longer existed, and the durable replacement
cannot run on a deployment that selects no provider.

Checkout and cancellation are dependency-injected so app/runtime packages keep
owning payment-provider, bank-transfer, storefront URL, supplier, and
staff-remediation policy. See
`docs/architecture/trips-implementation-plan.md` for the full PR
sequence and remaining slices.

## Install

```bash
pnpm add @voyant-travel/trips
```

## Exports

| Entry | Description |
| --- | --- |
| `.` | Module export |
| `./schema` | Drizzle tables, added in the schema slice |
| `./validation` | Zod contracts |
| `./service` | Deterministic composer services |
| `./tools` | AI-safe trip planning and admitted durable actions |
| `./durable-action-runtime-port` | Exact provider capability and conformance contract |
| `./action-job` | Durable pricing/reservation reconciliation worker |
| `./cruise-extension` | Cruise Extension link and selection helpers |
| `./routes` | Hono route factory/module routes |

## License

Apache-2.0
