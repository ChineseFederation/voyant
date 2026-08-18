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

import { bookingProposalExtensionRoutes } from "../src/booking-extension.js"

const PREFIX = "/v1/admin/bookings"
const MODULE = "proposals"
const artifactPath = resolve(import.meta.dirname, "..", "openapi/admin/proposals-booking.json")
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"))

const live = bookingProposalExtensionRoutes.getOpenAPI31Document({
  openapi: artifact.openapi,
  info: artifact.info,
})

// Route modules use both conventions: some mount at `/` and declare
// prefix-relative paths, others declare the absolute path themselves. Prefixing
// unconditionally double-prefixes the second kind — `/v1/admin/x/v1/admin/x` —
// which reads as a wholesale path rename rather than the mistake it is. The
// published document is absolute either way, and `stampModuleMetadata` derives
// ids from the absolute path, so normalise before stamping, not after.
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

// Built from the live surface alone, never merged into what the artifact held:
// merging only ever adds, so a path the surface stopped serving would survive
// forever with nothing regenerating or comparing it.
writeFileSync(artifactPath, `${JSON.stringify({ ...artifact, paths }, null, 2)}\n`)
