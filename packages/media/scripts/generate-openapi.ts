import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { createMediaLibraryRoutes } from "../src/routes.js"

const artifactPath = resolve(import.meta.dirname, "../openapi/admin/media-library.json")
const committed = JSON.parse(readFileSync(artifactPath, "utf8")) as OpenApiDocument
const live = createMediaLibraryRoutes({
  resolveStorage: () => null,
}).getOpenAPI31Document({
  // `getOpenAPI31Document` emits only what it is given, so omitting this
  // produced a document with no `openapi` field at all — not an OpenAPI
  // document, and rejected outright by anything that validates one. It was
  // invisible because the drift check regenerates and compares, and the
  // generator omitted the field just as consistently as the artifact lacked it.
  openapi: committed.openapi ?? "3.1.0",
  info: committed.info,
  servers: committed.servers,
})

for (const [path, pathItem] of Object.entries(live.paths ?? {})) {
  live.paths[path] = withCompositionMetadata(pathItem as OpenApiPathItem, committed.paths[path])
}

writeFileSync(artifactPath, `${JSON.stringify(live, null, 2)}\n`)

type OpenApiOperation = Record<string, unknown>
type OpenApiPathItem = Record<string, OpenApiOperation>
type OpenApiDocument = {
  openapi?: string
  info: { title: string; version: string; description?: string }
  servers?: Array<{ url: string; description?: string }>
  paths: Record<string, OpenApiPathItem>
}

function withCompositionMetadata(
  live: OpenApiPathItem,
  previous: OpenApiPathItem | undefined,
): OpenApiPathItem {
  const result = structuredClone(live)
  for (const [method, operation] of Object.entries(result)) {
    const previousOperation = previous?.[method]
    if (!previousOperation) continue
    for (const [key, value] of Object.entries(previousOperation)) {
      if (key === "tags" || key.startsWith("x-voyant-")) {
        operation[key] = structuredClone(value)
      }
    }
  }
  return result
}
