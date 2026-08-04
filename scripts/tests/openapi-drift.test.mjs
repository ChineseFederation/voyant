import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

import { driftedFiles } from "../checks/openapi/assertions.mjs"

test("identical bytes are not drift", () => {
  assert.deepEqual(
    driftedFiles([{ file: "a.json", before: Buffer.from("{}\n"), after: Buffer.from("{}\n") }]),
    [],
  )
})

test("a byte difference is reported against the file that drifted", () => {
  const violations = driftedFiles([
    { file: "a.json", before: Buffer.from("{}\n"), after: Buffer.from("{}\n") },
    { file: "b.json", before: Buffer.from("{}\n"), after: Buffer.from('{"x":1}\n') },
  ])
  assert.deepEqual(violations, ["b.json: checked-in document is stale"])
})

test("a spec the generator no longer emits fails rather than silently passing", () => {
  assert.deepEqual(driftedFiles([{ file: "a.json", before: Buffer.from("{}"), after: null }]), [
    "a.json: the generator did not produce this file",
  ])
})

test("a generated spec that was never checked in fails", () => {
  assert.deepEqual(driftedFiles([{ file: "a.json", before: null, after: Buffer.from("{}") }]), [
    "a.json: generated but not checked in",
  ])
})

test("every spec the manifest names is tracked in the repository", () => {
  const { generators } = JSON.parse(
    readFileSync(new URL("../checks/openapi/generated-specs.json", import.meta.url), "utf8"),
  )
  assert.ok(generators.length > 0)
  for (const generator of generators) {
    assert.ok(generator.command.length > 0, "a generator entry needs a command")
    assert.ok(generator.files.length > 0, `${generator.command} names no files`)
    for (const file of generator.files) {
      assert.ok(existsSync(file), `${file} is named by the manifest but does not exist`)
    }
  }
})
