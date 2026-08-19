/**
 * Regenerates this package's three published admin OpenAPI documents from the
 * live route module.
 *
 * One route module produces all three paths, and each path is published as its
 * own document, so the metadata carried forward for a path must come from *that
 * path's* document — reading one artifact and writing three drops the
 * operationId, tags and graph stamps of the other two.
 *
 * No `stampModuleMetadata`: this package does not depend on `@voyant-travel/hono`,
 * and adding a dependency for a build script would be the tail wagging the dog.
 * The operations carry their own `x-voyant-api-id` from `STORAGE_OPENAPI_API_IDS`,
 * and the rest is carried forward from each document.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { createMediaRoutes } from "../src/routes.js"

/**
 * Satisfies the constructor and is never called. The document comes from static
 * `openAPIRegistry.registerPath` declarations; `resolveStorage` returning null is
 * exactly what an unconfigured deployment does, and signing a ticket is a runtime
 * concern the schema never sees.
 */
const NEVER_RUN = {
  resolveStorage: () => null,
  signVideoUploadTicket: async () => ({}),
} as never

/** Each published document owns exactly one of the module's paths. */
const BY_DOCUMENT: Record<string, string> = {
  "/v1/admin/uploads": "openapi/admin/storage-uploads.json",
  "/v1/admin/uploads/video": "openapi/admin/storage-video-upload-ticket.json",
  "/v1/admin/media/{key}": "openapi/admin/storage-media.json",
}

const CARRIED = ["operationId", "summary", "tags"]
const OPERATION_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"]

const first = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "..", BY_DOCUMENT["/v1/admin/uploads"]), "utf8"),
)
const live = createMediaRoutes(NEVER_RUN).getOpenAPI31Document({
  openapi: first.openapi,
  info: first.info,
})

for (const [route, file] of Object.entries(BY_DOCUMENT)) {
  const produced = (live.paths ?? {})[route] as Record<string, unknown> | undefined
  if (!produced) throw new Error(`storage generate:openapi: routes no longer produce ${route}`)

  const target = resolve(import.meta.dirname, "..", file)
  const document = JSON.parse(readFileSync(target, "utf8"))
  const previous = document.paths?.[route] as Record<string, Record<string, unknown>> | undefined

  for (const method of OPERATION_METHODS) {
    const operation = produced[method] as Record<string, unknown> | undefined
    if (!operation) continue
    for (const [key, value] of Object.entries(previous?.[method] ?? {})) {
      if (!(key.startsWith("x-voyant-") || CARRIED.includes(key))) continue
      if (operation[key] !== undefined) continue
      operation[key] = value
    }
  }

  writeFileSync(
    target,
    `${JSON.stringify({ ...document, paths: { [route]: produced } }, null, 2)}\n`,
  )
}
