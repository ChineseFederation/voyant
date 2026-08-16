# Voyant Travel NPM Publish Checklist

This repository now publishes package identities under `@voyant-travel/*`.
The external SDK dependencies listed below are also published under
`@voyant-travel/*`, so the operator starter no longer needs legacy npm alias
targets.
Do not change workspace package `name` fields back to the legacy scope.

Temporary dependency aliases: none.

Resolved external dependencies:

- `@voyant-travel/cli@^0.26.0`
- `@voyant-travel/cloud-sdk@^0.9.0`
- `@voyant-travel/data-sdk@^0.5.0`
- `@voyant-travel/connect-adapter@0.3.0`
- `@voyant-travel/connect-cruises@0.4.0`
- `@voyant-travel/connect-provider-sdk@0.5.0`
- `@voyant-travel/connect-sdk@0.9.0`

Known publish blockers: none.

Publishable workspace package names at this point:

- `@voyant-travel/accommodations-contracts`
- `@voyant-travel/accommodations`
- `@voyant-travel/action-ledger-react`
- `@voyant-travel/action-ledger`
- `@voyant-travel/admin-app`
- `@voyant-travel/admin-client`
- `@voyant-travel/admin-contracts`
- `@voyant-travel/admin-react`
- `@voyant-travel/admin`
- `@voyant-travel/auth-react`
- `@voyant-travel/auth`
- `@voyant-travel/bookings-contracts`
- `@voyant-travel/bookings-react`
- `@voyant-travel/bookings`
- `@voyant-travel/catalog-authoring`
- `@voyant-travel/catalog-contracts`
- `@voyant-travel/catalog-react`
- `@voyant-travel/catalog`
- `@voyant-travel/charters-contracts`
- `@voyant-travel/charters-react`
- `@voyant-travel/charters`
- `@voyant-travel/commerce-react`
- `@voyant-travel/commerce`
- `@voyant-travel/core`
- `@voyant-travel/cruises-contracts`
- `@voyant-travel/cruises-react`
- `@voyant-travel/cruises`
- `@voyant-travel/db`
- `@voyant-travel/distribution-react`
- `@voyant-travel/distribution`
- `@voyant-travel/extras-contracts`
- `@voyant-travel/finance-contracts`
- `@voyant-travel/finance-react`
- `@voyant-travel/finance`
- `@voyant-travel/flights-contracts`
- `@voyant-travel/flights-react`
- `@voyant-travel/flights`
- `@voyant-travel/hono`
- `@voyant-travel/i18n`
- `@voyant-travel/identity-contracts`
- `@voyant-travel/identity-react`
- `@voyant-travel/identity`
- `@voyant-travel/inventory-react`
- `@voyant-travel/inventory`
- `@voyant-travel/legal-contracts`
- `@voyant-travel/legal-react`
- `@voyant-travel/legal`
- `@voyant-travel/notifications-react`
- `@voyant-travel/notifications`
- `@voyant-travel/operations-react`
- `@voyant-travel/operations`
- `@voyant-travel/plugin-netopia`
- `@voyant-travel/plugin-sanity-cms`
- `@voyant-travel/plugin-smartbill`
- `@voyant-travel/products-contracts`
- `@voyant-travel/proposals-contracts`
- `@voyant-travel/proposals-react`
- `@voyant-travel/proposals`
- `@voyant-travel/react`
- `@voyant-travel/relationships-contracts`
- `@voyant-travel/relationships-react`
- `@voyant-travel/relationships`
- `@voyant-travel/schema-kit`
- `@voyant-travel/storage`
- `@voyant-travel/public-api-react`
- `@voyant-travel/public-api-client`
- `@voyant-travel/public-api`
- `@voyant-travel/suppliers-contracts`
- `@voyant-travel/templating`
- `@voyant-travel/trips-react`
- `@voyant-travel/trips`
- `@voyant-travel/types`
- `@voyant-travel/ui`
- `@voyant-travel/utils`
- `@voyant-travel/vite-config`
- `@voyant-travel/runtime-core`

Regenerate this list with:

```sh
node - <<'NODE'
const fs = require("fs");
const { execSync } = require("child_process");
const files = execSync("rg --files -g package.json", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);
for (const file of files) {
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  if (pkg.name?.startsWith("@voyant-travel/") && pkg.private !== true) {
    console.log(`${pkg.name}@${pkg.version ?? "0.0.0"}\t${file}`);
  }
}
NODE
```
