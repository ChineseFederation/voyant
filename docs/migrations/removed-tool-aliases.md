# Removed callable Tool name aliases

## TL;DR

- The standard Operator graph no longer dispatches 35 compatibility Tool-name
  aliases (`crm_*`, `legal_contract_*`, `availability_*`, `dashboard_summary`,
  `read_setup_state`, and others below); callers must use the canonical name.
- Relationships stops publicly exporting three deprecated add Tools
  (`add_relationship_note`, `add_relationship_contact_method`,
  `add_relationship_address`); use the person- or organization-specific add
  Tool the graph already selects instead.
- No input/output schema, HTTP route, or hook signature changed — only Tool
  dispatch names. Update the `name` (or MCP Tool id) used to invoke each Tool.
- `@voyant-travel/operator-standard` is bumped major alongside every changed
  module because it distributes all of them via
  `STANDARD_OPERATOR_DISTRIBUTION_POLICY`; consumers on the standard
  distribution get every alias removal in one release.
- No database schema migration is required.

## Removed exports

None of these packages removed exported functions, types, or React hooks.
The removals are Tool **dispatch names** — the `aliases` entry a caller could
use in place of the canonical `name` when invoking the Tool through MCP or the
in-process Tool registry. The canonical Tool (same handler, same
input/output schema) is unaffected.

### Setup (`@voyant-travel/setup`)

| Removed alias | Canonical Tool |
| --- | --- |
| `read_setup_state` | `get_setup_state` |
| `start_setup` | `initialize_setup` |
| `mark_setup_step_complete` | `complete_setup_step` |
| `mark_setup_step_skipped` | `skip_setup_step` |

### Navigation preferences (`@voyant-travel/navigation-preferences`)

| Removed alias | Canonical Tool |
| --- | --- |
| `read_navigation_preferences` | `get_navigation_preferences` |
| `update_organization_navigation_preferences` | `set_organization_navigation_preferences` |
| `update_my_navigation_preferences` | `set_my_navigation_preferences` |

### Operations (`@voyant-travel/operations`)

| Removed alias | Canonical Tool |
| --- | --- |
| `availability_overview` | `get_availability_overview` |
| `availability_rules_list` | `list_availability_rules` |
| `availability_rule_get` | `get_availability_rule` |
| `availability_start_times_list` | `list_availability_start_times` |
| `departures_list_by_product` | `list_departures` |
| `departures_get` | `get_departure` |
| `availability_closeouts_list` | `list_availability_closeouts` |
| `dashboard_summary` | `get_operator_dashboard_summary` |

### Legal (`@voyant-travel/legal`)

| Removed alias | Canonical Tool |
| --- | --- |
| `legal_contract_list` | `list_legal_contracts` |
| `legal_contract_get` | `get_legal_contract` |
| `legal_contract_create` | `create_legal_contract_draft` |
| `legal_contract_attachments_list` | `list_contract_attachments` |

### Relationships (`@voyant-travel/relationships`)

| Removed alias | Canonical Tool |
| --- | --- |
| `crm_people_list` | `list_people` |
| `crm_people_get` | `get_person` |
| `crm_person_create` | `create_person` |
| `crm_person_update` | `update_person` |
| `crm_organizations_list` | `list_organizations` |
| `crm_organizations_get` | `get_organization` |
| `crm_organization_create` | `create_organization` |
| `crm_organization_update` | `update_organization` |
| `crm_notes_list` | `list_relationship_notes` |
| `crm_note_update` | `update_relationship_note` |
| `crm_contact_methods_list` | `list_relationship_contact_methods` |
| `crm_contact_method_update` | `update_relationship_contact_method` |
| `crm_addresses_list` | `list_relationship_addresses` |
| `crm_address_update` | `update_relationship_address` |

Three deprecated Tools are no longer exported at all (not just renamed) —
their alias also stopped dispatching:

| Removed deprecated Tool | Removed alias | Replacement |
| --- | --- | --- |
| `add_relationship_note` | `crm_note_add` | `add_person_note` / `add_organization_note` |
| `add_relationship_contact_method` | `crm_contact_method_add` | `add_person_contact_method` / `add_organization_contact_method` |
| `add_relationship_address` | `crm_address_add` | `add_person_address` / `add_organization_address` |

The graph already selects the person- or organization-specific add Tool for
the entity kind in scope; callers do not choose between them explicitly.

### Inventory (`@voyant-travel/inventory`)

| Removed alias | Canonical Tool |
| --- | --- |
| `products_compose` | `compose_product` |

### Finance (`@voyant-travel/finance`)

| Removed alias | Canonical Tool |
| --- | --- |
| `invoices_issue_from_booking` | `issue_invoice_from_booking` |

## Caller-code migrations

Before:

```ts
await callTool("crm_person_create", { firstName: "Ana", lastName: "Popescu" })
await callTool("dashboard_summary", {})
await callTool("read_setup_state", {})
```

After:

```ts
await callTool("create_person", { firstName: "Ana", lastName: "Popescu" })
await callTool("get_operator_dashboard_summary", {})
await callTool("get_setup_state", {})
```

MCP clients that list Tools by name (rather than hardcoding an alias) are
unaffected — the canonical names were already present alongside every alias
removed here.

## Per-package CHANGELOG links

- [`@voyant-travel/setup`](../../packages/setup/CHANGELOG.md)
- [`@voyant-travel/navigation-preferences`](../../packages/navigation-preferences/CHANGELOG.md)
- [`@voyant-travel/navigation-preferences-react`](../../packages/navigation-preferences-react/CHANGELOG.md)
- [`@voyant-travel/operations`](../../packages/operations/CHANGELOG.md)
- [`@voyant-travel/legal`](../../packages/legal/CHANGELOG.md)
- [`@voyant-travel/legal-react`](../../packages/legal-react/CHANGELOG.md)
- [`@voyant-travel/relationships`](../../packages/relationships/CHANGELOG.md)
- [`@voyant-travel/inventory`](../../packages/inventory/CHANGELOG.md)
- [`@voyant-travel/finance`](../../packages/finance/CHANGELOG.md)
- [`@voyant-travel/finance-react`](../../packages/finance-react/CHANGELOG.md)
- [`@voyant-travel/operator-standard`](../../packages/operator-standard/CHANGELOG.md)
