/**
 * Regenerates this package's published admin OpenAPI document from the live
 * route modules.
 *
 * `openapi/admin/legal.json` says "Do not edit by hand", but nothing in the
 * repository regenerated it — so adding a route left the published contract
 * describing a surface the deployment no longer has (voyant#4706 review). This
 * drives the real routes through the same composition the operator app applies
 * (`stampModuleMetadata`), so the artifact is generated rather than transcribed.
 *
 * It used to own the `/contracts` paths only, and the other 15 — policies and
 * terms — were carried through from the committed artifact untouched. The file
 * was registered for drift, so `verify:openapi-drift` reported the whole
 * document as matching its routes while 15 of its 39 paths were compared to
 * nothing. All three surfaces are driven here now, and
 * `verify:openapi-path-ownership` holds it that way.
 *
 * Registered in `scripts/checks/openapi/generated-specs.json`, so
 * `verify:openapi-drift` fails when the artifact and the routes disagree.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { stampModuleMetadata } from "@voyant-travel/hono/openapi"

import { createContractsAdminRoutes } from "../src/contracts/routes.js"
import { policiesAdminRoutes } from "../src/policies/routes.js"
import { legalTermsAdminRoutes } from "../src/terms/routes.js"

const artifactPath = resolve(import.meta.dirname, "..", "openapi/admin/legal.json")
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"))

const surfaces = [
  { prefix: "/v1/admin/legal/contracts", routes: createContractsAdminRoutes() },
  { prefix: "/v1/admin/legal/policies", routes: policiesAdminRoutes },
  { prefix: "/v1/admin/legal/terms", routes: legalTermsAdminRoutes },
]

const paths: Record<string, unknown> = {}

for (const surface of surfaces) {
  const live = surface.routes.getOpenAPI31Document({
    openapi: artifact.openapi,
    info: artifact.info,
  })

  // Each route module mounts at `/`, so its own document is prefix-relative. The
  // published document is absolute, and `stampModuleMetadata` derives operation
  // ids, summaries and the owning module from the absolute path — so re-prefix
  // before stamping, not after.
  const prefixed = {
    ...live,
    paths: Object.fromEntries(
      Object.entries(live.paths ?? {}).map(([path, item]) => [
        path === "/" ? surface.prefix : `${surface.prefix}${path}`,
        item,
      ]),
    ),
  }
  const stamped = stampModuleMetadata(prefixed, new Map([[surface.prefix, "legal"]]))

  for (const [path, item] of Object.entries(stamped.paths ?? {})) {
    if (path in paths) {
      throw new Error(`legal generate:openapi: ${path} is produced by two surfaces`)
    }
    paths[path] = item
  }
}

// Built from the live surfaces alone, never merged into what the artifact already
// held. Merging only ever adds, so a path a surface stopped serving survived
// forever with nothing regenerating or comparing it — which is the defect this
// generator was widened to close, and it must not leave a residue of its own.
writeFileSync(artifactPath, `${JSON.stringify({ ...artifact, paths }, null, 2)}\n`)
