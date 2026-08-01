/**
 * Enforces route ownership from docs/architecture/api-route-ownership-and-composition.md (Phase 0).
 *
 * Reusable framework route interfaces belong in packages, composed through
 * `ApiModule` / `ApiExtension` registries — not hand-authored under
 * `apps/operator/src/api`. This checker is the guard that stops the second route
 * door (direct `/v1/...` handlers and `additionalRoutes` blocks) from growing
 * while extraction proceeds.
 *
 * It does NOT break existing routes on day one. Every route-bearing application file
 * that exists today is baselined in scripts/route-ownership-baseline.json. The
 * check fails only on NEW drift:
 *   - a new route-bearing application file with no ownership annotation,
 *   - more `/v1/...` route definitions in a baselined file than its baseline,
 *   - a new `additionalRoutes` block outside the allowed files.
 *
 * Escape hatch: a file carrying a `// voyant-route-owner: <reason>` annotation
 * is treated as an explicit ownership decision and is exempt from baseline
 * enforcement (it still appears in the report).
 *
 * As route families move into packages (RFC Phases 3-4), LOWER the baseline
 * counts in the JSON; the checker warns when a file drops below baseline so the
 * baseline is kept honest. Never raise a count to land new application routes.
 *
 * Usage:
 *   node scripts/check-route-ownership.mjs            # enforce: fail on new drift
 *   node scripts/check-route-ownership.mjs --report   # report-only: never fail
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const APPLICATION_DIR = join(ROOT, "apps", "operator")
const BASELINE_PATH = join(__dirname, "route-ownership-baseline.json")

const REPORT_ONLY = process.argv.includes("--report")

const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", ".next", ".wrangler", "coverage"])

// `.get|post|put|patch|delete( "/v1/..."` — tolerant of whitespace/newlines
// between the paren and the string literal so multi-line calls still match.
const ROUTE_DEF = /\.(?:get|post|put|patch|delete)\(\s*["'`]\/v1\//g
const ADDITIONAL_ROUTES = /\badditionalRoutes\b\s*:/
const OWNER_ANNOTATION = /\/\/\s*voyant-route-owner:\s*(\S.*)$/m

const toRel = (file) => relative(ROOT, file).split(sep).join("/")

function* walkApiFiles(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) {
      yield* walkApiFiles(full)
    } else if (stats.isFile() && entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      // Only files under a `src/api` segment are framework-route territory.
      if (full.split(sep).join("/").includes("/src/api/")) yield full
    }
  }
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf-8"))
const baselineFiles = baseline.files ?? {}
const additionalRoutesAllowed = new Set(baseline.additionalRoutesAllowed ?? [])

const violations = []
const warnings = []
const annotated = []
const seenFiles = new Set()

for (const file of walkApiFiles(APPLICATION_DIR)) {
  const rel = toRel(file)
  const source = readFileSync(file, "utf-8")
  const routeCount = (source.match(ROUTE_DEF) ?? []).length
  const hasAdditionalRoutes = ADDITIONAL_ROUTES.test(source)
  const annotation = source.match(OWNER_ANNOTATION)?.[1]?.trim()

  if (routeCount === 0 && !hasAdditionalRoutes) continue
  seenFiles.add(rel)

  if (annotation) {
    annotated.push({ rel, routeCount, annotation })
    continue
  }

  // additionalRoutes: only the allowlisted files may carry it.
  if (hasAdditionalRoutes && !additionalRoutesAllowed.has(rel)) {
    violations.push({
      rel,
      message: `new \`additionalRoutes\` block in the application. Route families must be composed as a ApiModule/ApiExtension, or annotate the file with \`// voyant-route-owner: <reason>\`.`,
    })
  }

  if (routeCount === 0) continue

  if (!(rel in baselineFiles)) {
    violations.push({
      rel,
      message: `new route-bearing application file (${routeCount} \`/v1/\` route${routeCount === 1 ? "" : "s"}). Move the interface into a package module/extension, or annotate with \`// voyant-route-owner: <reason>\`.`,
    })
    continue
  }

  const allowed = baselineFiles[rel]
  if (routeCount > allowed) {
    violations.push({
      rel,
      message: `${routeCount} \`/v1/\` routes, baseline allows ${allowed}. Do not add new framework routes to the application — extract into a package, or annotate with \`// voyant-route-owner: <reason>\`.`,
    })
  } else if (routeCount < allowed) {
    warnings.push(
      `${rel}: ${routeCount} \`/v1/\` routes, baseline still says ${allowed}. Lower the baseline in scripts/route-ownership-baseline.json to lock in the extraction.`,
    )
  }
}

// Baselined files that vanished (renamed/extracted) — keep the baseline tidy.
for (const rel of Object.keys(baselineFiles)) {
  if (!seenFiles.has(rel)) {
    warnings.push(
      `${rel}: in the baseline but no longer carries \`/v1/\` routes (removed or extracted). Drop it from scripts/route-ownership-baseline.json.`,
    )
  }
}

console.log(
  `check-route-ownership: scanned ${APPLICATION_DIR.replace(`${ROOT}/`, "")} — ${seenFiles.size} route-bearing files (${annotated.length} annotated, ${Object.keys(baselineFiles).length} baselined).`,
)

if (annotated.length > 0) {
  console.log("\nAnnotated (explicit ownership decisions):")
  for (const a of annotated) console.log(`  ${a.rel} → ${a.annotation}`)
}

if (warnings.length > 0) {
  console.log("\nBaseline drift (non-blocking):")
  for (const w of warnings) console.log(`  ${w}`)
}

if (violations.length > 0) {
  const out = REPORT_ONLY ? console.warn : console.error
  out(`\n${REPORT_ONLY ? "Route ownership findings" : "Route ownership violations"}:`)
  out(
    "See docs/architecture/api-route-ownership-and-composition.md and docs/architecture/route-ownership-inventory.md.\n",
  )
  for (const v of violations) {
    out(`  ${v.rel}`)
    out(`    ${v.message}`)
  }
  if (!REPORT_ONLY) {
    console.error(
      "\nNew application routes must carry an ownership decision. Re-run with --report to see findings without failing.",
    )
    process.exit(1)
  }
}

console.log(
  `\ncheck-route-ownership: OK${violations.length > 0 ? ` (${violations.length} finding(s), report-only)` : ""}`,
)
