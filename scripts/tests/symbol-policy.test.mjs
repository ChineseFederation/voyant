import assert from "node:assert/strict"
import test from "node:test"

import ts from "typescript"

import { checkSymbolPolicy } from "../checks/symbols/assertions.ts"

/**
 * Synthetic sources rather than the real tree: the assertions are pure over a
 * source map, so these stay hermetic and fast. They exist to prove the policy
 * can still go red — the substring pins it replaces were at least visibly
 * wrong when they broke, whereas an AST rule that silently matches nothing
 * looks identical to one that passes.
 */
const parse = (file, code) =>
  ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

const sources = new Map([
  ["packages/a/src/allowed.ts", parse("packages/a/src/allowed.ts", "export const secretThing = 1")],
  ["packages/b/src/other.ts", parse("packages/b/src/other.ts", "export const unrelated = 2")],
  [
    "packages/c/src/composition.ts",
    parse("packages/c/src/composition.ts", "import { loadLegacy } from './x.js'\nloadLegacy()"),
  ],
])

test("a conformant policy produces no violations", () => {
  assert.deepEqual(
    checkSymbolPolicy(sources, {
      referencesWithin: { secretThing: ["packages/a/src/allowed.ts"] },
      absentFrom: { secretThing: ["packages/b/src/other.ts"] },
      presentIn: { "packages/c/src/composition.ts": ["loadLegacy"] },
    }),
    [],
  )
})

test("a symbol escaping its allowlist is caught", () => {
  const violations = checkSymbolPolicy(sources, {
    referencesWithin: { secretThing: ["packages/b/src/other.ts"] },
  })
  assert.match(violations[0], /packages\/a\/src\/allowed\.ts: secretThing escaped its allowlist/)
})

test("an empty allowlist means the symbol must not exist anywhere", () => {
  const violations = checkSymbolPolicy(sources, { referencesWithin: { secretThing: [] } })
  assert.match(violations[0], /must not exist anywhere/)
})

test("a symbol present where it is forbidden is caught", () => {
  const violations = checkSymbolPolicy(sources, {
    absentFrom: { loadLegacy: ["packages/c/src/composition.ts"] },
  })
  assert.match(violations[0], /loadLegacy must not be referenced here/)
})

test("a required symbol missing from a file is caught", () => {
  const violations = checkSymbolPolicy(sources, {
    presentIn: { "packages/b/src/other.ts": ["loadLegacy"] },
  })
  assert.match(violations[0], /must reference loadLegacy/)
})

test("a presentIn rule naming a file that does not exist is caught", () => {
  const violations = checkSymbolPolicy(sources, {
    presentIn: { "packages/gone/src/index.ts": ["anything"] },
  })
  assert.match(violations[0], /expected to exist/)
})

test("a symbol confined to its allowed path produces no onlyIn violation", () => {
  assert.deepEqual(
    checkSymbolPolicy(sources, { onlyIn: { secretThing: ["packages/a/src/allowed.ts"] } }),
    [],
  )
})

test("a symbol named outside its onlyIn patterns is caught", () => {
  const violations = checkSymbolPolicy(sources, {
    onlyIn: { secretThing: ["packages/b/src/other.ts"] },
  })
  assert.match(
    violations.join("\n"),
    /packages\/a\/src\/allowed\.ts: secretThing is owned by this authority and may only be named in packages\/b\/src\/other\.ts/,
  )
})

test("an onlyIn pattern that matches nothing is caught as stale", () => {
  // The failure mode a path list cannot report: the rule still reads as a
  // guard, but nothing it names exists any more, so it can never go red.
  const violations = checkSymbolPolicy(sources, {
    onlyIn: { secretThing: ["packages/a/src/allowed.ts", "packages/gone/src/index.ts"] },
  })
  assert.deepEqual(violations, [
    "packages/gone/src/index.ts: stale onlyIn entry — no source here references secretThing",
  ])
})

test("an empty onlyIn list means the symbol must not exist anywhere", () => {
  const violations = checkSymbolPolicy(sources, { onlyIn: { secretThing: [] } })
  assert.match(violations[0], /must not exist anywhere/)
})

test("onlyIn patterns support * within a segment and ** across segments", () => {
  const reactSources = new Map([
    [
      "packages/bookings-react/src/hooks/use-x.ts",
      parse("packages/bookings-react/src/hooks/use-x.ts", "export const owned = 1"),
    ],
  ])
  assert.deepEqual(
    checkSymbolPolicy(reactSources, { onlyIn: { owned: ["packages/*-react/**"] } }),
    [],
  )
  // `*` must not cross a separator, so the same pattern without `**` misses.
  assert.match(
    checkSymbolPolicy(reactSources, { onlyIn: { owned: ["packages/*-react/*"] } }).join("\n"),
    /may only be named in/,
  )
})

test("absentFrom accepts a glob, so a whole package family can be denied", () => {
  const reactSources = new Map([
    [
      "packages/bookings-react/src/hooks/use-x.ts",
      parse("packages/bookings-react/src/hooks/use-x.ts", "executeCreate()"),
    ],
    ["packages/finance/src/ok.ts", parse("packages/finance/src/ok.ts", "executeCreate()")],
  ])
  const violations = checkSymbolPolicy(reactSources, {
    absentFrom: { executeCreate: ["packages/*-react/**"] },
  })
  assert.deepEqual(violations, [
    "packages/bookings-react/src/hooks/use-x.ts: executeCreate must not be referenced here",
  ])
})

test("identifiers are matched, not substrings", () => {
  // `loadLegacyExtra` contains `loadLegacy` as a substring; the old
  // `.includes()` pins could not tell them apart, and an AST rule must.
  const withLongerName = new Map([
    ["packages/d/src/x.ts", parse("packages/d/src/x.ts", "export const loadLegacyExtra = 1")],
  ])
  assert.deepEqual(
    checkSymbolPolicy(withLongerName, { absentFrom: { loadLegacy: ["packages/d/src/x.ts"] } }),
    [],
  )
})
