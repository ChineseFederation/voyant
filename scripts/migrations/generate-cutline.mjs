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

import { trackedFilesIn } from "../lib/tracked-files.mjs"
import { absorbedSourcesByOwner, loadCutlineManifest } from "./cutline-manifest.mjs"

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

/**
 * The retired ledger source names a package claims, or `null` when it has no
 * manifest to claim them in. This is what the source-free managed image reads.
 */
function declaredLegacyMigrationSources(dir) {
  const manifestPath = join(ROOT, "packages", dir, "package.json")
  if (!existsSync(manifestPath)) return null
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8"))
  return parsed.voyant?.legacyMigrationSources ?? []
}

/**
 * Package directories, from the TRACKED tree — a leftover directory from a
 * deleted package is not this tree's source and must not be read.
 */
function trackedPackageDirs() {
  const tracked = trackedFilesIn(ROOT)
  const dirs = new Set()
  for (const file of tracked ?? readdirSync(join(ROOT, "packages")).map((d) => `packages/${d}/x`)) {
    const match = file.match(/^packages\/([^/]+)\//)
    if (match) dirs.add(match[1])
  }
  return [...dirs].sort()
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
// package's journal, so that is where existence is asserted.
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

// An absorbed source is only half-recorded by `absorbedBy`. The ledger is keyed
// (source, tag): a deployment that already applied the retired source's tags
// finds them under the RETIRED name, so the absorbing package must claim that
// name or its moved migrations re-run against objects that exist (voyant#4330).
//
// The claim has to live in the absorbing package's package.json — the managed
// image resolves a module by name and reads its `migrations/` folder without
// ever resolving the graph, so a graph-manifest facet is invisible to it.
//
// Only the forward direction is asserted against `absorbedBy`: a future
// absorption of a package that was never in the frozen cutline has nothing to
// record there, and would read as a violation. The claim is instead checked
// against the tree — a claimed source that still ships its own migrations folder
// is two sources owning one (source, tag).
for (const [owner, retired] of absorbedSourcesByOwner(manifest)) {
  const declared = declaredLegacyMigrationSources(owner)
  if (declared === null) {
    problems.push(`${owner}: absorbing package has no package.json to declare its absorptions in`)
    continue
  }
  for (const source of retired) {
    if (!declared.includes(source)) {
      problems.push(
        `${owner}: absorbed "${source}" but package.json does not list it in ` +
          "voyant.legacyMigrationSources — its moved migrations will re-run on any " +
          `database that recorded them under "${source}"`,
      )
    }
  }
}
// Every claim, not just the ones the frozen cutline knows about: a claimed
// source that still ships migrations is two sources owning one (source, tag),
// and a claim on a name nothing ever used is a typo that adopts nothing.
for (const dir of trackedPackageDirs()) {
  for (const source of declaredLegacyMigrationSources(dir) ?? []) {
    if (currentTags(source) !== null) {
      problems.push(
        `${dir}: claims the ledger identities of "${source}", which still ships its own ` +
          "migrations folder — two sources cannot own one (source, tag)",
      )
    }
  }
}
if (problems.length > 0) {
  console.error("frozen-cutline violation:")
  for (const p of problems) console.error(`  • ${p}`)
  process.exit(1)
}
console.log(
  `check-cutline: OK (frozen — ${Object.keys(committed).length} sources, ${postCutline} post-cutline increment tag(s) execute normally)`,
)
