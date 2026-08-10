import assert from "node:assert/strict"
import test from "node:test"

import { cleanupResult, parseArgs, usage, waitForPostgres } from "../run-mcp-capability-eval.mjs"

test("defaults to a one-run smoke evaluation", () => {
  const options = parseArgs([])
  assert.equal(options.mode, "smoke")
  assert.equal(options.provider, "codex")
  assert.equal(options.model, "gpt-5.6-terra")
})

test("accepts the measurement lane and artifact destination", () => {
  const options = parseArgs([
    "--",
    "--mode",
    "measure",
    "--provider",
    "openai",
    "--model",
    "gpt-test",
    "--journey",
    "proposal-accept",
    "--artifacts",
    "tmp/eval",
  ])
  assert.equal(options.mode, "measure")
  assert.equal(options.provider, "openai")
  assert.equal(options.model, "gpt-test")
  assert.equal(options.journey, "proposal-accept")
  assert.match(options.artifactDir, /tmp\/eval$/)
})

test("accepts an independently seeded operator-job group", () => {
  const options = parseArgs(["--group", "supplier"])
  assert.equal(options.group, "supplier")
  assert.equal(options.journey, null)
  assert.match(usage(), /--group <id>/)
})

test("rejects selecting both a journey and a group", () => {
  assert.throws(
    () => parseArgs(["--journey", "proposal-accept", "--group", "supplier"]),
    /mutually exclusive/,
  )
})

test("rejects unknown modes and documents the destructive database requirement", () => {
  assert.throws(() => parseArgs(["--mode", "fast"]), /smoke or measure/)
  assert.throws(() => parseArgs(["--provider", "other"]), /codex or openai/)
  assert.match(usage(), /database is mutated/i)
  assert.match(usage(), /ChatGPT-authenticated Codex/i)
})

test("records whether disposable database cleanup succeeded", () => {
  assert.deepEqual(cleanupResult("voyant-eval-1", { status: 0, stderr: "" }), {
    database: "temporary-docker",
    container: "voyant-eval-1",
    attempted: true,
    succeeded: true,
    exitCode: 0,
    error: null,
  })
  assert.deepEqual(cleanupResult("voyant-eval-2", { status: 1, stderr: "daemon failed\n" }), {
    database: "temporary-docker",
    container: "voyant-eval-2",
    attempted: true,
    succeeded: false,
    exitCode: 1,
    error: "daemon failed",
  })
})

test("waits for PostgreSQL itself to remain ready before returning", async () => {
  const readiness = [true, false, true, true]
  let probes = 0

  await waitForPostgres("voyant-eval-1", {
    attempts: readiness.length,
    delay: async () => {},
    probe: async () => {
      probes += 1
      return readiness.shift()
    },
  })

  assert.equal(probes, 4)
})
