/**
 * The public bookings document, composed from the four modules the API module
 * itself composes: inquiries, the public booking reads, amendments, and the
 * public booking actions.
 *
 * There is no single exported barrel for this surface — the composition lives
 * inside `createBookingsApiModule` — so it is repeated here. Driving any one of
 * them alone would delete the other three's paths, because the document is
 * written from the live surface rather than merged into what was there.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { OpenAPIHono } from "@hono/zod-openapi"
import { stampModuleMetadata } from "@voyant-travel/hono/openapi"

import { bookingAmendmentPublicRoutes } from "../src/routes-amendments.js"
import { bookingInquiryPublicRoutes } from "../src/routes-inquiries.js"
import { publicBookingRoutes } from "../src/routes-public.js"
import { createPublicBookingActionRoutes } from "../src/routes-public-booking-actions.js"

const PREFIX = "/v1/public/bookings"
const artifactPath = resolve(import.meta.dirname, "..", "openapi/public-api/bookings.json")
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"))

const app = new OpenAPIHono()
  .route("/", bookingInquiryPublicRoutes as never)
  .route("/", publicBookingRoutes as never)
  .route("/", bookingAmendmentPublicRoutes as never)
  .route("/", createPublicBookingActionRoutes() as never)

const live = app.getOpenAPI31Document({ openapi: artifact.openapi, info: artifact.info })

const absolutise = (path: string) =>
  path === "/" ? PREFIX : path.startsWith("/v1/") ? path : `${PREFIX}${path}`
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

const stamped = stampModuleMetadata(prefixed, new Map([[PREFIX, "bookings"]]))

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
