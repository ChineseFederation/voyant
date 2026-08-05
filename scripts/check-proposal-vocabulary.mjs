import { readdirSync, readFileSync, statSync } from "node:fs"
import { relative, resolve, sep } from "node:path"

import { trackedFilesIn } from "./lib/tracked-files.mjs"

const rootFlag = process.argv.indexOf("--root")
const root = resolve(rootFlag === -1 ? process.cwd() : process.argv[rootFlag + 1])

const skippedPathParts = new Set([
  ".git",
  ".claude",
  ".codex",
  ".turbo",
  ".changeset",
  "coverage",
  "dist",
  "node_modules",
])

const skippedFiles = new Set([
  "docs/adr/0004-quotes-as-travel-native-sales-artifact.md",
  "docs/architecture/migration-collector-d1.md",
  "scripts/check-proposal-vocabulary.mjs",
  "scripts/tests/check-proposal-vocabulary.test.mjs",
])

// Retiring the legacy vocabulary from a LIVE database requires naming it: an
// adoption migration has to say `ALTER TABLE quotes RENAME TO proposals`, and
// the parity fixtures ARE the pre-rename history byte for byte (voyant#4143).
// Scoped to the exact artifacts that carry out or verify the rename, so the ban
// stays exact everywhere else. Nothing may be added here to make new code pass —
// only frozen history and the migrations that retire it.
const legacyRenameAdoptionPaths = [
  /^packages\/framework-migrations\/migrations\/0011_adopt_legacy_quote_objects\.sql$/,
  /^packages\/(?:bookings|custom-fields|db|legal|mice|proposals|relationships)\/migrations\/20260804\d{6}_[a-z_]+\.sql$/,
  /^scripts\/fixtures\/pre-proposal-rename\//,
]

const skippedExtensions = new Set([
  ".avif",
  ".bin",
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".lockb",
  ".png",
  ".webp",
])

const allowedPricingQuotePaths = [
  /^docs\/architecture\/ai-travel-experience-composition\.md$/,
  /^docs\/architecture\/booking-journey-architecture\.md$/,
  /^docs\/architecture\/catalog-/,
  /^packages\/bookings\/openapi\/storefront\/bookings\.json$/,
  /^packages\/catalog(?:-|\/)/,
  /^packages\/commerce\/src\/checkout\/start-service(?:\.test)?\.ts$/,
  /^packages\/core\/src\/links\.ts$/,
  /^packages\/finance\/src\/self-service-/,
  /^packages\/inventory\/src\/catalog-runtime-extension\.test\.ts$/,
  /^packages\/trips\/(?:migrations|src|tests)\//,
  /^packages\/trips-react\/src\/admin\/trips-panels\/catalog-configurator\.tsx$/,
  /^packages\/webhook-delivery\/tests\/test-payload\.test\.ts$/,
]

const allowedPricingQuoteTerms = [
  "catalog_quote_id",
  "catalog_quotes",
  "current_quote_id",
  "quoteCurrency",
  "quoteIdent",
  "quotedAt",
  "quoteEntity",
  "quoteId",
  "request-for-quote",
  '"quote"',
]

const forbiddenLegacyTerms = [
  "@voyant-travel/quotes",
  "@voyant-travel/quotes-contracts",
  "@voyant-travel/quotes-react",
  "packages/quotes",
  "quotes-contracts",
  "quotes-react",
  "booking_crm_details",
  "quote_media",
  "quote_participants",
  "quote_products",
  "quote_status",
  "quote_version",
  "quote_versions",
  "accepted_quote_version",
  "Quote Version",
  "Quote Versions",
  "QuoteVersion",
  "QuoteVersions",
  "quoteVersion",
  "quoteVersions",
  "QuoteState",
  "quote-version",
  "quote-versions",
  "quotesSection",
  "quotesContributor",
  "quotesRuntime",
  "QuotesRuntime",
  "quotesProposal",
  "QuotesProposal",
  "quotesNotifications",
  "QuotesNotifications",
  "QuotesPublic",
  "createQuotes",
  "bookingQuoteDetails",
  "QUOTE_SEEDS",
  "quoteOpen",
  "quoteWon",
  "quoteLost",
  "quoteArchived",
  "quotes proposal",
  'quotes: "Quotes"',
  'console.log("\\nquote:")',
  "`quote.accepted`",
  "quoteProgramLink",
  "quoteLinkable",
  "qver_",
  "quot_",
  "qprd_",
  "qmed_",
  "/v1/admin/quotes",
  "/admin/quotes",
  "/quotes/quotes",
  "@voyant-travel/realtime/quotes-invalidation-extension",
  'entityType: "quote"',
  "entityType: 'quote'",
  '"entityType":"quote"',
  '["organization", "person", "quote", "activity"]',
  '"organization", "person", "quote", "activity"',
  "\"entity_type\" AS ENUM('organization', 'person', 'quote', 'activity')",
]

function normalizePath(path) {
  return path.split(sep).join("/")
}

function shouldSkipPath(path) {
  const normalized = normalizePath(relative(root, path))
  if (skippedFiles.has(normalized)) return true
  if (legacyRenameAdoptionPaths.some((pattern) => pattern.test(normalized))) return true
  if (normalized.endsWith("/CHANGELOG.md")) return true
  if (normalized === "pnpm-lock.yaml") return false
  if (skippedExtensions.has(path.slice(path.lastIndexOf(".")).toLowerCase())) return true
  return normalized.split("/").some((part) => skippedPathParts.has(part))
}

function collectFiles(dir, files = []) {
  // The repository itself is enumerated from git, so a parked worktree or a
  // stale build artifact on disk is invisible. A `--root <fixture>` tree is not
  // a repository, so it still walks. See scripts/lib/tracked-files.mjs.
  const tracked = dir === root ? trackedFilesIn(root) : null
  if (tracked !== null) {
    for (const file of tracked) {
      const absolute = resolve(root, file)
      if (shouldSkipPath(absolute)) continue
      files.push(absolute)
    }
    return files
  }

  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry)
    if (shouldSkipPath(path)) continue
    let stat
    try {
      stat = statSync(path)
    } catch (error) {
      if (error && error.code === "ENOENT") continue
      throw error
    }
    if (stat.isDirectory()) collectFiles(path, files)
    else if (stat.isFile()) files.push(path)
  }
  return files
}

function allowedPricingQuoteFile(path) {
  const normalized = normalizePath(relative(root, path))
  return allowedPricingQuotePaths.some((pattern) => pattern.test(normalized))
}

function allowedQuotedStringTerm(source, index) {
  const before = source.slice(Math.max(0, index - 80), index)
  const after = source.slice(index, index + 80)
  return (
    before.includes("z.enum([") ||
    before.includes("ENUM(") ||
    after.includes("activity") ||
    after.includes("organization")
  )
}

function lineAndColumn(source, index) {
  const prefix = source.slice(0, index)
  const lines = prefix.split("\n")
  return { line: lines.length, column: lines.at(-1).length + 1 }
}

const failures = []

for (const file of collectFiles(root)) {
  const normalized = normalizePath(relative(root, file))
  const source = readFileSync(file, "utf8")
  const pricingQuoteFile = allowedPricingQuoteFile(file)
  for (const term of forbiddenLegacyTerms) {
    let index = source.indexOf(term)
    while (index !== -1) {
      const allowed =
        pricingQuoteFile &&
        (allowedPricingQuoteTerms.includes(term) ||
          (term === '"quote"' && allowedQuotedStringTerm(source, index)))
      if (!allowed) {
        const location = lineAndColumn(source, index)
        failures.push(
          `${normalized}:${location.line}:${location.column} legacy proposal term ${JSON.stringify(term)}`,
        )
      }
      index = source.indexOf(term, index + term.length)
    }
  }
}

if (failures.length > 0) {
  console.error("Legacy bespoke Quote vocabulary remains outside approved pricing-quote contexts:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("OK proposal vocabulary")
