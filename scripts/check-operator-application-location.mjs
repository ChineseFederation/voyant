#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const applicationPath = join(root, "apps", "operator")
const retiredPathParts = ["star" + "ters", "operator"]
const retiredPath = retiredPathParts.join("/")
const violations = []

if (!existsSync(applicationPath)) violations.push("apps/operator must exist")
if (existsSync(join(root, ...retiredPathParts))) violations.push(`${retiredPath} must stay deleted`)

const grep = spawnSync("git", ["grep", "-l", "-F", retiredPath, "--", "."], {
  cwd: root,
  encoding: "utf8",
})
if (grep.status === 0) {
  for (const path of grep.stdout.trim().split(/\r?\n/).filter(Boolean)) {
    violations.push(`${path} still references ${retiredPath}`)
  }
} else if (grep.status !== 1) {
  violations.push(
    `could not scan tracked files: ${grep.stderr.trim() || `git grep exited ${grep.status}`}`,
  )
}

const tracked = spawnSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
})
if (tracked.status !== 0) {
  violations.push(
    `could not list tracked files: ${tracked.stderr.trim() || `git ls-files exited ${tracked.status}`}`,
  )
} else {
  const constructedPathPattern = new RegExp(
    `["']${retiredPathParts[0]}["']\\s*,\\s*["']${retiredPathParts[1]}["']`,
  )
  const escapedPathPattern = new RegExp(`${retiredPathParts[0]}\\\\/${retiredPathParts[1]}`)
  for (const path of tracked.stdout.split("\0").filter(Boolean)) {
    let source
    try {
      source = readFileSync(join(root, path), "utf8")
    } catch {
      continue
    }
    if (source.includes("\0")) continue
    if (constructedPathPattern.test(source) || escapedPathPattern.test(source)) {
      violations.push(`${path} constructs or escapes ${retiredPath}`)
    }
  }
}

if (violations.length > 0) {
  console.error("Operator application location check failed:")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log("operator application location: OK")
