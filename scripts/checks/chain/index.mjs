#!/usr/bin/env node
/** Runner: asserts every authority checker is reachable from the chain. */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { checkChainReachability, readScripts } from "./reachability.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../../..")
const allowlistPath = path.join(here, "runs-elsewhere.json")

const scripts = readScripts(path.join(repoRoot, "package.json"))
const checkerFiles = readdirSync(path.join(repoRoot, "scripts"))
  .filter((file) => /authority.*\.mjs$/.test(file))
  .sort()

const allowed = existsSync(allowlistPath)
  ? (JSON.parse(readFileSync(allowlistPath, "utf8")).runsElsewhere ?? {})
  : {}

const violations = checkChainReachability(scripts, checkerFiles, allowed)

if (violations.length > 0) {
  console.error("Chain reachability check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log(
  `verify:chain-reachability: all ${checkerFiles.length} authority checkers run` +
    (Object.keys(allowed).length > 0 ? ` (${Object.keys(allowed).length} outside the chain)` : ""),
)
