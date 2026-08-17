/**
 * Regenerates this package's published admin OpenAPI document from the live
 * route module.
 *
 * The document was hand-written and nothing regenerated it, so it could describe
 * a surface the deployment no longer has — the defect found in finance, legal
 * and the public shopping document, each of which had drifted while a checker
 * reported them as matching their routes.
 *
 * `relationshipsRoutes` composes every sub-app (accounts, person documents,
 * person relationships, customer signals, activities), so one surface produces
 * the whole document.
 *
 * Registered in `scripts/checks/openapi/generated-specs.json`, so
 * `verify:openapi-drift` fails when the artifact and the routes disagree, and
 * `verify:openapi-path-ownership` fails if a path appears here that the routes
 * do not produce.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { stampModuleMetadata } from "@voyant-travel/hono/openapi"

import { relationshipsRoutes } from "../src/routes/index.js"

const PREFIX = "/v1/admin/relationships"
const artifactPath = resolve(import.meta.dirname, "..", "openapi/admin/relationships.json")
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"))

const live = relationshipsRoutes.getOpenAPI31Document({
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
const stamped = stampModuleMetadata(prefixed, new Map([[PREFIX, "relationships"]]))

// `stampModuleMetadata` derives the module, surface and operation ids. The graph
// stamps — which bundle an operation belongs to — are this document's own
// convention and are not derived from the routes, so they are applied here
// rather than silently dropped. Composition adds them again for the document a
// deployment serves; a per-package artifact that carries them should keep
// carrying them.
const OPERATION_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"]
for (const pathItem of Object.values(stamped.paths ?? {})) {
  if (!pathItem || typeof pathItem !== "object") continue
  for (const method of OPERATION_METHODS) {
    const operation = (pathItem as Record<string, unknown>)[method]
    if (!operation || typeof operation !== "object") continue
    Object.assign(operation, {
      "x-voyant-api-id": "@voyant-travel/relationships#api.admin",
      "x-voyant-unit-id": "@voyant-travel/relationships",
      "x-voyant-package-name": "@voyant-travel/relationships",
    })
  }
}

// Built from the live surface alone, never merged into what the artifact held:
// merging only ever adds, so a path the surface stopped serving would survive
// forever with nothing regenerating or comparing it.
writeFileSync(
  artifactPath,
  `${JSON.stringify({ ...artifact, paths: stamped.paths ?? {} }, null, 2)}\n`,
)
