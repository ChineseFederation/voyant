import assert from "node:assert/strict"
import test from "node:test"

import {
  diffRouteSets,
  documentedRoutes,
  formatRouteSetDiff,
  mountedRoutes,
} from "../checks/routes/assertions.ts"

/**
 * Synthetic source and markdown rather than the real files: the assertions are
 * pure over supplied text, so these stay hermetic. They exist to prove the
 * check can go red in both directions — a doc that only ever passes is exactly
 * the doc voyant#4188 was written against.
 */
const source = `
export const otherPaths = ["/v1/admin/decoy"] as const
export const catalogPaths = [
  "/v1/admin/thing",
  "/v1/admin/thing/:id",
  "/v1/public/thing",
] as const
`

const doc = `# Doc

<!-- mounted-routes: catalogPaths -->

\`\`\`text
POST   /v1/{admin,public}/thing
GET    /v1/admin/thing/{id}
\`\`\`

Prose mentioning /v1/admin/not-a-route that must not be scraped.
`

test("the mounted set is read from the named export, not another array", () => {
  assert.deepEqual(mountedRoutes(source, "catalogPaths"), [
    "/v1/admin/thing",
    "/v1/admin/thing/:id",
    "/v1/public/thing",
  ])
})

test("an export that is not an array literal is an error, not an empty set", () => {
  assert.throws(
    () => mountedRoutes("export const catalogPaths = buildPaths()", "catalogPaths"),
    /not an array literal/,
  )
})

test("the documented set expands surfaces and normalises path params", () => {
  assert.deepEqual(documentedRoutes(doc, "mounted-routes: catalogPaths"), [
    { method: "POST", path: "/v1/admin/thing" },
    { method: "POST", path: "/v1/public/thing" },
    { method: "GET", path: "/v1/admin/thing/:id" },
  ])
})

test("only the fenced block is read, so prose cannot add or remove a route", () => {
  const mounted = mountedRoutes(source, "catalogPaths")
  const diff = diffRouteSets(mounted, documentedRoutes(doc, "mounted-routes: catalogPaths"))
  assert.deepEqual(diff, { mountedNotDocumented: [], documentedNotMounted: [], duplicates: [] })
})

test("a missing marker is an error rather than a vacuous pass", () => {
  assert.throws(() => documentedRoutes(doc, "mounted-routes: gone"), /is absent from the doc/)
})

test("both directions of drift are named", () => {
  const diff = diffRouteSets(
    ["/v1/admin/thing", "/v1/admin/added"],
    [
      { method: "POST", path: "/v1/admin/thing" },
      { method: "GET", path: "/v1/admin/removed" },
    ],
  )
  assert.deepEqual(diff.mountedNotDocumented, ["/v1/admin/added"])
  assert.deepEqual(diff.documentedNotMounted, ["/v1/admin/removed"])

  const message = formatRouteSetDiff(
    { source: "src.ts", export: "catalogPaths", doc: "doc.md", marker: "m" },
    diff,
  ).join("\n")
  assert.match(message, /mounted but not documented/)
  assert.match(message, /documented but not mounted/)
})

test("two methods on one path are documentation; the same line twice is not", () => {
  const twoMethods = [
    { method: "GET", path: "/v1/admin/thing" },
    { method: "PATCH", path: "/v1/admin/thing" },
  ]
  assert.deepEqual(diffRouteSets(["/v1/admin/thing"], twoMethods).duplicates, [])
  assert.deepEqual(diffRouteSets(["/v1/admin/thing"], [twoMethods[0], twoMethods[0]]).duplicates, [
    "GET /v1/admin/thing",
  ])
})
