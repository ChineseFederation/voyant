/**
 * D.2 — the BASELINE CUTLINE manifest (FROZEN at cutover).
 * ADR: docs/architecture/migration-collector-d2.md (Decision 5 + Decommission).
 *
 * The cutline records, per package source, which migration tags were already
 * materialised when the existing deployments were transitioned off the retired
 * framework bundle / legacy runner. On an EXISTING database the D.2 collector
 * IMPORT-BASELINES exactly these tags (records them applied without executing —
 * the tables already exist) and EXECUTES everything AFTER the cutline.
 *
 * It is **frozen**. Once the deployments cut over (done 2026-06-20: eturia +
 * protravel), the cutline must NEVER absorb new tags — a NEW package migration
 * must fall OUTSIDE the cutline so it EXECUTES on those databases (adding it to
 * the cutline would make them skip its DDL forever). So this no longer
 * regenerates-and-compares; it only asserts the frozen cutline's tags still
 * exist (cutline migrations are immutable history) and that new tags are simply
 * post-cutline increments.
 *
 *   default     : check — fail if a frozen cutline tag was deleted/renamed. (CI gate.)
 *   --emit-init : (RE)WRITE the cutline from ALL current package tags. ONLY for the
 *                 one-time initial cutover — re-running it AFTER cutover absorbs
 *                 post-cutline migrations and breaks transitioned deployments.
 *
 * Run: node scripts/migrations/generate-cutline.mjs [--emit-init]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { loadCutlineManifest } from "./cutline-manifest.mjs"

const ROOT = new URL("../..", import.meta.url).pathname
const MANIFEST = join(ROOT, "packages/framework-migrations/cutline.generated.json")
const EMIT_INIT = process.argv.includes("--emit-init")

/** A package's current migration tags, in journal (apply) order. */
function currentTags(dir) {
  const journalPath = join(ROOT, "packages", dir, "migrations", "meta", "_journal.json")
  if (!existsSync(journalPath)) return null
  const journal = JSON.parse(readFileSync(journalPath, "utf8"))
  return [...journal.entries].sort((a, b) => a.when - b.when).map((e) => e.tag)
}

// --emit-init: build the cutline from ALL current package tags. The union proof
// (bundle == union of current package baselines) makes that exactly correct AT
// CUTOVER — but never after.
if (EMIT_INIT) {
  const cutline = {}
  for (const dir of readdirSync(join(ROOT, "packages")).sort()) {
    if (dir === "framework-migrations") continue
    const tags = currentTags(dir)
    if (tags) cutline[dir] = tags
  }
  writeFileSync(MANIFEST, `${JSON.stringify({ cutline }, null, 2)}\n`)
  const total = Object.values(cutline).reduce((n, tags) => n + tags.length, 0)
  console.log(
    `generate-cutline: INITIAL emit — ${Object.keys(cutline).length} package(s), ${total} tag(s). ` +
      "Do NOT re-run after cutover; the cutline is frozen.",
  )
  process.exit(0)
}

// Check mode: the cutline is FROZEN. Assert every committed cutline tag still
// exists in its package (immutable history); allow — and ignore — any NEW tags
// beyond the cutline (post-cutline increments that the collector EXECUTES).
if (!existsSync(MANIFEST)) {
  console.error("cutline manifest missing — frozen at cutover; it must be committed.")
  process.exit(1)
}
const manifest = loadCutlineManifest(ROOT)
const committed = manifest.cutline
// A cutline package may have been ABSORBED by another (module consolidation).
// Its frozen tags stay recorded here — they are the historical truth about what
// the cutover deployments had materialised — but they now live in the absorbing
// package's journal, so that is where existence is asserted. The collector does
// not need this map: on those databases the tags are already in the ledger under
// the retired source name, and the absorbing source's `legacySources` adopts
// them before the cutline is consulted.
const absorbedBy = manifest.absorbedBy
const problems = []
let postCutline = 0
for (const [pkg, tags] of Object.entries(committed)) {
  const owner = absorbedBy[pkg] ?? pkg
  const current = currentTags(owner)
  if (current === null) {
    problems.push(
      owner === pkg
        ? `${pkg}: cutline package no longer ships a migrations folder`
        : `${pkg}: absorbed by ${owner}, which ships no migrations folder`,
    )
    continue
  }
  const set = new Set(current)
  for (const tag of tags) {
    if (!set.has(tag)) {
      problems.push(`${pkg}: frozen cutline tag "${tag}" is missing (deleted/renamed?) — immutable`)
    }
  }
  postCutline += owner === pkg ? current.length - tags.length : 0
}
if (problems.length > 0) {
  console.error("frozen-cutline violation:")
  for (const p of problems) console.error(`  • ${p}`)
  process.exit(1)
}
console.log(
  `check-cutline: OK (frozen — ${Object.keys(committed).length} sources, ${postCutline} post-cutline increment tag(s) execute normally)`,
)
