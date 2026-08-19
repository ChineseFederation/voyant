import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { closureViolations } from "../checks/openapi/assertions.mjs"
import { DOCUMENT, trackedDocuments } from "../checks/openapi/documents.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const base = { documents: ["a.json"], registered: new Set(["a.json"]), exempt: {}, limit: 0 }

test("a document that is generated and not exempt is accounted for", () => {
  assert.deepEqual(closureViolations(base), [])
})

test("a document in neither registry fails", () => {
  const violations = closureViolations({ ...base, registered: new Set() })
  assert.equal(violations.length, 1)
  assert.match(violations[0], /in neither generated-specs\.json nor not-generatable\.json/)
})

test("a document in both registries fails", () => {
  const violations = closureViolations({
    ...base,
    exempt: { "a.json": { reason: "because" } },
    limit: 1,
  })
  assert.equal(violations.length, 1)
  assert.match(violations[0], /registered in generated-specs\.json AND recorded/)
})

test("an exemption naming an untracked document fails", () => {
  const violations = closureViolations({
    ...base,
    exempt: { "gone.json": { reason: "because" } },
    limit: 1,
  })
  assert.deepEqual(violations, [
    "not-generatable.json names gone.json, which is not a tracked document",
  ])
})

test("an exemption without a reason fails", () => {
  for (const entry of [{}, { reason: "" }, { reason: "   " }, { issue: "x" }]) {
    const violations = closureViolations({
      documents: ["a.json"],
      registered: new Set(),
      exempt: { "a.json": entry },
      limit: 1,
    })
    assert.deepEqual(violations, ["not-generatable.json entry for a.json has no `reason`"])
  }
})

test("the exemption list may only shrink", () => {
  const violations = closureViolations({
    documents: ["a.json"],
    registered: new Set(),
    exempt: { "a.json": { reason: "because" } },
    limit: 0,
  })
  assert.match(violations[0], /above its limit of 0. The exemption list may only shrink/)
})

test("removing an entry without lowering the limit fails, so the ratchet keeps ratcheting", () => {
  const violations = closureViolations({ ...base, limit: 1 })
  assert.match(violations[0], /below its limit of 1. Lower `limit` in the same commit/)
})

// Without this the checker would pass on an empty enumeration — reporting
// coverage it never had, which is worse than not running at all.
test("enumerating nothing fails rather than passing vacuously", () => {
  assert.deepEqual(closureViolations({ ...base, documents: [] }), [
    "matched no tracked OpenAPI documents, which cannot be right",
  ])
})

test("the real tree is closed: every tracked document is in exactly one registry", () => {
  const documents = trackedDocuments(root)
  assert.ok(documents !== null, "the repository root must resolve a tracked listing")
  assert.ok(documents.length > 50, `expected the full document set, got ${documents.length}`)

  const read = (file) =>
    JSON.parse(readFileSync(path.join(root, "scripts/checks/openapi", file), "utf8"))
  const { generators } = read("generated-specs.json")
  const { limit, documents: exempt } = read("not-generatable.json")
  const registered = new Set(
    generators.flatMap((generator) => generator.files).filter((file) => file.endsWith(".json")),
  )

  assert.deepEqual(closureViolations({ documents, registered, exempt, limit }), [])
})

test("the document pattern matches a real path and rejects near misses", () => {
  assert.ok(DOCUMENT.test("packages/mcp/openapi/admin/mcp.json"))
  assert.ok(DOCUMENT.test("apps/operator/openapi/admin/operator.json"))
  assert.ok(!DOCUMENT.test("packages/mcp/openapi/admin/mcp.ts"))
  assert.ok(!DOCUMENT.test("packages/mcp/scripts/generate-openapi.ts"))
  assert.ok(!DOCUMENT.test("examples/demo/openapi/admin/demo.json"))
})
