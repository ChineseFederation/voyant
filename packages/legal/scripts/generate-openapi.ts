/**
 * Regenerates the contracts slice of this package's published admin OpenAPI
 * document from the live route module.
 *
 * `openapi/admin/legal.json` says "Do not edit by hand", but nothing in the
 * repository regenerated it — so adding a route left the published contract
 * describing a surface the deployment no longer has (voyant#4706 review). This
 * drives the real routes through the same composition the operator app applies
 * (`stampModuleMetadata`), so the artifact is generated rather than transcribed.
 *
 * Only the `/v1/admin/legal/contracts` paths are owned here; the policies and
 * terms paths in the same document come from their own route modules and are
 * left untouched.
 *
 * Registered in `scripts/checks/openapi/generated-specs.json`, so
 * `verify:openapi-drift` fails when the artifact and the routes disagree.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { stampModuleMetadata } from "@voyant-travel/hono/openapi"

import { createContractsAdminRoutes } from "../src/contracts/routes.js"

const PREFIX = "/v1/admin/legal/contracts"
const artifactPath = resolve(import.meta.dirname, "..", "openapi/admin/legal.json")
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"))

const live = createContractsAdminRoutes().getOpenAPI31Document({
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
const stamped = stampModuleMetadata(prefixed, new Map([[PREFIX, "legal"]]))

const generated = stamped.paths ?? {}
const paths: Record<string, unknown> = {}
for (const [path, item] of Object.entries(artifact.paths)) {
  paths[path] = path in generated ? generated[path] : item
}
for (const [path, item] of Object.entries(generated)) {
  if (!(path in paths)) paths[path] = item
}

writeFileSync(artifactPath, `${JSON.stringify({ ...artifact, paths }, null, 2)}\n`)
