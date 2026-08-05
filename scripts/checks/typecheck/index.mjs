#!/usr/bin/env node
/** Runner for the typecheck-coverage ratchet. See typecheck-coverage.mjs. */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  collectCiCheckedFiles,
  discoverWorkspaceManifests,
  unresolvedCiProjects,
} from "../../lib/ci-typecheck-selection.mjs"
import { checkAgainstBaseline, improvements, uncheckedTestFiles } from "./typecheck-coverage.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = process.cwd()
const baselinePath = path.join(here, "unchecked-tests-baseline.json")

const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", "build"])
const TEST_FILE = /\.test\.tsx?$/

const BASELINE_COMMENT = [
  "Packages carrying test files that no CI job typechecks. Issue #4244.",
  "The set may only SHRINK — a package with no entry here may not start carrying",
  "unchecked tests. Fix a package with the tsconfig split from #4243, then",
  "regenerate with --update-baseline. Never regenerate to clear a failure.",
]

function collectTestFiles(directory) {
  const found = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      // Dot-directories are build output or tooling state (.turbo, .voyant).
      if (entry.name.startsWith(".")) continue
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue
        walk(absolute)
      } else if (TEST_FILE.test(entry.name)) {
        found.push(absolute)
      }
    }
  }
  walk(directory)
  return found
}

const unchecked = new Map()
const notAnalysable = []
const notAnalysableNames = []
let totalTestFiles = 0
let notAnalysableTestFiles = 0

for (const workspace of discoverWorkspaceManifests(repoRoot)) {
  const testFiles = collectTestFiles(workspace.directory)
  totalTestFiles += testFiles.length
  if (testFiles.length === 0) continue

  const unresolved = unresolvedCiProjects(workspace)
  if (unresolved.length > 0) {
    notAnalysableTestFiles += testFiles.length
    notAnalysableNames.push(workspace.manifest.name)
    notAnalysable.push(
      `${workspace.manifest.name} (${testFiles.length} test files): ` +
        `${unresolved.map((project) => path.relative(repoRoot, project)).join(", ")} not generated`,
    )
    continue
  }

  const checkedFiles = collectCiCheckedFiles(workspace)
  const missing = uncheckedTestFiles({ testFiles, checkedFiles })
  if (missing.length > 0) {
    unchecked.set(
      workspace.manifest.name,
      missing.map((file) => path.relative(repoRoot, file)),
    )
  }
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")).packages

if (process.argv.includes("--update-baseline")) {
  // Keep entries for packages this run could not analyse: regenerating from a
  // clean checkout must not silently drop `apps/operator` and leave the next
  // post-build run failing.
  const preserved = baseline.filter((name) => notAnalysableNames.includes(name))
  const packages = [...new Set([...unchecked.keys(), ...preserved])].sort()
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify({ $comment: BASELINE_COMMENT, packages }, null, 2)}\n`,
  )
  console.log(`typecheck-coverage: baseline rewritten with ${packages.length} package(s)`)
  process.exit(0)
}

const violations = checkAgainstBaseline(unchecked, baseline)
if (violations.length > 0) {
  console.error("Typecheck coverage check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  console.error(
    "\nA test nothing typechecks can assert against a shape the code no longer produces " +
      "and still pass. Do not add the package to the baseline to clear this.",
  )
  process.exit(1)
}

const better = improvements(unchecked, baseline, notAnalysableNames)
if (better.length > 0) {
  console.log("typecheck-coverage: these packages improved — tighten the baseline:")
  for (const line of better) console.log(`  - ${line}`)
}

if (notAnalysable.length > 0) {
  console.log("typecheck-coverage: not analysable without a build, skipped:")
  for (const line of notAnalysable) console.log(`  - ${line}`)
}

const uncheckedCount = [...unchecked.values()].reduce((sum, files) => sum + files.length, 0)
const analysed = totalTestFiles - notAnalysableTestFiles
console.log(
  `verify:typecheck-coverage: ${analysed - uncheckedCount}/${analysed} analysed test files ` +
    `typechecked in CI; ${uncheckedCount} unchecked across ${unchecked.size} baselined package(s), none new.`,
)
