/**
 * Regenerate the package-owned operator API document for Operations.
 *
 * `openapi/admin/operations.json` had no generator, so it drifted every time a
 * route was added: the departure summary, the fleet-resource legs, the
 * conflicts projection, the auto-allocate preview and the batch-assign leg were
 * all missing from it. Nothing caught that —
 * `check-operator-openapi-authority.mjs` validates ownership and exports, not
 * content, so both PRs that added those routes went green with a stale
 * document.
 *
 * Mirrors `packages/inventory/scripts/generate-openapi.ts`, including the
 * `stampModuleMetadata` call: these package-owned documents are generated
 * outside the application manifest composer, so the same metadata stamping has
 * to be run explicitly for operation ids, summaries, owner and surface to match
 * what the composer would have produced.
 */

import { readFile, writeFile } from "node:fs/promises"

import type { OpenApiDocument } from "@voyant-travel/hono/openapi"
import { generateOpenApiDocument, stampModuleMetadata } from "@voyant-travel/hono/openapi"

import { operationsAdminRoutes } from "../src/routes.js"

const options = {
  info: {
    title: "Voyant Operator API",
    version: "0.0.0",
    description: "Generated from the composed operator app. Do not edit by hand.",
  },
  servers: [{ url: "/", description: "This deployment (same origin)" }],
}

function withPrefix(document: OpenApiDocument, prefix: string): OpenApiDocument {
  const prefixed = {
    ...document,
    paths: Object.fromEntries(
      Object.entries(document.paths ?? {}).map(([path, item]) => [
        `${prefix}${path === "/" ? "" : path}`,
        item,
      ]),
    ),
  } as OpenApiDocument

  return stampModuleMetadata(prefixed, new Map())
}

const TARGET = "../openapi/admin/operations.json"

async function writeDocument(path: string, document: OpenApiDocument) {
  await writeFile(new URL(path, import.meta.url), serialize(document))
}

function serialize(document: OpenApiDocument) {
  return `${JSON.stringify(document, null, 2)}\n`
}

const document = withPrefix(
  generateOpenApiDocument(operationsAdminRoutes, options),
  "/v1/admin/operations",
)

/**
 * `--check` is what stops this drifting again. The committed document went
 * stale across two merged PRs because nothing compared it to the routes:
 * `check-operator-openapi-authority.mjs` validates ownership and exports, not
 * content. Run in CI, this fails the moment a route is added without
 * regenerating.
 */
if (process.argv.includes("--check")) {
  const committed = await readFile(new URL(TARGET, import.meta.url), "utf8").catch(() => null)
  if (committed !== serialize(document)) {
    console.error(
      "packages/operations/openapi/admin/operations.json is out of date.\n" +
        "Run `pnpm -F @voyant-travel/operations generate:openapi` and commit the result.",
    )
    process.exit(1)
  }
  console.log("operations openapi: up to date")
} else {
  await writeDocument(TARGET, document)
}
