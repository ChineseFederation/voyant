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

/**
 * The polarity for a sentinel — a value that must have one definition because
 * every copy is a place its meaning can drift (voyant#4637). A sentinel is a
 * string literal, so none of the identifier polarities can see it.
 */
const sentinelSources = new Map([
  [
    "packages/core/src/env.ts",
    parse("packages/core/src/env.ts", 'export const ANON = "anonymous-storefront"'),
  ],
  [
    "packages/other/src/copy.ts",
    parse("packages/other/src/copy.ts", 'const x = userId === "anonymous-storefront"'),
  ],
  [
    "packages/other/src/prose.ts",
    parse(
      "packages/other/src/prose.ts",
      "// the anonymous-storefront principal is not a person\nconst anonymousStorefront = 1",
    ),
  ],
])

test("a literal confined to its owning file produces no literalsOnlyIn violation", () => {
  assert.deepEqual(
    checkSymbolPolicy(
      new Map([...sentinelSources].filter(([file]) => file !== "packages/other/src/copy.ts")),
      { literalsOnlyIn: { "anonymous-storefront": ["packages/core/src/env.ts"] } },
    ),
    [],
  )
})

test("a copy of an owned literal is caught", () => {
  const violations = checkSymbolPolicy(sentinelSources, {
    literalsOnlyIn: { "anonymous-storefront": ["packages/core/src/env.ts"] },
  })
  assert.deepEqual(violations, [
    'packages/other/src/copy.ts: the literal "anonymous-storefront" is owned by this authority and may only be written in packages/core/src/env.ts',
  ])
})

test("naming an owned literal in a comment or an identifier is not a copy of it", () => {
  // Otherwise the rule would forbid explaining itself, which is how a guard
  // gets deleted rather than obeyed.
  assert.deepEqual(
    checkSymbolPolicy(new Map([...sentinelSources].filter(([file]) => file.endsWith("prose.ts"))), {
      literalsOnlyIn: { "anonymous-storefront": [] },
    }),
    [],
  )
})

test("a literalsOnlyIn pattern that matches nothing is caught as stale", () => {
  const violations = checkSymbolPolicy(sentinelSources, {
    literalsOnlyIn: {
      "anonymous-storefront": ["packages/core/src/env.ts", "packages/gone/src/index.ts"],
    },
  })
  assert.ok(
    violations.includes(
      'packages/gone/src/index.ts: stale literalsOnlyIn entry — no source here writes "anonymous-storefront"',
    ),
    violations.join("\n"),
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

// ---- importsAbsentFrom ------------------------------------------------------
//
// The other polarities match identifiers, which cannot express "must not import
// X": a package can be depended on without naming a symbol from it, and the
// substring pins this replaces also matched the package name in a comment.

const importSources = new Map([
  [
    "packages/catalog/src/runtime-support.ts",
    parse(
      "packages/catalog/src/runtime-support.ts",
      'import { thing } from "@voyant-travel/core"\nexport const x = thing',
    ),
  ],
  [
    "packages/catalog/src/offender.ts",
    parse(
      "packages/catalog/src/offender.ts",
      'import { p } from "@voyant-travel/inventory/schema"\nexport const y = p',
    ),
  ],
  [
    "packages/catalog/src/mentions-only.ts",
    parse(
      "packages/catalog/src/mentions-only.ts",
      '// @voyant-travel/inventory is deliberately not imported here\nexport const note = "@voyant-travel/inventory"',
    ),
  ],
])

test("importsAbsentFrom flags an import beneath the banned package", () => {
  const violations = checkSymbolPolicy(importSources, {
    importsAbsentFrom: { "@voyant-travel/inventory": ["packages/catalog/**"] },
  })
  assert.equal(violations.length, 1)
  assert.match(
    violations[0],
    /offender\.ts: must not import @voyant-travel\/inventory \(imports @voyant-travel\/inventory\/schema\)/,
  )
})

test("importsAbsentFrom ignores a comment or string that merely names the package", () => {
  // The substring pin this replaces could not tell these apart.
  const violations = checkSymbolPolicy(
    new Map([
      [
        "packages/catalog/src/mentions-only.ts",
        importSources.get("packages/catalog/src/mentions-only.ts"),
      ],
    ]),
    { importsAbsentFrom: { "@voyant-travel/inventory": ["packages/catalog/**"] } },
  )
  assert.deepEqual(violations, [])
})

test("importsAbsentFrom catches side-effect, dynamic and re-export forms", () => {
  const forms = new Map([
    ["packages/a/side.ts", parse("packages/a/side.ts", 'import "@voyant-travel/inventory"')],
    [
      "packages/a/dyn.ts",
      parse("packages/a/dyn.ts", 'export const f = () => import("@voyant-travel/inventory")'),
    ],
    ["packages/a/re.ts", parse("packages/a/re.ts", 'export * from "@voyant-travel/inventory"')],
  ])
  const violations = checkSymbolPolicy(forms, {
    importsAbsentFrom: { "@voyant-travel/inventory": ["packages/a/**"] },
  })
  assert.equal(violations.length, 3, violations.join("; "))
})

test("importsAbsentFrom matches a relative path into a banned directory", () => {
  const relative = new Map([
    [
      "packages/a/x.ts",
      parse("packages/a/x.ts", 'import { z } from "../../apps/operator/thing.js"'),
    ],
  ])
  const violations = checkSymbolPolicy(relative, {
    importsAbsentFrom: { "apps/operator": ["packages/a/**"] },
  })
  assert.equal(violations.length, 1, violations.join("; "))
})

test("importsAbsentFrom leaves files outside its globs alone", () => {
  const violations = checkSymbolPolicy(importSources, {
    importsAbsentFrom: { "@voyant-travel/inventory": ["packages/other/**"] },
  })
  assert.deepEqual(violations, [])
})
