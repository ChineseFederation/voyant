import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { OpenAPIHono } from "@hono/zod-openapi"

import { mountOperatorSettingsRoutes } from "../src/routes.js"

const app = new OpenAPIHono()
mountOperatorSettingsRoutes(app)

for (const target of [
  { surface: "admin", prefix: "/v1/admin/" },
  { surface: "storefront", prefix: "/v1/public/" },
] as const) {
  const artifactPath = resolve(
    import.meta.dirname,
    `../openapi/${target.surface}/operator-settings.json`,
  )
  const committed = JSON.parse(readFileSync(artifactPath, "utf8")) as OpenApiDocument
  const live = app.getOpenAPI31Document({
    info: committed.info,
    servers: committed.servers,
  })
  const paths = Object.fromEntries(
    Object.entries(live.paths ?? {})
      .filter(
        ([path]) =>
          path.startsWith(target.prefix) &&
          // Payment-provider routes share the runtime mount but are not yet
          // claimed by this package-owned document. Keep generation scoped to
          // the operator profile/settings paths the artifact already owns.
          !path.startsWith("/v1/admin/settings/payments"),
      )
      .map(([path, pathItem]) => [
        path,
        withCompositionMetadata(pathItem as OpenApiPathItem, committed.paths[path]),
      ]),
  )

  writeFileSync(artifactPath, `${JSON.stringify({ ...committed, paths }, null, 2)}\n`)
}

type OpenApiOperation = Record<string, unknown>
type OpenApiPathItem = Record<string, OpenApiOperation>
type OpenApiDocument = {
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
      if (key === "tags" || key === "operationId" || key === "summary" || key.startsWith("x-")) {
        operation[key] = structuredClone(value)
      }
    }
  }
  return result
}
