import assert from "node:assert/strict"
import test from "node:test"

import { parseArgs, usage } from "../run-mcp-capability-eval.mjs"

test("defaults to a one-run smoke evaluation", () => {
  const options = parseArgs([])
  assert.equal(options.mode, "smoke")
  assert.equal(options.model, "gpt-5.6-terra")
})

test("accepts the measurement lane and artifact destination", () => {
  const options = parseArgs([
    "--",
    "--mode",
    "measure",
    "--model",
    "gpt-test",
    "--artifacts",
    "tmp/eval",
  ])
  assert.equal(options.mode, "measure")
  assert.equal(options.model, "gpt-test")
  assert.match(options.artifactDir, /tmp\/eval$/)
})

test("rejects unknown modes and documents the destructive database requirement", () => {
  assert.throws(() => parseArgs(["--mode", "fast"]), /smoke or measure/)
  assert.match(usage(), /database is mutated/i)
})
