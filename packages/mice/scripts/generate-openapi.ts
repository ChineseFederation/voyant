/**
 * Regenerates this package's published admin OpenAPI document from the live
 * route module.
 *
 * The document was hand-written with nothing regenerating it, so it could
 * describe a surface the deployment no longer has. Every document brought under
 * generation so far had drifted.
 *
 * Registered in `scripts/checks/openapi/generated-specs.json`, so
 * `verify:openapi-drift` fails when the artifact and the routes disagree, and
 * `verify:openapi-path-ownership` fails if a path appears here that the routes
 * do not produce.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { stampModuleMetadata } from "@voyant-travel/hono/openapi"

import { miceAdminRoutes } from "../src/routes.js"

const PREFIX = "/v1/admin/mice"
const MODULE = "mice"
const artifactPath = resolve(import.meta.dirname, "..", "openapi/admin/mice.json")
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"))

const live = miceAdminRoutes.getOpenAPI31Document({
  openapi: artifact.openapi,
  info: artifact.info,
})

// The route module mounts at `/`, so its own document is prefix-relative, while
// the published document is absolute and `stampModuleMetadata` derives ids from
// the absolute path — so re-prefix before stamping, not after.
const prefixed = {
  ...live,
  paths: Object.fromEntries(
    Object.entries(live.paths ?? {}).map(([path, item]) => [
      path === "/" ? PREFIX : `${PREFIX}${path}`,
      item,
    ]),
  ),
}
const stamped = stampModuleMetadata(prefixed, new Map([[PREFIX, MODULE]]))

// Schemas come from the routes; prose does not. `stampModuleMetadata` derives a
// placeholder summary ("GET /v1/admin/apps") where a human wrote "List app
// registrations", and the `x-voyant-*` graph stamps say which bundle an
// operation belongs to — neither is recoverable from the route definitions.
//
// So these keys are carried forward from the committed operation when it has
// them, exactly as the finance generator does. Which of them a document carries
// varies: some have the full set of stamps, some one key, some none, and some
// have curated summaries where others have nothing.
const CARRIED = ["operationId", "summary", "tags"]
const OPERATION_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"]
const paths: Record<string, unknown> = {}
for (const [path, item] of Object.entries(stamped.paths ?? {})) {
  if (!item || typeof item !== "object") continue
  const previous = artifact.paths?.[path] as Record<string, Record<string, unknown>> | undefined
  for (const method of OPERATION_METHODS) {
    const operation = (item as Record<string, unknown>)[method] as
      | Record<string, unknown>
      | undefined
    if (!operation) continue
    for (const [key, value] of Object.entries(previous?.[method] ?? {})) {
      if (key.startsWith("x-voyant-") || CARRIED.includes(key)) operation[key] = value
    }
  }
  paths[path] = item
}

// Built from the live surface alone, never merged into what the artifact held:
// merging only ever adds, so a path the surface stopped serving would survive
// forever with nothing regenerating or comparing it.
writeFileSync(artifactPath, `${JSON.stringify({ ...artifact, paths }, null, 2)}\n`)
