#!/usr/bin/env node
/**
 * Assert on the execution report a migration run emitted, rather than on its
 * exit code alone.
 *
 * The exit code proves nothing applied badly. It does not prove anything
 * applied at all, and a stage that silently migrates nothing is the failure
 * mode this whole lane exists to prevent.
 *
 * Usage: assert-migration-report.mjs --label <text> [--expect-applied|--expect-no-op] < log
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPORT_SCHEMA = "voyant.migration-result.v1"

/**
 * The migration entrypoint prints the report as the last pretty-printed JSON
 * object on stdout, but runtime logging can precede it, so anchor on the
 * outermost braces and the schema version rather than on the whole stream.
 */
export function extractMigrationReport(text) {
  const lines = text.split("\n")
  for (let start = lines.length - 1; start >= 0; start -= 1) {
    if (lines[start] !== "{") continue
    for (let end = lines.length - 1; end > start; end -= 1) {
      if (lines[end] !== "}") continue
      try {
        const parsed = JSON.parse(lines.slice(start, end + 1).join("\n"))
        if (parsed?.schemaVersion === REPORT_SCHEMA) return parsed
      } catch {
        // Not this pair of braces; keep looking outward.
      }
    }
  }
  return null
}

export function assertMigrationReport(report, { label, expect }) {
  if (!report) {
    throw new Error(`${label}: no ${REPORT_SCHEMA} report was emitted.`)
  }
  if (report.failed.length > 0) {
    const detail = report.failed.map((entry) => `${entry.id}: ${entry.detail}`).join("\n    ")
    throw new Error(`${label}: ${report.failed.length} migration(s) failed.\n    ${detail}`)
  }
  if (expect === "applied" && report.applied.length === 0) {
    throw new Error(
      `${label}: expected the plan to apply at least one migration, but every migration was skipped. ` +
        "The baseline database is not a real prior state.",
    )
  }
  if (expect === "no-op" && report.applied.length > 0) {
    const detail = report.applied.map((entry) => `${entry.id}: ${entry.detail}`).join("\n    ")
    throw new Error(
      `${label}: the plan is not re-entrant. Re-running it applied ${report.applied.length} migration(s).\n    ${detail}`,
    )
  }
  return `${label}: ${report.applied.length} applied, ${report.skipped.length} skipped.`
}

function main() {
  const argv = process.argv.slice(2)
  const label = (argv.includes("--label") ? argv[argv.indexOf("--label") + 1] : "") || "migration"
  const expect = argv.includes("--expect-applied")
    ? "applied"
    : argv.includes("--expect-no-op")
      ? "no-op"
      : "none"

  const text = readFileSync(0, "utf8")
  try {
    console.log(assertMigrationReport(extractMigrationReport(text), { label, expect }))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
