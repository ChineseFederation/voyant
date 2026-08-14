import assert from "node:assert/strict"
import test from "node:test"

import {
  findUnsupportedPatterns,
  formatPortabilityDiagnostics,
  hasLookaround,
} from "../lib/tool-schema-portability.mjs"

/** The pattern zod v4's `z.email()` emits, verbatim — the one that broke Max. */
const ZOD_EMAIL =
  "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"

/** The lookaround-free pattern the workspace standardises on (schema-kit). */
const PORTABLE_EMAIL =
  "^[A-Za-z0-9_'+-]+(\\.[A-Za-z0-9_'+-]+)*@([A-Za-z0-9][A-Za-z0-9-]*\\.)+[A-Za-z]{2,}$"

test("recognises all four lookaround forms", () => {
  assert.equal(hasLookaround("(?=a)b"), true)
  assert.equal(hasLookaround("(?!a)b"), true)
  assert.equal(hasLookaround("(?<=a)b"), true)
  assert.equal(hasLookaround("(?<!a)b"), true)
  assert.equal(hasLookaround(ZOD_EMAIL), true)
})

test("does not confuse a non-capturing or named group for lookaround", () => {
  assert.equal(hasLookaround("(?:ab)+c"), false)
  assert.equal(hasLookaround("(?<year>[0-9]{4})"), false)
  assert.equal(hasLookaround(PORTABLE_EMAIL), false)
  assert.equal(hasLookaround("^\\+[1-9]\\d{7,14}$"), false)
})

test("reports the provider's own JSON path for a nested union member", () => {
  // Exactly the shape zod emits for `patch: { email: z.email().nullable() }`,
  // and exactly the path the production error named (voyant#4598).
  const findings = findUnsupportedPatterns({
    type: "object",
    properties: {
      patch: {
        type: "object",
        properties: {
          email: { anyOf: [{ type: "string", pattern: ZOD_EMAIL }, { type: "null" }] },
        },
      },
    },
  })

  assert.deepEqual(findings, [
    { path: "$.properties.patch.properties.email.anyOf[0].pattern", pattern: ZOD_EMAIL },
  ])
})

test("descends every schema-bearing keyword", () => {
  const paths = findUnsupportedPatterns({
    oneOf: [{ properties: { a: { pattern: ZOD_EMAIL } } }],
    allOf: [{ items: { pattern: ZOD_EMAIL } }],
    prefixItems: [{ pattern: ZOD_EMAIL }],
    additionalProperties: { pattern: ZOD_EMAIL },
    patternProperties: { "^x": { pattern: ZOD_EMAIL } },
    not: { pattern: ZOD_EMAIL },
    $defs: { Traveler: { properties: { email: { pattern: ZOD_EMAIL } } } },
  }).map((finding) => finding.path)

  assert.deepEqual(paths.sort(), [
    "$.$defs.Traveler.properties.email.pattern",
    "$.additionalProperties.pattern",
    "$.allOf[0].items.pattern",
    "$.not.pattern",
    "$.oneOf[0].properties.a.pattern",
    "$.patternProperties.^x.pattern",
    "$.prefixItems[0].pattern",
  ])
})

test("passes a schema whose patterns are all RE2-safe", () => {
  assert.deepEqual(
    findUnsupportedPatterns({
      type: "object",
      properties: {
        email: {
          anyOf: [{ type: "string", format: "email", pattern: PORTABLE_EMAIL }, { type: "null" }],
        },
        phone: { type: "string", pattern: "^\\+[1-9]\\d{7,14}$" },
        note: { type: "string" },
      },
    }),
    [],
  )
})

test("terminates on a schema document that references itself", () => {
  const node = { type: "object", properties: {} }
  node.properties.self = node
  node.properties.email = { pattern: ZOD_EMAIL }
  assert.deepEqual(
    findUnsupportedPatterns(node).map((finding) => finding.path),
    ["$.properties.email.pattern"],
  )
})

test("ignores a non-schema value that happens to be shaped like one", () => {
  assert.deepEqual(findUnsupportedPatterns(null), [])
  assert.deepEqual(findUnsupportedPatterns("(?!x)"), [])
  assert.deepEqual(findUnsupportedPatterns({ pattern: 42 }), [])
})

test("names the package and Tool in the diagnostic", () => {
  assert.deepEqual(
    formatPortabilityDiagnostics([
      {
        packageName: "@voyant-travel/bookings",
        toolName: "preview_traveler_correction_amendment",
        findings: [{ path: "$.properties.patch.properties.email", pattern: ZOD_EMAIL }],
      },
    ]),
    [
      "@voyant-travel/bookings:preview_traveler_correction_amendment advertises regex lookaround " +
        `at $.properties.patch.properties.email — ${ZOD_EMAIL}`,
    ],
  )
})
