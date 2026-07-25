---
"@voyant-travel/setup": major
"@voyant-travel/navigation-preferences": major
"@voyant-travel/navigation-preferences-react": major
"@voyant-travel/operations": major
"@voyant-travel/legal": major
"@voyant-travel/legal-react": major
"@voyant-travel/relationships": major
"@voyant-travel/inventory": major
"@voyant-travel/finance": major
"@voyant-travel/finance-react": major
"@voyant-travel/operator-standard": major
---

Remove callable Tool name aliases from the standard Operator graph. MCP and
other callers must use canonical Tool names only; previous compatibility names
(for example `crm_*`, `legal_contract_*`, `availability_*`, `dashboard_summary`,
`read_setup_state`, `products_compose`, `invoices_issue_from_booking`) no longer
dispatch.

Stop publicly exporting the deprecated Relationships Tools
`add_relationship_note`, `add_relationship_contact_method`, and
`add_relationship_address`. Use the person- or organization-specific add Tools
selected by the graph instead.

See the consolidated [caller migration
page](../docs/migrations/removed-tool-aliases.md) for the complete old →
canonical name mapping.
