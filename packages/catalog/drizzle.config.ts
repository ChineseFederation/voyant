import { defineConfig } from "drizzle-kit"

/**
 * Standalone drizzle config for the catalog plane's tables.
 *
 * Operators have two options for getting catalog tables into their database:
 *   1. Reference `packages/catalog/src/schema.ts` from their template's
 *      `drizzle.config.ts` schema list. The template's existing migration
 *      pipeline picks up the catalog tables alongside its other modules.
 *      Recommended for net-new deployments (see `apps/operator/drizzle.config.ts`).
 *   2. Generate standalone catalog migrations using this config and apply
 *      them separately. Useful for adding the catalog plane to an existing
 *      deployment whose template already has a long migration history.
 *
 * Either path produces the same DDL — `catalog_overlay` and
 * `booking_catalog_snapshot` tables with the indexes documented in
 * `src/overlay/schema.ts` and `src/snapshot/schema.ts`.
 */
export default defineConfig({
  schema: ["./src/schema.ts"],
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://placeholder",
  },
})
