# @voyant-travel/admin-extension-sdk

## 0.3.0

### Minor Changes

- 5fa76aa: Publish the admin UI extension slot vocabulary from the contract package.

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

## 0.2.0

### Minor Changes

- a461920: Add the admin session-token protocol to the extension host contract: a
  `voyant:ext:token` host→extension message answering the reserved
  `request-token` request, a `requestToken()` author action, request/response
  correlation ids, and resolved `appLocale` + text `direction` on the extension
  context. Bumps the extension API to `1.1.0`.

### Patch Changes

- a461920: Harden the admin session-token broker: drop grant replies once the requesting frame has navigated or unmounted, time out pending `requestToken()` promises instead of hanging, and expose page fetchers from the installation-backed extensions client so full-page app extensions are reachable.

## 0.1.1

### Patch Changes

- 2e34e64: Republish with packaged `dist` exports. The 0.1.0 tarball was published outside
  the release train, so its `exports` map pointed at unpackaged `src/*.ts` files
  and the package could not be imported.

## 0.1.0

### Minor Changes

- c1e37f2: Add the versioned admin UI-extension host: a public slot registry
  (`ADMIN_UI_EXTENSION_SLOTS`), a render-time compatibility check
  (`isUiExtensionCompatible`), a sandboxed-iframe `UiExtensionHost` implementing
  the `postMessage` protocol, and `createUiExtensionsAdminExtension` /
  `createStaticUiExtensionsClient` for mounting installed extensions into every
  slot. Re-exports the contract and version constant from the new
  `@voyant-travel/admin-extension-sdk`.
