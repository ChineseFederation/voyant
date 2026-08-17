import { execFile } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import {
  generateOpenApiDocument,
  type OpenApiDocument,
  stampModuleMetadata,
} from "@voyant-travel/hono/openapi"

import { createPublicApiRoutes } from "../src/routes-public.js"

const documentUrl = new URL("../openapi/public-api/public-api.json", import.meta.url)
const current = JSON.parse(await readFile(documentUrl, "utf8")) as OpenApiDocument
const API_ID = "@voyant-travel/public-api#api.public"
const operationMethods = ["get", "post", "put", "patch", "delete", "head", "options"]

/**
 * The package's public surface, in one pass.
 *
 * This drove `createPublicApiShoppingPublicRoutes()` and carried the other
 * twelve paths through from the committed document untouched, so
 * `verify:openapi-drift` reported all fifteen as matching their routes while
 * twelve were compared to nothing.
 *
 * There is no second surface to add: `createPublicApiRoutes()` already mounts
 * the shopping routes, so it produces all fifteen. Driving both would have
 * documented `/v1/public/shopping/search` twice, which is what the duplicate
 * guard below caught when this was first written that way.
 */
const surfaces = [{ prefix: "/v1/public", routes: createPublicApiRoutes() }]

const paths: Record<string, unknown> = {}

for (const surface of surfaces) {
  const generated = generateOpenApiDocument(stampOpenApiRegistryApiId(surface.routes, API_ID), {
    info: current.info,
    servers: current.servers,
  })
  const prefixed = stampModuleMetadata(
    {
      ...generated,
      paths: Object.fromEntries(
        Object.entries(generated.paths ?? {}).map(([path, item]) => [
          `${surface.prefix}${path}`,
          item,
        ]),
      ),
    },
    new Map(),
  )

  for (const [path, pathItem] of Object.entries(prefixed.paths ?? {})) {
    if (!pathItem || typeof pathItem !== "object") continue
    for (const method of operationMethods) {
      const operation = (pathItem as Record<string, unknown>)[method]
      if (!operation || typeof operation !== "object") continue
      Object.assign(operation, {
        "x-voyant-api-id": API_ID,
        "x-voyant-package-name": "@voyant-travel/public-api",
      })
    }
    if (path in paths) {
      throw new Error(`public-api generate:openapi: ${path} is produced by two surfaces`)
    }
    paths[path] = pathItem
  }
}

// Built from the live surfaces alone, never merged into what the document held.
// Merging only ever adds, so a path a surface stopped serving survived forever
// with nothing regenerating or comparing it.
const next = { ...current, paths }

await writeFile(documentUrl, `${JSON.stringify(next, null, 2)}\n`)
// Keep the committed document's canonical formatting. Without this step,
// JSON.stringify expands every existing compact array and hides the two-path
// semantic change inside thousands of formatting-only lines.
//
// The document passed biome's default 1 MiB ceiling as the public surface
// grew, and biome refuses an oversized file rather than skipping it — so this
// step started exiting non-zero, leaving an unformatted document behind and
// making the generator unrunnable. The spec drifted from the routes while it
// was broken. The ceiling is raised here rather than in biome.json so that
// repo-wide runs keep skipping the 1.8 MiB migration snapshots.
await promisify(execFile)("biome", [
  "format",
  "--write",
  "--files-max-size=8388608",
  fileURLToPath(documentUrl),
])
