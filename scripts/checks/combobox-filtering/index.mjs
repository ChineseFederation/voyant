#!/usr/bin/env node
/** Runner for the combobox-filtering check. See combobox-filtering.mjs. */
import fs from "node:fs"
import path from "node:path"

import { trackedFilesIn } from "../../lib/tracked-files.mjs"
import { findViolations } from "./combobox-filtering.mjs"

const repoRoot = process.cwd()
const tracked = trackedFilesIn(repoRoot)

if (!tracked) {
  console.error("combobox-filtering: not a git toplevel, nothing to scan.")
  process.exit(1)
}

const sources = tracked.filter(
  (file) => file.endsWith(".tsx") && (file.startsWith("packages/") || file.startsWith("apps/")),
)

const offenders = []
let scanned = 0

for (const file of sources) {
  const source = fs.readFileSync(path.join(repoRoot, file), "utf8")
  if (!source.includes("<Combobox")) continue
  scanned += 1
  for (const violation of findViolations(source)) {
    offenders.push(`${file}:${violation.line}`)
  }
}

if (offenders.length === 0) {
  console.log(
    `combobox-filtering: OK — every combobox that stringifies for submission also stringifies for display (${scanned} file(s) scanned).`,
  )
  process.exit(0)
}

console.error("Comboboxes pass `itemToStringValue` without `itemToStringLabel`.")
console.error("base-ui filters the list by the item's LABEL string. With no `itemToStringLabel` it")
console.error(
  "stringifies the item itself — a record id — so typing a record's name matches nothing",
)
console.error("and the picker reports its empty state for records the API returned.\n")
for (const offender of offenders.sort()) console.error(`  - ${offender}`)
console.error(
  `\n${offenders.length} combobox(es). Pass \`itemToStringLabel\` with the label the item renders, or take filtering over with \`filter\` / \`filteredItems\`.`,
)
process.exit(1)
