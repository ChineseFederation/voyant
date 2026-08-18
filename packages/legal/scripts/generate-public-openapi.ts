/**
 * Regenerates this package's published public OpenAPI document from the live
 * route modules.
 *
 * Three surfaces feed it — contracts, policies and terms — exactly as the admin
 * document does. Driving one alone would delete the others' paths, because the
 * document is written from the live surfaces rather than merged into what was
 * already there.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { stampModuleMetadata } from "@voyant-travel/hono/openapi"

import { contractsPublicRoutes } from "../src/contracts/routes.js"
import { policiesPublicRoutes } from "../src/policies/routes.js"
import { legalTermsPublicRoutes } from "../src/terms/routes.js"

const artifactPath = resolve(import.meta.dirname, "..", "openapi/public-api/legal.json")
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"))

const surfaces = [
  { prefix: "/v1/public/legal/contracts", routes: contractsPublicRoutes },
  { prefix: "/v1/public/legal/policies", routes: policiesPublicRoutes },
  { prefix: "/v1/public/legal/terms", routes: legalTermsPublicRoutes },
]

const CARRIED = ["operationId", "summary", "tags"]
const OPERATION_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"]
const paths: Record<string, unknown> = {}

for (const surface of surfaces) {
  const live = surface.routes.getOpenAPI31Document({
    openapi: artifact.openapi,
    info: artifact.info,
  })
  const absolutise = (path: string) =>
    path === "/" ? surface.prefix : path.startsWith("/v1/") ? path : `${surface.prefix}${path}`
  const prefixed = {
    ...live,
    paths: Object.fromEntries(
      Object.entries(live.paths ?? {}).map(([path, item]) => [absolutise(path), item]),
    ),
  }

  const declared = new Map<string, Record<string, unknown>>()
  for (const [path, item] of Object.entries(prefixed.paths ?? {})) {
    if (!item || typeof item !== "object") continue
    for (const [method, operation] of Object.entries(item as Record<string, unknown>)) {
      if (operation && typeof operation === "object") {
        declared.set(`${method} ${path}`, { ...(operation as Record<string, unknown>) })
      }
    }
  }

  const stamped = stampModuleMetadata(prefixed, new Map([[surface.prefix, "legal"]]))

  for (const [path, item] of Object.entries(stamped.paths ?? {})) {
    if (!item || typeof item !== "object") continue
    if (path in paths) {
      throw new Error(`legal generate:openapi: ${path} is produced by two surfaces`)
    }
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
}

writeFileSync(artifactPath, `${JSON.stringify({ ...artifact, paths }, null, 2)}\n`)
