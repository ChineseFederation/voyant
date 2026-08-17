#!/usr/bin/env node
/** Runner: asserts every authority checker is reachable from the chain. */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { trackedFilesIn } from "../../lib/tracked-files.mjs"
import {
  checkChainReachability,
  checkPackageCheckerReachability,
  readScripts,
} from "./reachability.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../../..")
const allowlistPath = path.join(here, "runs-elsewhere.json")

const scripts = readScripts(path.join(repoRoot, "package.json"))
const checkerFiles = readdirSync(path.join(repoRoot, "scripts"))
  .filter((file) => /authority.*\.mjs$/.test(file))
  .sort()

/**
 * Checkers that live inside a package. The root scan cannot see these — it
 * enumerates one directory and matches invocations by path, while a package
 * checker is reached by script name through `--filter`. See voyant#4627.
 */
const PACKAGE_CHECKER = /^(?:packages|apps)\/[^/]+\/scripts\/[^/]*authority[^/]*\.mjs$/
const packageCheckers = (trackedFilesIn(repoRoot) ?? [])
  .filter((file) => PACKAGE_CHECKER.test(file))
  .sort()
  .map((file) => {
    const packageDir = file.slice(0, file.indexOf("/scripts/"))
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, packageDir, "package.json"), "utf8"),
    )
    const basename = path.basename(file)
    return {
      file,
      packageName: manifest.name,
      scriptNames: Object.entries(manifest.scripts ?? {})
        .filter(([, body]) => body.includes(basename))
        .map(([name]) => name),
    }
  })

const allowed = existsSync(allowlistPath)
  ? (JSON.parse(readFileSync(allowlistPath, "utf8")).runsElsewhere ?? {})
  : {}
// A root entry is a bare filename; a package entry is a repo-relative path.
// Each half validates its own keys, so a stale entry still fails on one side.
const entries = Object.entries(allowed)
const rootAllowed = Object.fromEntries(entries.filter(([file]) => !file.includes("/")))
const packageAllowed = Object.fromEntries(entries.filter(([file]) => file.includes("/")))

const violations = [
  ...checkChainReachability(scripts, checkerFiles, rootAllowed),
  ...checkPackageCheckerReachability(scripts, packageCheckers, packageAllowed),
]

if (violations.length > 0) {
  console.error("Chain reachability check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

const total = checkerFiles.length + packageCheckers.length
console.log(
  `verify:chain-reachability: all ${total} authority checkers run ` +
    `(${packageCheckers.length} package-owned)` +
    (Object.keys(allowed).length > 0 ? `, ${Object.keys(allowed).length} outside the chain` : ""),
)
