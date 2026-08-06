import assert from "node:assert/strict"
import { test } from "node:test"

import {
  globToRegExp,
  isIncluded,
  parseIncludeGlobs,
} from "../checks/vitest-include/vitest-include.mjs"

test("reads a literal include array", () => {
  assert.deepEqual(parseIncludeGlobs(`include: ["tests/**/*.test.ts"],`), ["tests/**/*.test.ts"])
  assert.deepEqual(parseIncludeGlobs(`include: ["src/**/*.test.ts", "tests/**/*.test.ts"]`), [
    "src/**/*.test.ts",
    "tests/**/*.test.ts",
  ])
})

test("treats a missing or empty include as no constraint", () => {
  // vitest's default include matches every test file, so there is nothing to
  // exclude and the package must not be reported.
  assert.equal(parseIncludeGlobs(`export default defineConfig({ test: {} })`), null)
  assert.equal(parseIncludeGlobs(`include: []`), null)
})

test("expands brace alternation", () => {
  const globs = parseIncludeGlobs(`include: ["tests/**/*.test.{ts,tsx}"]`)
  assert.ok(isIncluded("tests/a.test.tsx", globs))
  assert.ok(isIncluded("tests/a.test.ts", globs))
  assert.ok(!isIncluded("src/a.test.ts", globs))
})

test("`**/` matches zero directories as well as many", () => {
  // The bug this pins: treating `**` as one-or-more segments reports
  // `src/a.test.ts` as unreachable when vitest does in fact run it.
  const globs = ["src/**/*.test.ts"]
  assert.ok(isIncluded("src/a.test.ts", globs))
  assert.ok(isIncluded("src/deep/nested/a.test.ts", globs))
})

test("`*` does not cross a directory separator", () => {
  assert.ok(!globToRegExp("tests/*.test.ts").test("tests/nested/a.test.ts"))
  assert.ok(globToRegExp("tests/*.test.ts").test("tests/a.test.ts"))
})

test("catches the real case: a src test under a tests-only include", () => {
  const globs = parseIncludeGlobs(`include: ["tests/**/*.test.ts"]`)
  assert.ok(!isIncluded("src/mcp-runtime.test.ts", globs))
  assert.ok(isIncluded("tests/unit/service.test.ts", globs))
})
