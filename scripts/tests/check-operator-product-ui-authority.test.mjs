import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { test } from "node:test"

test("standard product UI authority accepts package-owned lazy imports", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/check-operator-product-ui-authority.mjs"],
    { encoding: "utf8" },
  )

  assert.match(output, /Operator product UI authority: OK/)
})
