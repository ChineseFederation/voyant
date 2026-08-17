# Operator registry classification (Phase 2 / Workstream B prerequisite)

- **Status:** Implemented
- **Date:** 2026-07-10
- **Feeds:** `consolidated-deployments-rfc.md` → Workstream B (`createOperatorApp`).

Before relocating the composition registry into a versioned `createOperatorApp`, every
entry must be classified — **standard framework** (moves into the `createOperatorApp`
default set, with deployment specifics injected as `providers`) vs **deployment-local**
(stays in the deployment, passed via `extensions[]`). Relocating before classifying is
how operator-specific choices get baked into the framework package — the failure mode
this whole effort exists to avoid.

Source: `apps/operator/src/api/composition.ts` `OPERATOR_RUNTIME_MANIFEST`.

## `@voyant-travel/*` entries

All standard `@voyant-travel/*` modules and extensions are package-delivered.
Subpath compatibility keys are normalized to package-scoped graph fragments,
for example `@voyant-travel/catalog/booking-engine` becomes
`@voyant-travel/catalog#booking-engine` in the resolved graph.

## Canonical package compatibility keys

Package ownership is now reflected directly in both the runtime registry key and
the deployment graph id. The runtime factories remain compatibility bridges
until graph-generated runtime consumption lands; provider injection does not
make a route family operator-owned.

### Modules

| Former entry | Canonical key | Routes/logic live in | Deployment injects |
| --- | --- | --- | --- |
| `operator/catalog-booking` | `@voyant-travel/catalog/booking-engine` | Catalog booking engine | connect client, source registry, owned handlers, tax settings |
| `operator/catalog-content` | Split into package extensions below | Inventory, cruises, and accommodations content | source registry and search runtime |
| `operator/media` | `@voyant-travel/storage` plus inventory brochure extension | Storage and inventory | R2 storage, video signer, brochure printer |
| `operator/payment-link` | `@voyant-travel/finance/payment-link-routes` | Storefront | card-payment seam, bank transfer, trip readers |

The operator also selects `@voyant-travel/charters`,
`@voyant-travel/cruises`, `@voyant-travel/realtime`, and
`@voyant-travel/mice` as package base units. Their current starter factories are
runtime compatibility bridges keyed by those package ids, not local graph
ownership.

### Extensions

| Former entry | Canonical key | Deployment injects |
| --- | --- | --- |
| `operator/catalog-content` | `@voyant-travel/inventory/content-extension`, `@voyant-travel/cruises/content-extension`, `@voyant-travel/accommodations/content-extension` | source registry and content policy |
| `operator/media` | `@voyant-travel/inventory/brochure-extension` | storage and brochure printer |
| `operator/booking-schedule-extension` | `@voyant-travel/finance/booking-schedule-extension` | payment-policy readers and settings |
| `operator/proposal-version-snapshot-extension` | `@voyant-travel/proposals/proposal-version-snapshot-extension` | reserve/snapshot dependencies |
| `operator/booking-maintenance-extension` | `@voyant-travel/commerce/booking-maintenance-extension` | finance tax recompute |
| `operator/action-ledger-health-extension` | `@voyant-travel/action-ledger/health-extension` | vertical drift checks |
| `operator/proposal-extension` | `@voyant-travel/proposals/proposal-extension` | reserve/start-checkout dependencies and public URL |
| `operator/catalog-offers-extension` | `@voyant-travel/catalog/offers-extension` | search and airport labels |
| `operator/catalog-checkout-extension` | `@voyant-travel/commerce/catalog-checkout-extension` | card payment, tax, and bank transfer |

## Result

- Only `operator/invitations`, `operator/team`, and `operator/mcp` are genuine
  deployment-local graph modules. MCP remains local because its tenant/tool
  context belongs to the deployment, even though its route implementation uses
  package services.
- `@voyant-travel/operator-settings` is now a standard package module.
- Workflow descriptors are facets of their package modules. There is no
  aggregate `@voyant-travel/operator#workflows` identity: bookings owns stale
  hold expiry, notifications owns reminder delivery/scheduling, and inventory
  owns product PDF generation.
