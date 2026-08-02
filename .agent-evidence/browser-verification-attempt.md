# Browser verification attempt — issue #4029

## Goal
Drive the operator admin UI (product quick-start chooser, Organize card, catalog
Tour/Boat Tour views) on a unique high port with console/network capture and
screenshots.

## Environment setup performed
- Reused the running `voyant-test-db` Postgres 16 container (host port 5436).
- Created a dedicated `operator_dev` database.
- Wrote `apps/operator/.env` with generated Better Auth / session / KMS secrets
  and `DATABASE_URL`/`DATABASE_URL_DIRECT` pointing at `operator_dev`.

## Blocker
1. `pnpm -F operator db:migrate` (`voyant migrate`) fails before applying any
   migration:
   `Cannot find module '.../packages/framework/src/operator-distribution.js'`
   The `voyant` CLI's migrate path resolves framework internals through the
   built `dist` (`.js`) exports, but **no packages are built** (0/110 `dist/`
   dirs present) — the workspace ships source only.
2. Building the graph to produce those artifacts is not feasible in this
   sandbox: a single-package `tsc` typecheck of `@voyant-travel/inventory`
   OOMs even with `--max-old-space-size=8192` on this 13 GB host, so a full
   monorepo build reliably OOMs.
3. `voyant develop` (the SSR dev server) DOES boot from source (vite/tsx), but
   against an unmigrated database it has no schema/auth tables, so the admin
   product surfaces cannot be exercised end-to-end. See
   `operator-dev-server.log` (server logged its listen URL; DB had zero tables).

## Mitigation
Because the running app could not be driven here, the behavior is covered by
automated tests instead — including **integration tests exercised against a real
Postgres** (`voyant_test`, port 5436), which passed:
- `packages/inventory/tests/unit/classification.test.ts` — duration/family
  resolver + 60-minute Boat Tour stays a Tour (not an Activity), review state.
  (12 tests, green.)
- `packages/inventory/tests/integration/classification.test.ts` — the
  classification projection extension, the legacy Catalog search document, and
  the list/detail read paths, all against real Postgres. (6 tests, green.)
- `packages/catalog-authoring` validate tests updated for the reworded,
  de-conflated booking-mechanic validation codes. (green.)

The UI changes (quick-start chooser, Organize card family/subtype/duration/
supply-model separation and label fix, list columns + review badge, catalog
family/subtype facet locks retiring the duration identity, EN/RO strings) are
implemented and type-consistent with the shared contracts, but were not
browser-driven in this environment.
