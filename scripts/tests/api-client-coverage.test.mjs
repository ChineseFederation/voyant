import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { clientDocuments, surfaceDocuments, surfaceOf } from "../lib/api-client-documents.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const manifest = path.join(root, "scripts/api-clients.json")
const checker = path.join(root, "scripts/check-api-client-coverage.mjs")

const run = () => {
  try {
    execFileSync("node", [checker], { cwd: root, stdio: "pipe", encoding: "utf8" })
    return { ok: true, output: "" }
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` }
  }
}

test("the surface is derived independently of how a client selects its inputs", () => {
  // The property the check rests on. Deriving the surface from the client's own
  // selection makes the comparison a tautology — the first version did exactly
  // that and passed while the public client covered 9% of its surface.
  const single = { document: "packages/public-api/openapi/public-api/public-api.json", outDir: "x" }
  assert.equal(surfaceOf(single), "public-api")
  assert.ok(
    surfaceDocuments(surfaceOf(single)).length > 1,
    "a single-document client must still resolve its whole surface",
  )
  assert.deepEqual(clientDocuments(single).parts, [single.document])
})

test("surfaceOf refuses a client it cannot place", () => {
  assert.throws(() => surfaceOf({ document: "elsewhere/thing.json", outDir: "x" }), /cannot derive/)
})

test("the real tree is fully covered", () => {
  const result = run()
  assert.ok(result.ok, result.output)
})

// Without this the check could pass for the wrong reason forever. It is the
// pair that means something: green on the tree, red on a real regression.
test("a client that stops covering its surface fails", () => {
  const original = readFileSync(manifest)
  try {
    const parsed = JSON.parse(original.toString("utf8"))
    for (const client of parsed.clients) {
      if (!client.compose) continue
      client.document = client.info
      client.surface = undefined
      client.compose = undefined
      client.info = undefined
    }
    writeFileSync(manifest, `${JSON.stringify(parsed, null, 2)}\n`)

    const result = run()
    assert.equal(result.ok, false, "narrowing a client to one document must fail")
    assert.match(result.output, /does not cover/)
  } finally {
    writeFileSync(manifest, original)
  }
})
