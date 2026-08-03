/**
 * Enforces the Product-owned Extra rule from voyant#4027 / voyant#4031.
 *
 * An Extra is a lifecycle-dependent child of the Product Booking that carries
 * it. Two things follow, and both are mechanical enough to check:
 *
 *   1. Extras are never independently sellable or discoverable — no catalog
 *      vertical, no slice, no collection, no search result, no browse tab.
 *   2. No migration silently promotes an existing Extra into a Product or a
 *      Component Booking. That is a commercial decision an operator has to
 *      make deliberately, one Extra at a time; a bulk backfill would invent
 *      confirmations, cancellations and tax treatment nobody agreed to.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

const violations = []

function record(file, line, text, why) {
  violations.push({ file, line, text, why })
}

// ── 1. `extras` is not an indexed / browsable catalog vertical ──────────────

const VERTICAL_CHECKS = [
  {
    file: "packages/catalog/src/runtime-support.ts",
    // Only the vertical list matters; the file legitimately mentions extras in
    // the comment explaining the absence.
    region: /export const DEFAULT_CATALOG_VERTICALS = \[([\s\S]*?)\] as const/,
    why: "`extras` must not be a catalog vertical — it gets no collection, slice, or index document.",
  },
]

for (const { file, region, why } of VERTICAL_CHECKS) {
  const full = join(ROOT, file)
  if (!existsSync(full)) {
    record(file, null, "missing file", "the vertical list moved; update this check")
    continue
  }
  const source = readFileSync(full, "utf-8")
  const match = source.match(region)
  if (!match) {
    record(
      file,
      null,
      "DEFAULT_CATALOG_VERTICALS not found",
      "the vertical list moved; update this check",
    )
    continue
  }
  if (/["']extras["']/.test(match[1] ?? "")) {
    record(file, null, 'DEFAULT_CATALOG_VERTICALS includes "extras"', why)
  }
}

// The shared catalog page must not offer an Extras browse tab.
const CATALOG_PAGE = "packages/catalog-react/src/components/catalog-page.tsx"
const catalogPagePath = join(ROOT, CATALOG_PAGE)
if (existsSync(catalogPagePath)) {
  const lines = readFileSync(catalogPagePath, "utf-8").split("\n")
  for (const [index, text] of lines.entries()) {
    if (/vertical:\s*["']extras["']/.test(text)) {
      record(
        CATALOG_PAGE,
        index + 1,
        text.trim(),
        "the shared Catalog must not expose Extras as a standalone browse vertical.",
      )
    }
  }
}

// The search route has to refuse a product-owned vertical rather than silently
// returning nothing, so old deep links can explain themselves.
const SEARCH_ROUTES = "packages/catalog/src/search/routes.ts"
const searchRoutesPath = join(ROOT, SEARCH_ROUTES)
if (existsSync(searchRoutesPath)) {
  const source = readFileSync(searchRoutesPath, "utf-8")
  if (!source.includes("owningVerticalFor")) {
    record(
      SEARCH_ROUTES,
      null,
      "no product-owned vertical guard",
      "catalog search must refuse product-owned verticals via `owningVerticalFor`.",
    )
  }
}

// ── 2. No migration auto-promotes an existing Extra ─────────────────────────

const MIGRATION_ROOTS = ["packages", "apps"]

/** Statements that would turn Extra rows into independently sellable records. */
const PROMOTION_PATTERNS = [
  {
    pattern: /insert\s+into\s+"?products"?[\s\S]{0,600}?\bfrom\s+"?product_extras"?/i,
    why: "a migration must not backfill Products from product_extras.",
  },
  {
    pattern: /insert\s+into\s+"?bookings"?[\s\S]{0,600}?\bfrom\s+"?booking_extras"?/i,
    why: "a migration must not backfill Bookings from booking_extras.",
  },
  {
    pattern: /insert\s+into\s+"?booking_items"?[\s\S]{0,600}?\bfrom\s+"?product_extras"?/i,
    why: "a migration must not synthesize sold Booking Items from Extra definitions.",
  },
  {
    pattern: /update\s+"?booking_items"?\s+set[\s\S]{0,400}?item_type\s*=\s*'(?!extra')/i,
    why: "a migration must not reclassify Extra booking items into another item type.",
  },
]

function collectMigrationFiles(dir, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".turbo") continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectMigrationFiles(full, out)
    } else if (entry.name.endsWith(".sql") && full.includes(`${"/"}migrations${"/"}`)) {
      out.push(full)
    }
  }
  return out
}

const migrationFiles = MIGRATION_ROOTS.flatMap((root) =>
  collectMigrationFiles(join(ROOT, root), []),
)

for (const full of migrationFiles) {
  const source = readFileSync(full, "utf-8")
  if (!/product_extras|booking_extras|extra_participant_selections/i.test(source)) continue
  for (const { pattern, why } of PROMOTION_PATTERNS) {
    if (pattern.test(source)) {
      record(relative(ROOT, full), null, pattern.source, why)
    }
  }
}

if (violations.length > 0) {
  console.error("Extras lifecycle violation: an Extra is Product-owned, never independently sold.")
  console.error("See docs/architecture/catalog-architecture.md and voyant#4027.\n")
  for (const violation of violations) {
    const location = violation.line ? `${violation.file}:${violation.line}` : violation.file
    console.error(`  ${location}`)
    console.error(`    ${violation.text}`)
    console.error(`    → ${violation.why}`)
  }
  console.error(
    "\nAn addition that must be independently confirmed, cancelled, taxed, fulfilled or supported is a Product / Component Booking under a Trip Envelope — not an Extra.",
  )
  process.exit(1)
}

console.log(`check-extras-lifecycle: OK (${migrationFiles.length} migrations scanned)`)
