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

import { createPublicApiShoppingPublicRoutes } from "../src/shopping/routes-public.js"

const documentUrl = new URL("../openapi/public-api/public-api.json", import.meta.url)
const current = JSON.parse(await readFile(documentUrl, "utf8")) as OpenApiDocument
const routes = stampOpenApiRegistryApiId(
  createPublicApiShoppingPublicRoutes(),
  "@voyant-travel/public-api#api.public",
)
const generated = generateOpenApiDocument(routes, {
  info: current.info,
  servers: current.servers,
})
const prefixed = stampModuleMetadata(
  {
    ...generated,
    paths: Object.fromEntries(
      Object.entries(generated.paths ?? {}).map(([path, item]) => [
        `/v1/public/shopping${path}`,
        item,
      ]),
    ),
  },
  new Map(),
)

const operationMethods = ["get", "post", "put", "patch", "delete", "head", "options"]
for (const pathItem of Object.values(prefixed.paths ?? {})) {
  if (!pathItem || typeof pathItem !== "object") continue
  for (const method of operationMethods) {
    const operation = (pathItem as Record<string, unknown>)[method]
    if (!operation || typeof operation !== "object") continue
    Object.assign(operation, {
      "x-voyant-api-id": "@voyant-travel/public-api#api.public",
      "x-voyant-package-name": "@voyant-travel/public-api",
    })
  }
}

const shoppingPaths = Object.fromEntries(
  Object.entries(current.paths ?? {}).filter(([path]) => !path.startsWith("/v1/public/shopping")),
)
const next = {
  ...current,
  paths: { ...shoppingPaths, ...prefixed.paths },
}

await writeFile(documentUrl, `${JSON.stringify(next, null, 2)}\n`)
// Keep the committed document's canonical formatting. Without this step,
// JSON.stringify expands every existing compact array and hides the two-path
// semantic change inside thousands of formatting-only lines.
await promisify(execFile)("biome", ["format", "--write", fileURLToPath(documentUrl)])
