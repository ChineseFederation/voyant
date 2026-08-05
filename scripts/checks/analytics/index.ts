#!/usr/bin/env node
/**
 * Runner for the declarative analytics-conformance rules. See assertions.ts.
 *
 * Rules live in event-catalogue.json: the declared catalogue, the document that
 * claims to describe it, the directories allowed to emit, and the analytics
 * vendors this repository must never take a dependency on.
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { trackedFilesIn } from "../../lib/tracked-files.mjs"
import {
  declaredEvents,
  diffCatalogue,
  documentedEvents,
  type EmittedEvent,
  type EventCatalogueRule,
  emittedEvents,
  forbiddenVendorDependencies,
  forbiddenVendorImports,
  formatCatalogueDiff,
} from "./assertions.ts"

interface RuleFile {
  vendors: { forbidden: string[] }
  catalogues: EventCatalogueRule[]
}

const SOURCE = /\.(ts|tsx)$/
const TEST = /\.(test|spec)\.(ts|tsx)$/

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url))
  const root = join(here, "..", "..", "..")
  const { vendors, catalogues } = JSON.parse(
    readFileSync(join(here, "event-catalogue.json"), "utf8"),
  ) as RuleFile

  // The tracked tree, not the working directory: a git worktree parked in the
  // repository root is another checkout's source, and resolving it here would
  // validate that tree while reporting success for this one (voyant#4281).
  const tracked = trackedFilesIn(root)
  if (tracked === null) {
    console.error("verify:analytics-conformance must run from the repository toplevel.")
    process.exit(1)
  }

  const failures: string[] = []

  for (const rule of catalogues) {
    const declared = declaredEvents(readFileSync(join(root, rule.source), "utf8"), rule.export)
    const documented = documentedEvents(readFileSync(join(root, rule.doc), "utf8"), rule.marker)

    const emitterFiles = tracked.filter(
      (file) =>
        SOURCE.test(file) &&
        !TEST.test(file) &&
        rule.emitters.some((prefix) => file.startsWith(`${prefix}/`)),
    )
    if (emitterFiles.length === 0) {
      // Every "declared but never emitted" line would fire at once, which reads
      // as a catalogue problem rather than as the scan having found nothing.
      failures.push(`${rule.source}: no emitter files matched ${rule.emitters.join(", ")}`)
      continue
    }

    const emitted: EmittedEvent[] = emitterFiles.flatMap((file) =>
      emittedEvents(readFileSync(join(root, file), "utf8"), file),
    )
    failures.push(...formatCatalogueDiff(rule, diffCatalogue(declared, documented, emitted)))

    for (const file of emitterFiles) {
      failures.push(
        ...forbiddenVendorImports(readFileSync(join(root, file), "utf8"), file, vendors.forbidden),
      )
    }
  }

  for (const file of tracked.filter((entry) => entry.endsWith("package.json"))) {
    failures.push(
      ...forbiddenVendorDependencies(
        readFileSync(join(root, file), "utf8"),
        file,
        vendors.forbidden,
      ),
    )
  }

  if (failures.length > 0) {
    console.error("Analytics-event conformance check failed.\n")
    for (const failure of failures) console.error(`  ${failure}`)
    console.error(
      "\nThe catalogue, the document, and the track() calls must agree — and no analytics vendor may appear in this repository.",
    )
    process.exit(1)
  }

  const total = catalogues.reduce(
    (count, rule) =>
      count + declaredEvents(readFileSync(join(root, rule.source), "utf8"), rule.export).size,
    0,
  )
  console.log(
    `verify:analytics-conformance: ${total} declared event(s) match their documentation and their emitters; no analytics vendor is depended on.`,
  )
}

main()
