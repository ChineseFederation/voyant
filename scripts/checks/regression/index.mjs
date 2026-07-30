#!/usr/bin/env node
/**
 * Retired-surface check — see docs/adr/0016-modules-as-components-of-one-deployable.md.
 *
 * A large share of the per-module `*authority*` scripts exist to assert that
 * something deleted stays deleted. That is one rule over a list, not 30 rules:
 * 91 `existsSync` guards across those scripts reduce to the single declarative
 * list in retired-paths.json.
 *
 * The scripts still carry their own copies; this engine is the replacement they
 * will be collapsed onto.
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = process.cwd()
const dataPath = path.join(here, "retired-paths.json")

const { retiredPaths } = JSON.parse(readFileSync(dataPath, "utf8"))

if (!Array.isArray(retiredPaths) || retiredPaths.length === 0) {
  console.error("verify:retired-surfaces: retired-paths.json declares no paths")
  process.exit(1)
}

const seen = new Set()
const problems = []

for (const entry of retiredPaths) {
  const target = typeof entry === "string" ? entry : entry?.path
  if (typeof target !== "string" || target.length === 0) {
    problems.push(`malformed entry in retired-paths.json: ${JSON.stringify(entry)}`)
    continue
  }
  if (seen.has(target)) {
    problems.push(`duplicate entry in retired-paths.json: ${target}`)
    continue
  }
  seen.add(target)

  if (existsSync(path.join(repoRoot, target))) {
    const by = Array.isArray(entry.retiredBy) ? entry.retiredBy.join(", ") : "unattributed"
    problems.push(
      `${target} was retired but exists again (retired by: ${by}). ` +
        `If bringing it back is intended, remove it from retired-paths.json in the same change.`,
    )
  }
}

if (problems.length > 0) {
  console.error("Retired-surface verification failed:\n")
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}

console.log(`verify:retired-surfaces: ${seen.size} retired paths still absent.`)
