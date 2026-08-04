#!/usr/bin/env node
/**
 * Generated OpenAPI documents must match the routes they were generated from.
 *
 * Three PRs merged green against stale specs (voyant#4193, #4204, #4210)
 * because nothing regenerated and diffed them. This runs each generator and
 * compares bytes.
 *
 * It regenerates IN PLACE and restores, rather than into a temp directory,
 * because the checked-in bytes are `biome format`ed with the repository config
 * and biome resolves that config — including `vcs.useIgnoreFile` — from the
 * file's own location. A copy under /tmp formats with tab-indent defaults and a
 * copy under an ignored path is skipped entirely, so either would compare two
 * different formats and fail forever. Reusing the package's own
 * `generate:openapi` script is also the point: a reimplementation here would
 * drift from the real generator exactly the way the specs drifted from the
 * routes.
 *
 * The originals are restored in a `finally`, so a failing run leaves the tree
 * exactly as it found it.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { driftedFiles } from "./assertions.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const { generators } = JSON.parse(readFileSync(join(here, "generated-specs.json"), "utf8"))

const read = (file) => (existsSync(file) ? readFileSync(file) : null)

const failures = []

for (const generator of generators) {
  const before = generator.files.map((file) => ({ file, bytes: read(file) }))
  try {
    const [command, ...args] = generator.command.split(" ")
    execFileSync(command, args, { stdio: "pipe" })
    const snapshots = before.map(({ file, bytes }) => ({
      file,
      before: bytes,
      after: read(file),
    }))
    const drifted = driftedFiles(snapshots)
    if (drifted.length > 0) {
      failures.push(...drifted, `    fix with: ${generator.command}`)
    }
  } catch (error) {
    failures.push(`${generator.command}: generator failed — ${error.message.split("\n")[0]}`)
  } finally {
    for (const { file, bytes } of before) {
      if (bytes !== null) writeFileSync(file, bytes)
    }
  }
}

if (failures.length > 0) {
  console.error("Generated OpenAPI documents are out of date.\n")
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

const count = generators.reduce((total, generator) => total + generator.files.length, 0)
console.log(`verify:openapi-drift: ${count} generated OpenAPI document(s) match their routes.`)
