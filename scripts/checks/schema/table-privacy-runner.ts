#!/usr/bin/env node
/** Runner for the table-privacy ratchet. See table-privacy.ts. */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { collectSourceFiles, stripComments } from "./source-scan.ts"
import {
  type Baseline,
  checkAgainstBaseline,
  checkWritesAgainstBaseline,
  countReachIns,
  countWriteReachIns,
  type ImportSite,
  improvements,
  type WriteSite,
} from "./table-privacy.ts"

const here = dirname(fileURLToPath(import.meta.url))
const baselinePath = join(here, "table-privacy-baseline.json")

function main(): void {
  const owners = new Map<string, string>()
  const files = collectSourceFiles("packages")
  const stripped = files.map((file) => [file, stripComments(readFileSync(file, "utf8"))] as const)

  for (const [file, text] of stripped) {
    const pkg = file.split("/")[1]
    for (const match of text.matchAll(
      /export const (\w+) = (?:pgTable|\w+\.table)\(\s*"([^"]+)"/g,
    )) {
      owners.set(match[1], pkg)
    }
  }

  const sites: ImportSite[] = []
  for (const [file, text] of stripped) {
    const importer = file.split("/")[1]
    for (const match of text.matchAll(/import\s+(?:type\s+)?\{([^{}]*?)\}\s*from\s*"[^"]+"/gs)) {
      const names = match[1]
        .split(",")
        .map((raw) =>
          raw
            .trim()
            .replace(/^type\s+/, "")
            .split(/\s+as\s+/)[0]
            .trim(),
        )
        .filter(Boolean)
      if (names.length > 0) sites.push({ importer, names })
    }
  }

  // A write only counts when the mutated binding was IMPORTED into this file —
  // a same-named local table is not a reach-in.
  const writeSites: WriteSite[] = []
  for (const [file, text] of stripped) {
    const importer = file.split("/")[1]
    const imported = new Set<string>()
    for (const match of text.matchAll(
      /import\s+\{([^{}]*?)\}\s*from\s*"@voyant-travel\/[^"]+"/gs,
    )) {
      for (const raw of match[1].split(",")) {
        const name = raw.trim()
        if (name === "" || name.startsWith("type ")) continue
        writeSitesPush(imported, name)
      }
    }
    const names: string[] = []
    for (const match of text.matchAll(/\.(?:update|insert|delete)\(\s*(\w+)\s*[),]/g)) {
      if (imported.has(match[1] as string)) names.push(match[1] as string)
    }
    if (names.length > 0) writeSites.push({ importer, names })
  }

  const counts = countReachIns(sites, { owners })
  const writeCounts = countWriteReachIns(writeSites, { owners })
  const manifest = JSON.parse(readFileSync(baselinePath, "utf8"))
  const baseline = manifest.pairs as Baseline
  const writeBaseline = (manifest.writePairs ?? {}) as Baseline

  if (process.argv.includes("--update-baseline")) {
    writeFileSync(
      baselinePath,
      `${JSON.stringify(
        {
          $comment: BASELINE_COMMENT,
          pairs: Object.fromEntries([...counts].sort()),
          writePairs: Object.fromEntries([...writeCounts].sort()),
        },
        null,
        2,
      )}\n`,
    )
    console.log(
      `table-privacy: baseline rewritten with ${counts.size} pairs, ${writeCounts.size} write pairs`,
    )
    return
  }

  const violations = [
    ...checkWritesAgainstBaseline(writeCounts, writeBaseline),
    ...checkAgainstBaseline(counts, baseline),
  ]
  if (violations.length > 0) {
    console.error("Table privacy check failed.\n")
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exit(1)
  }

  const total = [...counts.values()].reduce((sum, n) => sum + n, 0)
  const better = improvements(counts, baseline)
  if (better.length > 0) {
    console.log("table-privacy: these pairs improved — tighten the baseline:")
    for (const line of better) console.log(`  - ${line}`)
  }
  const writeTotal = [...writeCounts.values()].reduce((sum, n) => sum + n, 0)
  console.log(
    `verify:table-privacy: ${total} reach-ins across ${counts.size} pairs, none new. ` +
      `Of those, ${writeTotal} are cross-module WRITES across ${writeCounts.size} pairs — ` +
      "these have no mirror answer and should reach zero.",
  )
}

const BASELINE_COMMENT = [
  "Cross-module table reach-ins, by importer->owner. ADR-0016 decision 6.",
  "A pair may shrink, never grow; a new pair fails. Regenerate with --update-baseline",
  "ONLY when tightening. Foundation packages (db, core, utils, types, schema-kit) are exempt.",
  "",
  "`writePairs` counts the subset that MUTATE another module's tables. A read has",
  "two answers — the owner's service, or a local *Ref mirror. A write has one: a",
  "mirror is read-only by construction. Writes bypass whatever the owner does on",
  "its own writes (revision bumps, validation, events), so they should reach zero",
  "rather than merely stop growing.",
]

/** Adds an import binding, stripping an `x as y` alias to its local name. */
function writeSitesPush(into: Set<string>, specifier: string): void {
  into.add(
    specifier
      .split(/\s+as\s+/)
      .pop()
      ?.trim() ?? specifier,
  )
}

main()
