---
"@voyant-travel/admin-extension-sdk": minor
"@voyant-travel/admin": minor
"@voyant-travel/apps": minor
---

Publish the admin UI extension slot vocabulary from the contract package.

`ADMIN_UI_EXTENSION_SLOTS` and `AdminUiExtensionSlot` now live in
`@voyant-travel/admin-extension-sdk`, which is the dependency-free package an
extension author already installs. `@voyant-travel/admin` and
`@voyant-travel/apps` derive from it instead of restating it.

The list was previously maintained twice — once in
`packages/admin/src/ui-extensions/registry.ts` for the shell that renders the
slots, and once in `packages/apps/src/contracts.ts` as the enum the manifest
schema validates against. They agreed only by discipline, and a slot added to
one would have been rejected by the schema or left unrendered by the shell.

`@voyant-travel/admin` keeps exporting `ADMIN_UI_EXTENSION_SLOTS`,
`AdminUiExtensionSlot`, and `isAdminUiExtensionSlot`, and `@voyant-travel/apps`
keeps exporting `APP_ADMIN_EXTENSION_SLOTS`, so no consumer import changes.
