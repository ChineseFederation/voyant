#!/usr/bin/env node
/**
 * Every tracked OpenAPI document must declare the dialect it is written in, and
 * it must be the one the rest of the repository uses.
 *
 * Two defects of this shape landed within a day of each other, and neither was
 * visible to any existing check:
 *
 *   - `packages/media/openapi/admin/media-library.json` had **no `openapi` field
 *     at all**, because its generator never passed one to
 *     `getOpenAPI31Document`. It is not an OpenAPI document, and every standard
 *     tool rejects it. `verify:openapi-drift` could not see it: that check
 *     regenerates and compares, and the generator omitted the field exactly as
 *     consistently as the artifact lacked it, so both sides were wrong in the
 *     same way and agreed.
 *   - `packages/navigation-preferences/openapi/admin/navigation-preferences.json`
 *     was `3.0.0` while the other 81 were `3.1.0`, and carried six `nullable`
 *     keywords that 3.1 does not have.
 *
 * A round-trip check proves reproducibility, not correctness. This asks the
 * question the generator cannot beg: is the artifact the kind of thing it claims
 * to be?
 *
 * Deliberately imperative rather than a rule file: the assertion is about the
 * *contents* of 82 JSON documents, which no existing rule file models.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { trackedFilesIn } from "./lib/tracked-files.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DOCUMENT = /^(?:packages|apps)\/[^/]+\/openapi\/[^/]+\/[^/]+\.json$/
/** The dialect this repository writes. 3.1 aligns OpenAPI with JSON Schema. */
const DIALECT = /^3\.1\.\d+$/

const tracked = trackedFilesIn(root)
if (tracked === null) {
  console.error("check-openapi-dialect: not a git toplevel; nothing to check.")
  process.exit(1)
}

const baseline = JSON.parse(
  readFileSync(path.join(root, "scripts/checks/openapi/nullable-baseline.json"), "utf8"),
).documents

const documents = tracked.filter((file) => DOCUMENT.test(file)).sort()
const violations = []
const improved = []

for (const file of documents) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path.join(root, file), "utf8"))
  } catch (error) {
    violations.push(`${file} is not parseable JSON: ${error.message}`)
    continue
  }

  const declared = parsed.openapi
  if (typeof declared !== "string") {
    violations.push(
      `${file} declares no \`openapi\` version, so it is not an OpenAPI document. ` +
        `If a generator writes it, pass \`openapi\` to \`getOpenAPI31Document\`.`,
    )
    continue
  }
  if (!DIALECT.test(declared)) {
    violations.push(
      `${file} declares \`openapi: "${declared}"\`; this repository writes 3.1.x. ` +
        `Converting is not a version-string edit — 3.0's \`nullable\` has no 3.1 equivalent ` +
        `and becomes a \`type\` union, or is dropped where the schema is untyped.`,
    )
  }

  // `nullable` is a 3.0 keyword; 3.1 spells it `type: ["string", "null"]`.
  //
  // This is a conformance rule, not a correctness one. `openapi-typescript`
  // honours both spellings identically — verified with a controlled fixture,
  // after an earlier version of this comment claimed the opposite and had to be
  // corrected. The point is that a document declaring 3.1 should be readable by
  // anything implementing 3.1, not only by tools that still accept the older
  // keyword.
  //
  // The count is a ratchet: it may shrink, never grow, and a document not in the
  // baseline may never gain one.
  const nullables = (JSON.stringify(parsed).match(/"nullable"/g) ?? []).length
  const allowed = baseline[file] ?? 0
  if (nullables > allowed) {
    violations.push(
      allowed === 0
        ? `${file} introduces the 3.0 \`nullable\` keyword (${nullables}), which 3.1 ignores. ` +
            `Use a type union: \`type: ["string", "null"]\`.`
        : `${file} has ${nullables} \`nullable\` keywords, above its baseline of ${allowed}. ` +
            `The baseline may only shrink.`,
    )
  } else if (nullables < allowed) {
    improved.push(`${file}: ${allowed} -> ${nullables}`)
  }
}

if (documents.length === 0) {
  console.error("check-openapi-dialect: matched no documents, which cannot be right.")
  process.exit(1)
}

// A baseline entry for a document that no longer exists, or that is now clean,
// is a stale exemption — and a stale exemption is how a ratchet stops ratcheting.
for (const file of Object.keys(baseline)) {
  if (!documents.includes(file)) {
    violations.push(`nullable-baseline.json names ${file}, which is not a tracked document`)
  }
}

if (improved.length > 0) {
  console.error("OpenAPI dialect: nullable counts fell. Lower the baseline in the same commit:\n")
  for (const line of improved) console.error(`  - ${line}`)
  process.exit(1)
}

if (violations.length > 0) {
  console.error("OpenAPI dialect check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

const remaining = Object.values(baseline).reduce((sum, count) => sum + count, 0)
console.log(
  `check-openapi-dialect: ${documents.length} documents declare OpenAPI 3.1.x ` +
    `(${remaining} \`nullable\` keywords still to convert, in ${Object.keys(baseline).length} documents)`,
)
