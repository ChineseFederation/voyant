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
  schema: "./src/verification/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
})
