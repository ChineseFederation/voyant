#!/usr/bin/env node

const runnerUrl = new URL(
  "./dist/.voyant/runtime/project-migrations.generated.mjs",
  import.meta.url,
)
const migrationModule = await import(runnerUrl.href)
if (typeof migrationModule.runVoyantMigrations !== "function") {
  throw new Error(`Generated migration runner ${runnerUrl.href} has no runVoyantMigrations export.`)
}

const report = await migrationModule.runVoyantMigrations({
  dryRun: process.argv.includes("--dry-run"),
})
console.log(JSON.stringify(report, null, 2))
if (Array.isArray(report.failed) && report.failed.length > 0) process.exitCode = 1
