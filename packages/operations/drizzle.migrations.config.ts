/**
 * D.2 — this package OWNS its own migration history, generated from its own
 * schema and shipped in the package tarball (see `files`). A D.2 deployment
 * collects this folder as the package's migration source.
 * ADR: docs/architecture/migration-collector-d2.md.
 *
 * Regenerate: `pnpm -C packages/<this> db:generate`.
 */
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  // operations OWNS ground + places + resources. The availability schema lives
  // in @voyant-travel/availability now; operations' barrel re-exports it for
  // runtime consumers, but operations must NOT create those tables in its own
  // migration — so this config lists operations' owned schema files explicitly
  // (the barrel's availability re-export is intentionally excluded here).
  schema: [
    "./src/availability/schema-departure-operations.ts",
    "./src/booking-actions/schema.ts",
    "./src/ground/schema.ts",
    "./src/places/schema.ts",
    "./src/resources/schema.ts",
  ],
  out: "./migrations",
  dialect: "postgresql",
})
