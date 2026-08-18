#!/usr/bin/env node
/**
 * Every tracked OpenAPI document is either generated from its routes, or
 * recorded as not-generatable with a reason.
 *
 * `verify:openapi-drift` regenerates the documents listed in
 * `generated-specs.json` and diffs them; `verify:openapi-path-ownership` proves
 * a generator actually produces their paths. Neither can see a document that is
 * in *neither* file, because absence from a registry is silent — a hand-written
 * 83rd document would simply never be checked by anything, and nothing would
 * say so. That is how the 56 unregistered documents this programme started from
 * stayed unregistered: not one check was failing.
 *
 * This closes the set, so the two registries together have to account for every
 * document, and the accounting is a fact in the tree rather than a note in an
 * issue.
 *
 * The enumeration is shared with `check-openapi-dialect.mjs` rather than
 * repeated. A second copy of the "what is a document" regex would drift from
 * the first exactly the way the documents drifted from the routes.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { closureViolations } from "./checks/openapi/assertions.mjs"
import { trackedDocuments } from "./checks/openapi/documents.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const documents = trackedDocuments(root)
if (documents === null) {
  console.error("check-openapi-document-closure: not a git toplevel; nothing to check.")
  process.exit(1)
}

const read = (file) =>
  JSON.parse(readFileSync(path.join(root, "scripts/checks/openapi", file), "utf8"))

const { generators } = read("generated-specs.json")
const { limit, documents: exempt } = read("not-generatable.json")

const registered = new Set(
  generators.flatMap((generator) => generator.files).filter((file) => file.endsWith(".json")),
)

const violations = closureViolations({ documents, registered, exempt, limit })

if (violations.length > 0) {
  console.error("OpenAPI document closure check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

const generated = documents.filter((file) => registered.has(file)).length
console.log(
  `check-openapi-document-closure: ${documents.length} tracked documents — ` +
    `${generated} generated from their routes, ${Object.keys(exempt).length} recorded as ` +
    `not-generatable with a reason.`,
)
