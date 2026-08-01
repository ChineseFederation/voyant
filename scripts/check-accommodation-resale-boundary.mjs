/**
 * Enforces issue #977's accommodation resale boundary.
 *
 * Accommodation remains valid catalog/resale inventory. This check blocks the
 * first-party hotel-operations surfaces from returning in applications and
 * packaged UI.
 */
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

const FORBIDDEN_PATHS = [
  "packages/hospitality",
  "packages/hospitality-react",
  "packages/hospitality-ui",
]

const FILE_CHECKS = [
  {
    file: "apps/operator/package.json",
    patterns: [/"@voyant-travel\/hospitality"/],
  },
  {
    file: "apps/operator/src/api/catalog-content.ts",
    patterns: [/@voyant-travel\/hospitality/, /\/v1\/(?:admin|public)\/hospitality/],
  },
  {
    file: "apps/operator/src/api/lib/booking-engine-runtime.ts",
    patterns: [/@voyant-travel\/hospitality/, /\bhospitalityBookingsService\b/],
  },
  {
    file: "apps/operator/src/api/lib/catalog-runtime.ts",
    patterns: [/@voyant-travel\/hospitality/, /\bhospitalityCatalogPolicy\b/, /"hospitality"/],
  },
  {
    file: "apps/operator/src/api/booking-schedule.ts",
    patterns: [
      /@voyant-travel\/hospitality/,
      /\bresolveHospitalityListingPolicy\b/,
      /"hospitality"/,
    ],
  },
  {
    file: "apps/operator/src/api/app.ts",
    patterns: [/\/v1\/public\/hospitality/],
  },
  {
    file: "apps/operator/src/routes/(storefront)/shop.tsx",
    patterns: [/"hospitality"/],
  },
  {
    file: "apps/operator/src/routes/(storefront)/shop_.products.$entityModule.$entityId.tsx",
    patterns: [/@voyant-travel\/hospitality/, /"hospitality"/, /\bHospitalityContent\b/],
  },
  {
    file: "apps/operator/drizzle.config.ts",
    patterns: [/packages\/hospitality/],
  },
  {
    file: "scripts/generate-schema-docs.ts",
    patterns: [/\bhospitality\b/i, /packages\/hospitality/],
  },
  {
    file: "docs/architecture/schema-discipline.md",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "SCHEMA.md",
    patterns: [/\bhospitality\b/i, /^## Hospitality$/],
  },
  {
    file: "packages/inventory/src/draft-shape.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/inventory/src/booking-engine/handler.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/inventory/src/service-catalog-plane.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/inventory/src/extras/service-content.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/inventory/src/extras/schema-sourced-content.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/charters/src/service-content.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/charters/src/schema-sourced-content.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/charters/src/service-catalog-plane.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/bookings/src/schema/travel-details.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/legal/src/contracts/template-authoring.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "docs/architecture/payments-architecture.md",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "docs/architecture/cruises-module.md",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/catalog-react/src/components/catalog-page.tsx",
    patterns: [/\bhospitality\b/i, /\bmakeHospitality/],
  },
  {
    file: "packages/catalog-react/src/components/catalog-search-page.tsx",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/catalog-react/src/i18n/messages.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/catalog-react/src/i18n/en.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/catalog-react/src/i18n/ro.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/bookings-react/src/journey/types.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/trips/src/validation.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/trips/src/service-trips.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/trips-react/src/operations.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "apps/operator/src/components/voyant/trips/trip-list-filters.tsx",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/trips-react/src/admin/admin-trips-page.tsx",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/trips-react/src/admin/admin-trips-panels.tsx",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "apps/operator/src/components/voyant/trips/storefront-composer-block.tsx",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "apps/operator/src/routes/_workspace/trips/index.tsx",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "apps/operator/src/routes/_workspace/trips/$id.tsx",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/i18n/src/admin/trips.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/types/src/api-keys.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/catalog/README.md",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/catalog/src/adapter/contract.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/catalog/src/booking-engine/contracts.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/catalog/src/booking-engine/draft-shape.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/catalog/src/booking-engine/orders.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/catalog/src/booking-engine/owned-handler.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/catalog/src/booking-engine/owned-handler.test.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/catalog/tests/integration/snapshot-service.test.ts",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "docs/architecture/catalog-booking-engine.md",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "docs/architecture/catalog-architecture.md",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "docs/architecture/catalog-sourced-content.md",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "docs/architecture/booking-journey-architecture.md",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "docs/architecture/service-api-keys.md",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "docs/architecture/ai-travel-experience-composition.md",
    patterns: [/\bhospitality\b/i],
  },
  {
    file: "packages/hospitality/README.md",
    patterns: [/pnpm add @voyant-travel\/hospitality/, /\bhospitalityModule\b/],
  },
  {
    file: "packages/hospitality-ui/README.md",
    patterns: [/pnpm add @voyant-travel\/hospitality-ui/, /npx shadcn add @voyant\/.*hospitality/],
  },
]

const violations = []

for (const path of FORBIDDEN_PATHS) {
  if (existsSync(join(ROOT, path))) {
    violations.push({ file: path, line: null, text: "forbidden path exists" })
  }
}

for (const { file, patterns } of FILE_CHECKS) {
  const full = join(ROOT, file)
  if (!existsSync(full)) continue
  const lines = readFileSync(full, "utf-8").split("\n")
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? ""
    if (patterns.some((pattern) => pattern.test(text))) {
      violations.push({ file, line: i + 1, text: text.trim() })
    }
  }
}

if (violations.length > 0) {
  console.error("Accommodation resale boundary violation: hotel-operations surface found.")
  console.error("See docs/architecture/accommodation-resale-boundary.md for context.\n")
  for (const violation of violations) {
    const location = violation.line ? `${violation.file}:${violation.line}` : violation.file
    console.error(`  ${location}`)
    console.error(`    ${violation.text}`)
  }
  console.error(
    "\nAccommodation resale belongs in catalog/booking/storefront flows; do not reintroduce first-party hotel management surfaces.",
  )
  process.exit(1)
}

console.log("check-accommodation-resale-boundary: OK")
