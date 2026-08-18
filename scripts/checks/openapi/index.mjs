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
 * Generators that cannot write the same file run concurrently — see
 * `generator-groups.mjs` for why the grouping is by file rather than by package.
 *
 * The originals are restored in a `finally`, and again on SIGINT/SIGTERM, so
 * neither a failing run nor a killed one leaves the tree different from how it
 * found it.
 */
import { execFile } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { driftedFiles } from "./assertions.mjs"
import { CONCURRENCY, commandGroups, inParallel } from "./generator-groups.mjs"

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const { generators } = JSON.parse(readFileSync(join(here, "generated-specs.json"), "utf8"))

const read = (file) => (existsSync(file) ? readFileSync(file) : null)

const failures = []

/**
 * Originals of every generator currently running, keyed by file.
 *
 * The `finally` below covers a generator that throws, but not a process that is
 * killed — Ctrl-C, a CI cancellation, an OOM inside a generator. Without this
 * the regenerated documents are left in the tree, and because the run also
 * *looks* like it just failed, the natural next step is to inspect a tree that
 * has quietly been modified. It is a map rather than a list because several
 * generators are in flight at once.
 */
const inFlight = new Map()
const restoreInFlight = () => {
  for (const [file, bytes] of inFlight) {
    if (bytes !== null) writeFileSync(file, bytes)
  }
  inFlight.clear()
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restoreInFlight()
    process.exit(130)
  })
}

const byCommand = new Map(generators.map((generator) => [generator.command, generator]))

async function checkGenerator(generator) {
  const before = generator.files.map((file) => ({ file, bytes: read(file) }))
  for (const { file, bytes } of before) inFlight.set(file, bytes)
  try {
    const [command, ...args] = generator.command.split(" ")
    await run(command, args)
    const snapshots = before.map(({ file, bytes }) => ({ file, before: bytes, after: read(file) }))
    const drifted = driftedFiles(snapshots)
    if (drifted.length > 0) {
      failures.push(...drifted, `    fix with: ${generator.command}`)
    }
  } catch (error) {
    failures.push(`${generator.command}: generator failed — ${error.message.split("\n")[0]}`)
  } finally {
    for (const { file, bytes } of before) {
      if (bytes !== null) writeFileSync(file, bytes)
      inFlight.delete(file)
    }
  }
}

try {
  await inParallel(commandGroups(generators), async (group) => {
    // Sequential within a group: these commands can write the same file.
    for (const command of group) await checkGenerator(byCommand.get(command))
  })
} finally {
  restoreInFlight()
}

if (failures.length > 0) {
  console.error("Generated OpenAPI documents are out of date.\n")
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

const count = generators.reduce((total, generator) => total + generator.files.length, 0)
console.log(
  `verify:openapi-drift: ${count} generated OpenAPI document(s) match their routes ` +
    `(${generators.length} generators, ${CONCURRENCY} at a time).`,
)
