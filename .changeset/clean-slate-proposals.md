---
"@voyant-travel/proposals": major
"@voyant-travel/proposals-contracts": major
"@voyant-travel/proposals-react": major
"@voyant-travel/bookings": major
"@voyant-travel/commerce": major
"@voyant-travel/legal": major
"@voyant-travel/legal-contracts": major
"@voyant-travel/legal-react": major
"@voyant-travel/relationships": major
"@voyant-travel/relationships-contracts": major
"@voyant-travel/relationships-react": major
"@voyant-travel/mice": major
"@voyant-travel/notifications": major
"@voyant-travel/realtime": major
"@voyant-travel/operator-standard": major
"@voyant-travel/schema-kit": major
"@voyant-travel/trips-react": major
"@voyant-travel/mcp": patch
"@voyant-travel/framework": patch
"@voyant-travel/framework-migrations": patch
"@voyant-travel/i18n": patch
---

Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.
