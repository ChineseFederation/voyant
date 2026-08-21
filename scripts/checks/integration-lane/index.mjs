#!/usr/bin/env node
/** Runner for the integration-lane ratchet. See integration-lane.mjs. */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { trackedFilesIn } from "../../lib/tracked-files.mjs"
import {
  checkAgainstBaseline,
  improvements,
  lanedFilesIn,
  unrunIntegrationFiles,
} from "./integration-lane.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = process.cwd()
const baselinePath = path.join(here, "unrun-integration-tests-baseline.json")
const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml")

const INTEGRATION_FILE = /(^|\/)tests\/integration\/.+\.tsx?$/
const TEST_FILE = /\.test\.tsx?$/

const BASELINE_COMMENT = [
  "Integration test files no CI lane runs. Issue #4251.",
  "The set may only SHRINK — a file with no entry here may not start running",
  "nowhere. Add a new file to the db-integration lane in .github/workflows/ci.yml",
  "instead of adding it here. Never regenerate to clear a failure.",
]

/** Package directory -> manifest name, for the tracked package manifests. */
function packageIndex(tracked) {
  const index = []
  for (const file of tracked) {
    if (path.basename(file) !== "package.json") continue
    const directory = path.dirname(file)
    if (directory === ".") continue
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, file), "utf8"))
    } catch {
      continue
    }
    if (!manifest.name) continue
    index.push({ directory, name: manifest.name })
  }
  // Longest directory first so a nested package claims its own files.
  return index.sort((a, b) => b.directory.length - a.directory.length)
}

const tracked = trackedFilesIn(repoRoot)
if (tracked === null) {
  console.error("verify:integration-lane must run from the repository toplevel.")
  process.exit(1)
}

const packages = packageIndex(tracked)
const integrationFiles = []
for (const file of tracked) {
  if (!INTEGRATION_FILE.test(file) || !TEST_FILE.test(file)) continue
  const owner = packages.find(
    (candidate) => file === candidate.directory || file.startsWith(`${candidate.directory}/`),
  )
  if (!owner) continue
  integrationFiles.push({
    package: owner.name,
    path: file.slice(owner.directory.length + 1),
    repoPath: file,
  })
}

const lanedFiles = lanedFilesIn(fs.readFileSync(workflowPath, "utf8"))
const unrun = unrunIntegrationFiles({ integrationFiles, lanedFiles })
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")).files

if (process.argv.includes("--update-baseline")) {
  fs.writeFileSync(
    baselinePath,
    `${JSON.stringify({ $comment: BASELINE_COMMENT, files: unrun }, null, 2)}\n`,
  )
  console.log(`integration-lane: baseline rewritten with ${unrun.length} file(s)`)
  process.exit(0)
}

const violations = checkAgainstBaseline(unrun, baseline)
if (violations.length > 0) {
  console.error("Integration-lane coverage check failed.\n")
  for (const file of violations) console.error(`  - ${file} runs in no CI lane`)
  console.error(
    "\nAdd each file to the db-integration lane in .github/workflows/ci.yml:\n" +
      "    pnpm --filter <package> exec vitest run \\\n" +
      "      tests/integration/<file>.test.ts\n" +
      "A test CI never runs is not coverage. Do not add it to the baseline to clear this.",
  )
  process.exit(1)
}

const better = improvements(unrun, baseline)
if (better.length > 0) {
  console.log("integration-lane: these files now run — tighten the baseline:")
  for (const file of better) console.log(`  - ${file}`)
}

const run = integrationFiles.length - unrun.length
console.log(
  `verify:integration-lane: ${run}/${integrationFiles.length} integration test files run in CI; ` +
    `${unrun.length} baselined, none new.`,
)
