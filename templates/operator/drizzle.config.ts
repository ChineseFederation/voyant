import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

config({ path: ".env" })
config({ path: "../../.env" })
config({ path: "../../.env.local" })
config({ path: ".dev.vars", override: true })

function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? ""
}

export default defineConfig({
  schema: [
    // Core IAM + infra schemas
    "../../packages/db/src/schema/index.ts",
    "../../packages/action-ledger/src/schema.ts",
    // Module schemas — add/remove based on which modules this template uses
    "../../packages/crm/src/schema.ts",
    "../../packages/availability/src/schema.ts",
    // Facilities schema included for FK targets (suppliers → facilities)
    // even though the facilities module is not mounted in the operator template.
    "../../packages/facilities/src/schema.ts",
    "../../packages/identity/src/schema.ts",
    "../../packages/external-refs/src/schema.ts",
    "../../packages/extras/src/schema.ts",
    "../../packages/booking-requirements/src/schema.ts",
    "../../packages/pricing/src/schema.ts",
    "../../packages/markets/src/schema.ts",
    "../../packages/notifications/src/schema.ts",
    "../../packages/transactions/src/schema.ts",
    "../../packages/sellability/src/schema.ts",
    "../../packages/resources/src/schema.ts",
    "../../packages/distribution/src/schema.ts",
    "../../packages/suppliers/src/schema.ts",
    "../../packages/products/src/schema.ts",
    "../../packages/bookings/src/schema.ts",
    "../../packages/finance/src/schema.ts",
    "../../packages/legal/src/schema.ts",
    "../../packages/promotions/src/schema.ts",
    "../../packages/cruises/src/schema.ts",
    "../../packages/charters/src/schema.ts",
    "../../packages/accommodations/src/schema.ts",
    "../../packages/travel-composer/src/schema.ts",
    "../../packages/flights/src/reference/local-postgres.ts",
    "../../packages/catalog/src/schema.ts",
    "../../packages/workflow-runs/src/schema.ts",
    // Mounted at /v1/public/storefront-verification; keep this schema
    // alongside the route module so challenge requests do not fail at runtime.
    "../../packages/storefront-verification/src/schema.ts",
    // Operator-template-local tables (agency profile + default
    // customer payment policy). Lives in-template since the shape
    // is deployment-flavored.
    "./src/db/schema.ts",
  ],
  out: "./migrations",
  dialect: "postgresql",
  schemaFilter: process.env.TUYU_BOOKING_RUNTIME === "1" ? ["module_voyant"] : undefined,
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
})
