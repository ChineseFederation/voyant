/**
 * The public realtime document. Same factory as the admin one — the second
 * argument selects which graph bundle the operation belongs to, and that is the
 * only difference between the two documents.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { stampModuleMetadata } from "@voyant-travel/hono/openapi"

import { createRealtimeRoutes, REALTIME_OPENAPI_API_IDS } from "../src/routes.js"

const PREFIX = "/v1/public/realtime"
const artifactPath = resolve(import.meta.dirname, "..", "openapi/public-api/realtime-public.json")
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"))

const live = createRealtimeRoutes({}, REALTIME_OPENAPI_API_IDS.public).getOpenAPI31Document({
  openapi: artifact.openapi,
  info: artifact.info,
})

const absolutise = (path: string) =>
  path === "/" ? PREFIX : path.startsWith("/v1/") ? path : `${PREFIX}${path}`
const prefixed = {
  ...live,
  paths: Object.fromEntries(
    Object.entries(live.paths ?? {}).map(([path, item]) => [absolutise(path), item]),
  ),
}

// Metadata the route declared itself, captured before stamping fills in
// derived placeholders for anything it left out.
const declared = new Map<string, Record<string, unknown>>()
for (const [path, item] of Object.entries(prefixed.paths ?? {})) {
  if (!item || typeof item !== "object") continue
  for (const [method, operation] of Object.entries(item as Record<string, unknown>)) {
    if (operation && typeof operation === "object") {
      declared.set(`${method} ${path}`, { ...(operation as Record<string, unknown>) })
    }
  }
}

const stamped = stampModuleMetadata(prefixed, new Map([[PREFIX, "realtime"]]))

// Precedence: what the ROUTE declared, then what the document already said,
// then what `stampModuleMetadata` derived.
//
// The derived values are placeholders — a summary of "GET /v1/admin/apps" where
// a human wrote "List app registrations" — so they must not beat curated prose.
// But copying the committed value unconditionally is worse: a route that changes
// its own `operationId`, `summary`, `tags` or `x-voyant-api-id` would have the
// change silently reverted, and `verify:openapi-drift` would then reproduce the
// stale contract forever. So the route wins whenever it actually said something.
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

writeFileSync(artifactPath, `${JSON.stringify({ ...artifact, paths }, null, 2)}\n`)
