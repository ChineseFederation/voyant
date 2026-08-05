import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { test } from "node:test"

test("standard frontend authority remains package-owned", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/check-operator-frontend-shell-authority.mjs"],
    { encoding: "utf8" },
  )
  // Shape, not a count. Pinning "13 starter src files" made this the same kind
  // of brittle substring pin the authority scripts are being converted away
  // from: it went stale when starters/ became apps/operator and the file set
  // changed, and it stayed stale because nothing ran this test (voyant#4272).
  // The checker already asserts WHICH files may exist and fails on a new one,
  // so the count adds no coverage.
  assert.match(output, /Operator frontend shell authority: OK \(\d+ application src files\)/)
})
