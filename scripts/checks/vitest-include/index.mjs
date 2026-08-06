#!/usr/bin/env node
/** Runner for the vitest-include check. See vitest-include.mjs. */
import fs from "node:fs"
import path from "node:path"

import { discoverWorkspaceManifests } from "../../lib/ci-typecheck-selection.mjs"
import { isIncluded, parseIncludeGlobs } from "./vitest-include.mjs"

const repoRoot = process.cwd()
const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", "build", "coverage"])
const TEST_FILE = /\.test\.tsx?$/
const CONFIG_NAMES = ["vitest.config.ts", "vitest.config.mts", "vitest.config.js"]

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

const excluded = new Map()
const unreadable = []
let scannedPackages = 0

for (const workspace of discoverWorkspaceManifests(repoRoot)) {
  const configName = CONFIG_NAMES.find((name) =>
    fs.existsSync(path.join(workspace.directory, name)),
  )
  if (!configName) continue

  const source = fs.readFileSync(path.join(workspace.directory, configName), "utf8")
  // A config that references another file's include cannot be read statically.
  // Report it rather than pass it, so the blind spot stays visible.
  if (/include\s*:\s*[A-Za-z_$]/.test(source)) {
    unreadable.push(`${workspace.manifest.name} (${configName})`)
    continue
  }

  const globs = parseIncludeGlobs(source)
  // No `include` means vitest's default, which matches every test file.
  if (!globs) continue
  scannedPackages += 1

  for (const file of collectTestFiles(workspace.directory)) {
    const relative = path.relative(workspace.directory, file).split(path.sep).join("/")
    if (isIncluded(relative, globs)) continue
    const entries = excluded.get(workspace.manifest.name) ?? { globs, files: [] }
    entries.files.push(relative)
    excluded.set(workspace.manifest.name, entries)
  }
}

if (unreadable.length > 0) {
  console.warn(
    `vitest-include: ${unreadable.length} config(s) set \`include\` from a variable and were not analysed:`,
  )
  for (const name of unreadable) console.warn(`  - ${name}`)
}

if (excluded.size === 0) {
  console.log(
    `vitest-include: OK — every test file is matched by its package's include (${scannedPackages} package(s) with an explicit include).`,
  )
  process.exit(0)
}

let count = 0
console.error("Test files exist that their own package's vitest `include` never matches.")
console.error("They do not run. Assertions added to them pass by not executing.\n")
for (const [name, entry] of [...excluded].sort()) {
  console.error(`${name}  include: ${JSON.stringify(entry.globs)}`)
  for (const file of entry.files.sort()) {
    console.error(`  - ${file}`)
    count += 1
  }
}
console.error(
  `\n${count} unreachable test file(s). Fix by widening the package's \`include\` (usually adding "src/**/*.test.ts"), or delete the file if it is genuinely dead.`,
)
process.exit(1)
