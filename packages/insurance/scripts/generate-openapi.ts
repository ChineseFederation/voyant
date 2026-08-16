/**
 * Generates this package's published admin OpenAPI document from the live route
 * module.
 *
 * The artifact is never hand-edited. It is produced here by driving the real
 * `OpenAPIHono` instance through the same composition the operator app applies
 * (`stampModuleMetadata`), so what ships describes the surface the deployment
 * actually mounts rather than what someone believed it mounted.
 *
 * Register the output in `scripts/checks/openapi/generated-specs.json` so
 * `verify:openapi-drift` fails when the artifact and the routes disagree —
 * three PRs have merged green with stale specs for want of exactly that
 * (voyant#4193, #4204, #4210).
 *
 * Run: `pnpm --filter @voyant-travel/insurance generate:openapi`
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

import { stampModuleMetadata } from "@voyant-travel/hono/openapi"

import { createInsuranceAdminRoutes } from "../src/routes.js"

const PREFIX = "/v1/admin/insurance"
const artifactPath = resolve(import.meta.dirname, "..", "openapi/admin/insurance.json")

const info = { title: "Voyant Insurance Admin API", version: "1.0.0" } as const

// The route module mounts at `/`, so its own document is prefix-relative. The
// published document is absolute, and `stampModuleMetadata` derives operation
// ids and the owning module from the absolute path — so re-prefix before
// stamping, not after.
const live = createInsuranceAdminRoutes({ resolveRuntime: () => undefined }).getOpenAPI31Document({
  openapi: "3.1.0",
  info,
})

const prefixed = {
  ...live,
  paths: Object.fromEntries(
    Object.entries(live.paths ?? {}).map(([path, item]) => [
      path === "/" ? PREFIX : `${PREFIX}${path}`,
      item,
    ]),
  ),
}

const stamped = stampModuleMetadata(prefixed, new Map([[PREFIX, "insurance"]]))

mkdirSync(dirname(artifactPath), { recursive: true })
writeFileSync(artifactPath, `${JSON.stringify(stamped, null, 2)}\n`)
