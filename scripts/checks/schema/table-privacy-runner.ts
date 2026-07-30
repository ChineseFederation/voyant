#!/usr/bin/env node
/** Runner for the table-privacy ratchet. See table-privacy.ts. */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { collectSourceFiles, stripComments } from "./source-scan.ts"
import {
  type Baseline,
  checkAgainstBaseline,
  countReachIns,
  type ImportSite,
  improvements,
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

  const counts = countReachIns(sites, { owners })
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")).pairs as Baseline

  if (process.argv.includes("--update-baseline")) {
    writeFileSync(
      baselinePath,
      `${JSON.stringify({ $comment: BASELINE_COMMENT, pairs: Object.fromEntries([...counts].sort()) }, null, 2)}\n`,
    )
    console.log(`table-privacy: baseline rewritten with ${counts.size} pairs`)
    return
  }

  const violations = checkAgainstBaseline(counts, baseline)
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
  console.log(`verify:table-privacy: ${total} reach-ins across ${counts.size} pairs, none new.`)
}

const BASELINE_COMMENT = [
  "Cross-module table reach-ins, by importer->owner. ADR-0016 decision 6.",
  "A pair may shrink, never grow; a new pair fails. Regenerate with --update-baseline",
  "ONLY when tightening. Foundation packages (db, core, utils, types, schema-kit) are exempt.",
]

main()
