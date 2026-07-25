---
"@voyant-travel/tools": minor
"@voyant-travel/mcp": minor
"@voyant-travel/action-ledger": minor
"@voyant-travel/accommodations": patch
"@voyant-travel/auth": patch
"@voyant-travel/bookings": patch
"@voyant-travel/catalog": patch
"@voyant-travel/charters": patch
"@voyant-travel/commerce": patch
"@voyant-travel/cruises": patch
"@voyant-travel/distribution": patch
"@voyant-travel/finance": patch
"@voyant-travel/flights": patch
"@voyant-travel/identity": patch
"@voyant-travel/inventory": patch
"@voyant-travel/legal": patch
"@voyant-travel/mice": patch
"@voyant-travel/quotes": patch
"@voyant-travel/relationships": patch
"@voyant-travel/setup": patch
"@voyant-travel/storefront": patch
"@voyant-travel/trips": patch
---

Move generic MCP action targets, idempotency fingerprints, and approval preflight
behind a discoverable server-owned Tool contract. Migrated packages resolve ledger
targets from validated input, approval-required calls return structured server-issued
approval metadata, and exact retries are validated against the stored command and
principal. Route every handler-created target through the selected Tool admission,
remove the raw created-target executor from the public package surface, and reject
future package-level bypasses during manifest convergence. Validate graph risk
against the loaded Tool tier before release and keep the Operator MCP health check
from accepting startup failures.
