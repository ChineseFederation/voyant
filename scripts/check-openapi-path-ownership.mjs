#!/usr/bin/env node
/**
 * Every path in a generated OpenAPI document must be produced by its generator.
 *
 * `verify:openapi-drift` registers a FILE and regenerates it. Several generators
 * patch only the paths they own and carry the rest of the document through
 * untouched — deliberately, because one document can be fed by several route
 * modules. But only one generator is registered per file, so nothing regenerates
 * the remainder. The file is reported as matching its routes while most of it is
 * never compared to anything.
 *
 * Measured when this was written: of 1,125 paths across 82 documents, drift
 * reported 529 as verified and **392 actually were**. The 137-path gap is where
 * `finance`'s stale `nullable` keywords live, and it is the same shape as the
 * `media` document that was not valid OpenAPI and the endpoint missing from the
 * public shopping document for weeks (voyant#4798). `finance/admin/finance.json`
 * is the extreme: 3 of its 102 paths are generated.
 *
 * A path nobody generates is a passenger. It compiles, it publishes, it appears
 * in the API reference, and it can describe routes that no longer exist.
 *
 * ## How ownership is decided
 *
 * By asking the generator, not by trusting a declaration. The document's `paths`
 * are emptied, the generator runs, and whatever it puts back is what it owns.
 * A declaration would be one more thing that can drift from the code it
 * describes, which is the defect this file exists to catch.
 *
 * The artifact is restored from bytes held in memory, in a `finally` and again
 * on SIGINT/SIGTERM, because a run killed midway must not leave an emptied
 * document behind for `git add -A` to commit. Everything it touches is tracked,
 * so `git checkout -- packages` recovers regardless.
 */
import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const specsPath = path.join(root, "scripts/checks/openapi/generated-specs.json")
const baselinePath = path.join(root, "scripts/checks/openapi/path-ownership-baseline.json")

const { generators } = JSON.parse(readFileSync(specsPath, "utf8"))
const baseline = JSON.parse(readFileSync(baselinePath, "utf8")).unownedPaths

/** Documents to probe: the OpenAPI artifacts, not the generated clients. */
const targets = generators
  .filter((generator) => !generator.command.includes("generate:api-client"))
  .flatMap((generator) =>
    generator.files
      .filter((file) => file.endsWith(".json"))
      .map((file) => ({ file, command: generator.command })),
  )

/** Original bytes, so a killed run cannot leave an emptied document behind. */
const held = new Map()
const restoreAll = () => {
  for (const [file, bytes] of held) writeFileSync(path.join(root, file), bytes)
  held.clear()
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restoreAll()
    process.exit(130)
  })
}

const pathsOf = (file) => Object.keys(JSON.parse(readFileSync(file, "utf8")).paths ?? {})

/** What the generator puts back into an emptied document is what it owns. */
function ownedPaths({ file, command }) {
  const absolute = path.join(root, file)
  const original = readFileSync(absolute)
  held.set(file, original)
  try {
    const document = JSON.parse(original.toString("utf8"))
    document.paths = {}
    writeFileSync(absolute, `${JSON.stringify(document, null, 2)}\n`)
    execSync(command, { cwd: root, stdio: "ignore" })
    return new Set(pathsOf(absolute))
  } finally {
    writeFileSync(absolute, original)
    held.delete(file)
  }
}

const violations = []
const improved = []
let ownedTotal = 0
let pathTotal = 0

try {
  for (const target of targets) {
    const declared = pathsOf(path.join(root, target.file))
    const owned = ownedPaths(target)
    const unowned = declared.filter((route) => !owned.has(route))

    pathTotal += declared.length
    ownedTotal += declared.length - unowned.length

    const allowed = baseline[target.file] ?? 0
    if (unowned.length > allowed) {
      violations.push(
        allowed === 0
          ? `${target.file} carries ${unowned.length} path(s) its generator does not produce, so ` +
              `nothing regenerates or compares them:\n` +
              unowned.map((route) => `      ${route}`).join("\n")
          : `${target.file} carries ${unowned.length} unowned path(s), above its baseline of ` +
              `${allowed}. The baseline may only shrink.`,
      )
    } else if (unowned.length < allowed) {
      improved.push(`${target.file}: ${allowed} -> ${unowned.length}`)
    }
  }
} finally {
  restoreAll()
}

for (const file of Object.keys(baseline)) {
  if (!targets.some((target) => target.file === file)) {
    violations.push(`path-ownership-baseline.json names ${file}, which no generator produces`)
  }
}

if (improved.length > 0) {
  console.error("OpenAPI path ownership improved. Lower the baseline in the same commit:\n")
  for (const line of improved) console.error(`  - ${line}`)
  process.exit(1)
}

if (violations.length > 0) {
  console.error("OpenAPI path ownership check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

const unownedTotal = pathTotal - ownedTotal
console.log(
  `check-openapi-path-ownership: ${ownedTotal}/${pathTotal} paths in registered documents are ` +
    `produced by their generator` +
    (unownedTotal > 0 ? ` (${unownedTotal} carried through unchecked)` : ""),
)
