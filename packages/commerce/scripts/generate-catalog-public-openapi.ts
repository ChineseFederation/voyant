/**
 * Regenerates `@voyant-travel/catalog`'s published public document from the live
 * route modules — from **this** package, because the document is fed by two.
 *
 * `/v1/public/catalog` is served by two route modules in two packages:
 * `catalog`'s product search, and this package's `/checkout/start` (see
 * `../src/checkout/routes.ts`, which says so in its own docblock). Grepping
 * `packages/catalog` for the checkout route therefore finds nothing, and the
 * document looked hand-written for as long as anyone looked there — it was the
 * last of the 82 to be brought under generation for that reason alone
 * (voyant#4852).
 *
 * It lives here rather than in `catalog` because the dependency runs this way:
 * `commerce` depends on `catalog`, not the reverse, so only this side can import
 * both. The artifact stays in `catalog` because that package exports it as
 * `./openapi/public-api`; moving it would be a public-surface change for a
 * reason that is purely about which script writes it.
 *
 * Driving only one of the two modules would delete the other's path, because the
 * document is written from the live surface rather than merged into what was
 * there.
 *
 * Registered in `scripts/checks/openapi/generated-specs.json`, so
 * `verify:openapi-drift` fails when the artifact and the routes disagree, and
 * `verify:openapi-path-ownership` fails if a path appears here that the routes
 * do not produce.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { OpenAPIHono } from "@hono/zod-openapi"
import { createCatalogSearchRoutes } from "@voyant-travel/catalog/search/routes"
import { stampModuleMetadata } from "@voyant-travel/hono/openapi"

import { createCatalogCheckoutRoutes } from "../src/checkout/routes.js"

const PREFIX = "/v1/public/catalog"
const MODULE = "catalog"

// A workspace-relative hop, because `@voyant-travel/catalog` does not export
// `./package.json` and so cannot be resolved to its own root. Adding that export
// to reach an artifact would be a public-surface change made for a build script,
// which is the wrong trade. This is a repo-level generator driven by a
// repo-level check, so it may assume the workspace layout — and if the layout
// moves, `readFileSync` throws immediately rather than writing anywhere wrong.
const artifactPath = resolve(import.meta.dirname, "../../catalog/openapi/public-api/catalog.json")
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"))

// Handlers never run here — only the route registrations are read — so the
// options each factory needs at request time are irrelevant to the document.
const app = new OpenAPIHono()
  .route("/", createCatalogSearchRoutes({ surface: "public" } as never) as never)
  .route("/", createCatalogCheckoutRoutes({} as never) as never)

const live = app.getOpenAPI31Document({ openapi: artifact.openapi, info: artifact.info })

// Route modules use both conventions: some mount at `/` and declare
// prefix-relative paths, others declare the absolute path themselves. Prefixing
// unconditionally double-prefixes the second kind, which reads as a wholesale
// path rename rather than the mistake it is.
const absolutise = (path: string) =>
  path === "/" ? PREFIX : path.startsWith("/v1/") ? path : `${PREFIX}${path}`
const prefixed = {
  ...live,
  paths: Object.fromEntries(
    Object.entries(live.paths ?? {}).map(([path, item]) => [absolutise(path), item]),
  ),
}

// Metadata the route declared itself, captured before stamping fills in derived
// placeholders for anything it left out.
const declared = new Map<string, Record<string, unknown>>()
for (const [path, item] of Object.entries(prefixed.paths ?? {})) {
  if (!item || typeof item !== "object") continue
  for (const [method, operation] of Object.entries(item as Record<string, unknown>)) {
    if (operation && typeof operation === "object") {
      declared.set(`${method} ${path}`, { ...(operation as Record<string, unknown>) })
    }
  }
}

const stamped = stampModuleMetadata(prefixed, new Map([[PREFIX, MODULE]]))

// Precedence: what the ROUTE declared, then what the document already said, then
// what `stampModuleMetadata` derived. The derived values are placeholders — a
// summary of "POST /v1/public/catalog/search" where a human wrote something
// useful — so they must not beat curated prose. Copying the committed value
// unconditionally is worse, though: a route that changes its own `operationId`,
// `summary` or `tags` would have the change silently reverted, and drift would
// then reproduce the stale contract forever.
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
    const routeDeclared = declared.get(`${method} ${path}`) ?? {}
    for (const [key, value] of Object.entries(previous?.[method] ?? {})) {
      if (!(key.startsWith("x-voyant-") || CARRIED.includes(key))) continue
      if (routeDeclared[key] !== undefined) continue
      operation[key] = value
    }
  }
  paths[path] = item
}

// Built from the live surface alone, never merged into what the artifact held:
// merging only ever adds, so a path the surface stopped serving would survive
// forever with nothing regenerating or comparing it.
writeFileSync(artifactPath, `${JSON.stringify({ ...artifact, paths }, null, 2)}\n`)
