import assert from "node:assert/strict"
import test from "node:test"

import {
  declaredEvents,
  diffCatalogue,
  documentedEvents,
  emittedEvents,
  forbiddenVendorDependencies,
  forbiddenVendorImports,
  formatCatalogueDiff,
} from "../checks/analytics/assertions.ts"

/**
 * Synthetic sources rather than the real files: the assertions are pure over
 * supplied text, so these stay hermetic. They exist to prove the check can go
 * red in every direction it claims to guard — a conformance check that only
 * ever passes is worth exactly nothing, and this one has three sides plus a
 * vendor rule, each of which could silently degrade to a no-op on its own.
 */
const source = `
export const OTHER = { "engine.decoy.event": ["nope"] } as const
export const CATALOGUE = {
  "engine.quote.failed": ["booking_session_id", "failure_reason"],
  "admin.nav.viewed": ["route", "module"],
} as const
`

const doc = `# Doc

<!-- analytics-events: CATALOGUE -->

\`\`\`text
engine.quote.failed   booking_session_id, failure_reason
admin.nav.viewed      route, module
\`\`\`

Prose mentioning engine.not.an.event that must not be scraped.
`

const rule = {
  source: "packages/core/src/analytics-events.ts",
  export: "CATALOGUE",
  doc: "docs/architecture/analytics-events.md",
  marker: "analytics-events: CATALOGUE",
  emitters: ["packages/catalog/src"],
}

test("the catalogue is read from the named export, not another object", () => {
  assert.deepEqual(
    [...declaredEvents(source, "CATALOGUE").entries()],
    [
      ["engine.quote.failed", ["booking_session_id", "failure_reason"]],
      ["admin.nav.viewed", ["route", "module"]],
    ],
  )
})

test("an export that is not an object literal is an error, not an empty set", () => {
  assert.throws(
    () => declaredEvents("export const CATALOGUE = buildCatalogue()", "CATALOGUE"),
    /not an object literal/,
  )
})

test("the documented set is parsed from the fenced block, not from prose", () => {
  assert.deepEqual(
    [...documentedEvents(doc, "analytics-events: CATALOGUE").entries()],
    [
      ["engine.quote.failed", ["booking_session_id", "failure_reason"]],
      ["admin.nav.viewed", ["route", "module"]],
    ],
  )
})

test("a doc listing one event twice is an error, not a silent de-duplication", () => {
  const duplicated = doc.replace(
    "admin.nav.viewed      route, module",
    "admin.nav.viewed      route, module\nadmin.nav.viewed      route, module",
  )
  assert.throws(
    () => documentedEvents(duplicated, "analytics-events: CATALOGUE"),
    /admin\.nav\.viewed more than once/,
  )
})

test("a missing marker is an error, not an empty documented set", () => {
  assert.throws(() => documentedEvents("# Doc\n", "analytics-events: CATALOGUE"), /is absent/)
})

test("emitted events are read through any receiver, with their literal properties", () => {
  const emitted = emittedEvents(
    `
      analytics.track("engine.quote.failed", { booking_session_id: id, failure_reason: reason })
      this.reporter.track("admin.nav.viewed", analyticsProperties({ route, module }))
      queue.track(computedName, { route })
    `,
    "packages/catalog/src/a.ts",
  )
  assert.deepEqual(
    emitted.map((event) => [event.name, event.properties]),
    [
      ["engine.quote.failed", ["booking_session_id", "failure_reason"]],
      ["admin.nav.viewed", ["route", "module"]],
    ],
  )
})

test("a property bag built by spreading is not checked rather than wrongly failed", () => {
  const [event] = emittedEvents(
    `analytics.track("engine.quote.failed", { ...base, failure_reason })`,
    "packages/catalog/src/a.ts",
  )
  assert.equal(event.properties, null)
})

const declared = declaredEvents(source, "CATALOGUE")
const documented = documentedEvents(doc, "analytics-events: CATALOGUE")
const emitted = [
  { name: "engine.quote.failed", file: "a.ts", properties: null },
  { name: "admin.nav.viewed", file: "b.ts", properties: ["route", "module"] },
]

test("an agreeing catalogue, doc and emitter set produces no failures", () => {
  assert.deepEqual(formatCatalogueDiff(rule, diffCatalogue(declared, documented, emitted)), [])
})

test("an event declared but not documented fails", () => {
  const grown = source.replace(
    `"admin.nav.viewed": ["route", "module"],`,
    `"admin.nav.viewed": ["route", "module"],\n  "portal.session.started": ["booking_count"],`,
  )
  const diff = diffCatalogue(declaredEvents(grown, "CATALOGUE"), documented, emitted)
  assert.deepEqual(diff.declaredNotDocumented, ["portal.session.started"])
})

test("an event documented but not declared fails", () => {
  const extra = doc.replace(
    "admin.nav.viewed      route, module",
    "admin.nav.viewed      route, module\nportal.session.started   booking_count",
  )
  const diff = diffCatalogue(
    declared,
    documentedEvents(extra, "analytics-events: CATALOGUE"),
    emitted,
  )
  assert.deepEqual(diff.documentedNotDeclared, ["portal.session.started"])
})

test("properties that disagree between the catalogue and the doc fail", () => {
  const drifted = doc.replace(
    "engine.quote.failed   booking_session_id, failure_reason",
    "engine.quote.failed   booking_session_id, reason",
  )
  const diff = diffCatalogue(
    declared,
    documentedEvents(drifted, "analytics-events: CATALOGUE"),
    emitted,
  )
  assert.match(diff.propertyMismatches.join("\n"), /engine\.quote\.failed/)
})

test("a declared event nothing emits fails", () => {
  const diff = diffCatalogue(declared, documented, [emitted[0]])
  assert.deepEqual(diff.declaredNotEmitted, ["admin.nav.viewed"])
})

test("an emitted event nothing declares fails", () => {
  const diff = diffCatalogue(declared, documented, [
    ...emitted,
    { name: "engine.mystery.happened", file: "c.ts", properties: [] },
  ])
  assert.deepEqual(diff.emittedNotDeclared, ["engine.mystery.happened"])
})

test("a track() call on an unrelated object cannot fail the check", () => {
  const diff = diffCatalogue(declared, documented, [
    ...emitted,
    { name: "song-of-the-year", file: "player.ts", properties: [] },
  ])
  assert.deepEqual(diff.emittedNotDeclared, [])
})

test("an emitted property the catalogue does not declare fails", () => {
  const diff = diffCatalogue(declared, documented, [
    emitted[0],
    { name: "admin.nav.viewed", file: "b.ts", properties: ["route", "module", "user_email"] },
  ])
  assert.deepEqual(diff.undeclaredProperties, [
    "b.ts: admin.nav.viewed emits undeclared user_email",
  ])
})

const VENDORS = ["posthog-js", "@posthog/", "mixpanel"]

test("a vendor import is caught, through static and dynamic import alike", () => {
  assert.deepEqual(
    forbiddenVendorImports(
      `
        import posthog from "posthog-js"
        import { x } from "@posthog/node/edge"
        const later = await import("mixpanel")
      `,
      "packages/catalog/src/a.ts",
      VENDORS,
    ),
    [
      "packages/catalog/src/a.ts: imports posthog-js",
      "packages/catalog/src/a.ts: imports @posthog/node/edge",
      "packages/catalog/src/a.ts: imports mixpanel",
    ],
  )
})

test("a package that merely mentions a vendor in prose is not a violation", () => {
  assert.deepEqual(
    forbiddenVendorImports(
      `// Voyant Cloud binds PostHog; this package must not.\nimport { x } from "./local.js"`,
      "packages/catalog/src/a.ts",
      VENDORS,
    ),
    [],
  )
})

test("a vendor dependency is caught in every manifest field", () => {
  assert.deepEqual(
    forbiddenVendorDependencies(
      JSON.stringify({
        dependencies: { "posthog-node": "^1" },
        peerDependencies: { mixpanel: "^2" },
        devDependencies: { typescript: "^5" },
      }),
      "packages/catalog/package.json",
      [...VENDORS, "posthog-node"],
    ),
    [
      "packages/catalog/package.json: dependencies carries posthog-node",
      "packages/catalog/package.json: peerDependencies carries mixpanel",
    ],
  )
})
