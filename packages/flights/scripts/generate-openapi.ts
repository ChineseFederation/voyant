/**
 * Regenerates this package's published admin OpenAPI document from the live
 * route module.
 *
 * `openapi/admin/flights.json` says "Do not edit by hand", but nothing
 * regenerated it — so adding `/fare-calendar` and `/served-markets` left the
 * published contract describing a surface the deployment no longer has, and
 * `verify:openapi-drift` could not see it because the artifact was not
 * registered (voyant#4748 review). Same failure legal hit in #4706.
 *
 * Registered in `scripts/checks/openapi/generated-specs.json`, so
 * `verify:openapi-drift` now fails when the artifact and the routes disagree.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { stampModuleMetadata } from "@voyant-travel/hono/openapi"

import { createFlightAdminRoutes } from "../src/api-runtime.js"

const PREFIX = "/v1/admin/flights"
const UNIT_ID = "@voyant-travel/flights"

const artifactPath = resolve(import.meta.dirname, "..", "openapi/admin/flights.json")
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"))

// Generating the document never dispatches a request, so the adapter is never
// resolved. Failing loudly beats handing the generator a fake connector that
// could quietly shape the output.
const routes = createFlightAdminRoutes({
  resolveAdapter: () => {
    throw new Error("The OpenAPI generator must not resolve a flight connector.")
  },
})

const live = routes.getOpenAPI31Document({
  openapi: artifact.openapi,
  info: artifact.info,
})

// The route module mounts at `/`, so its own document is prefix-relative. The
// published document is absolute, and `stampModuleMetadata` derives operation
// ids, summaries and the owning module from the absolute path — so re-prefix
// before stamping, not after.
const prefixed = {
  ...live,
  paths: Object.fromEntries(
    Object.entries(live.paths ?? {}).map(([path, item]) => [
      path === "/" ? PREFIX : `${PREFIX}${path}`,
      item,
    ]),
  ),
}
const stamped = stampModuleMetadata(prefixed, new Map([[PREFIX, "flights"]]))

/**
 * The composed operator app stamps the owning unit onto every operation;
 * `stampModuleMetadata` does not. Re-applying them here is what keeps
 * regeneration from silently stripping the fields off all twelve existing
 * operations. Every path in this document is owned by flights, so the values
 * are constant.
 */
function withUnitMetadata(item: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...item }
  for (const [method, operation] of Object.entries(item)) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) continue
    next[method] = {
      ...(operation as Record<string, unknown>),
      "x-voyant-unit-id": UNIT_ID,
      "x-voyant-package-name": UNIT_ID,
    }
  }
  return next
}

// Everything under the prefix comes from the live routes, so a retired route
// actually disappears instead of outliving itself in the artifact. Anything
// outside the prefix is another module's and is left alone.
const paths: Record<string, unknown> = {}
for (const [path, item] of Object.entries(artifact.paths as Record<string, unknown>)) {
  if (!path.startsWith(PREFIX)) paths[path] = item
}
for (const [path, item] of Object.entries(stamped.paths ?? {})) {
  paths[path] = withUnitMetadata(item as Record<string, unknown>)
}

writeFileSync(artifactPath, `${JSON.stringify({ ...artifact, paths }, null, 2)}\n`)
