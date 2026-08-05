import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, rmdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

/**
 * Architecture checkers must assert on the TRACKED tree, not on whatever is in
 * the working directory.
 *
 * A git worktree parked in the repo root, a leftover directory from a deleted
 * package, a stale build artifact — none of it is this tree's source, and none
 * of it exists in CI's checkout. Reading it produces two failures, and the
 * second is the dangerous one:
 *
 *   false red    fails locally on content CI never sees, which teaches everyone
 *                to dismiss the checker — including when it is right
 *   false green  validates ANOTHER checkout's files and reports success while
 *                this tree is broken
 *
 * The false green is not hypothetical. check-retail-spine-closure.mjs printed
 * "Verified retail spine package closure" against `worktrees/<branch>/packages/*`
 * while this tree carried a forbidden edge that CI then caught (voyant#4281).
 *
 * So each checker below is asserted on twice: it ignores untracked content, and
 * it still goes red on a real violation. Only the pair is meaningful — a checker
 * that ignores everything trivially passes the first.
 */

const repoRoot = process.cwd()

const CHECKERS = [
  { name: "retail-spine-closure", script: "scripts/check-retail-spine-closure.mjs" },
  { name: "proposal-vocabulary", script: "scripts/check-proposal-vocabulary.mjs" },
  { name: "dependency-versions", script: "scripts/check-dependency-versions.mjs" },
]

function run(script) {
  try {
    execFileSync(process.execPath, [path.join(repoRoot, script)], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
    })
    return { ok: true, output: "" }
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` }
  }
}

/**
 * Plants an untracked tree shaped like a parked git worktree — a full nested
 * checkout with manifests and sources that would trip every checker here.
 */
const PROBE_ROOT = path.join(repoRoot, "worktrees", "__tracked_scan_probe__")

function plantProbe(root = PROBE_ROOT) {
  const pkg = path.join(root, "packages", "probe-pkg")
  mkdirSync(path.join(pkg, "src"), { recursive: true })
  writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "@voyant-travel/probe-pkg",
      version: "0.0.0",
      // Would fail dependency-versions: a pinned first-party peer range.
      peerDependencies: { "@voyant-travel/framework": "workspace:>=0.65.0 <2.0.0" },
      // Would fail retail-spine-closure: a forbidden hard runtime edge.
      voyant: {
        schemaVersion: "voyant.package.v1",
        kind: "module",
        requiresSchemas: ["@voyant-travel/operations"],
      },
    }),
  )
  // Would fail proposal-vocabulary: retired quote vocabulary.
  //
  // Assembled rather than written literally. This file is TRACKED, and the
  // whole point of the change under test is that proposal-vocabulary now reads
  // the tracked tree — so a literal here is a real violation in a real source
  // file. The alternative is an entry in that checker's skippedFiles, and its
  // own rule is that exceptions cover frozen history, never new code.
  const retiredRoute = ["", "v1", "admin", `quo${"tes"}`].join("/")
  writeFileSync(path.join(pkg, "src", "thing.ts"), `const route = "${retiredRoute}"\n`)
}

/** Removes the probe, and `worktrees/` itself only when this test created it. */
function cleanupProbe() {
  rmSync(PROBE_ROOT, { recursive: true, force: true })
  try {
    rmdirSync(path.join(repoRoot, "worktrees"))
  } catch {
    /* a real worktrees/ directory is not ours to delete */
  }
}

function withUntrackedWorktree(assertion) {
  try {
    plantProbe()
    assertion()
  } finally {
    cleanupProbe()
  }
}

test("trackedFilesIn ignores an untracked file and returns null off-repo", async () => {
  const { trackedFilesIn, resetTrackedFilesCache } = await import("../lib/tracked-files.mjs")
  resetTrackedFilesCache()

  const stray = path.join(repoRoot, "__tracked_files_probe__.ts")
  try {
    writeFileSync(stray, "export const x = 1\n")
    const tracked = trackedFilesIn(repoRoot)
    assert.ok(Array.isArray(tracked) && tracked.length > 0, "the repo must enumerate")
    assert.ok(
      !tracked.includes("__tracked_files_probe__.ts"),
      "an untracked file must not appear in the listing",
    )
  } finally {
    rmSync(stray, { force: true })
    resetTrackedFilesCache()
  }

  // A `--root <fixture>` tree is not a repository. Returning an empty listing
  // there would turn every fixture-driven vacuity test green while checking
  // nothing, so it must return null and let the caller walk.
  assert.equal(trackedFilesIn(path.join(repoRoot, "packages")), null)
})

for (const checker of CHECKERS) {
  test(`${checker.name} ignores an untracked worktree in the repo root`, () => {
    withUntrackedWorktree(() => {
      const result = run(checker.script)
      assert.ok(result.ok, `${checker.name} read untracked content:\n${result.output}`)
      assert.doesNotMatch(
        result.output,
        /__tracked_scan_probe__/,
        `${checker.name} reported a path inside the untracked probe`,
      )
    })
  })
}

test("retail-spine-closure still goes red on a tracked violation", () => {
  // The pair that makes the assertions above mean something: a checker that
  // ignored everything would pass them all.
  const manifest = path.join(repoRoot, "packages", "catalog", "package.json")
  const original = execFileSync("git", ["show", "HEAD:packages/catalog/package.json"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
  try {
    const parsed = JSON.parse(original)
    parsed.voyant.requiresSchemas = ["@voyant-travel/db", "@voyant-travel/operations"]
    writeFileSync(manifest, `${JSON.stringify(parsed, null, 2)}\n`)
    const result = run("scripts/check-retail-spine-closure.mjs")
    assert.ok(!result.ok, "a forbidden hard runtime edge must fail the closure gate")
    assert.match(result.output, /Forbidden hard runtime edges/)
  } finally {
    writeFileSync(manifest, original)
  }
})
