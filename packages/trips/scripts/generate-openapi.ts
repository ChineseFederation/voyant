/**
 * Regenerate the package-owned operator API documents for Trips.
 *
 * `openapi/admin/trips.json` and `openapi/public-api/trips.json` had no
 * generator, so they were only ever as current as the last person who
 * remembered to hand-edit a document whose own header says "Do not edit by
 * hand". Nothing compared them to the routes: the deployment-graph coverage
 * check validates that a document exists for a surface/module pair, not that
 * it describes the legs that are actually mounted.
 *
 * Mirrors `packages/operations/scripts/generate-openapi.ts`, including the
 * `stampModuleMetadata` call: these package-owned documents are generated
 * outside the application manifest composer, so the same metadata stamping has
 * to be run explicitly for operation ids, summaries, owner and surface to match
 * what the composer would have produced.
 */

import { writeFile } from "node:fs/promises"

import { stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import type { OpenApiDocument } from "@voyant-travel/hono/openapi"
import { generateOpenApiDocument, stampModuleMetadata } from "@voyant-travel/hono/openapi"

import { createTripsPublicSurfaceRoutes, createTripsRoutes } from "../src/routes.js"

const options = {
  info: {
    title: "Voyant Operator API",
    version: "0.0.0",
    description: "Generated from the composed operator app. Do not edit by hand.",
  },
  servers: [{ url: "/", description: "This deployment (same origin)" }],
}

/**
 * The same factory produces both documents — admin-only legs are documented on
 * the public surface too and answer 403 there at runtime, which is the existing
 * contract `createTripsApiModule` mounts. Surface is therefore not passed to
 * the factory.
 *
 * `apiId` is not decoration: `createTripsApiModule` stamps each mounted route
 * tree with its graph API bundle, and `voyant-manifest.test.ts` asserts every
 * operation in the storefront document carries it. Generating without the same
 * stamp silently drops `x-voyant-api-id` from every operation.
 */
const targets = [
  {
    file: "../openapi/admin/trips.json",
    prefix: "/v1/admin/trips",
    apiId: "@voyant-travel/trips#api.admin",
  },
  {
    file: "../openapi/public-api/trips.json",
    prefix: "/v1/public/trips",
    apiId: "@voyant-travel/trips#api.public",
    // The public surface serves the Trip-selection routes too (voyant#4627).
    // Composed through the same helper the runtime module uses, so this
    // document cannot describe a surface the deployment does not serve.
    surface: "public" as const,
  },
] as const

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

function serialize(document: OpenApiDocument) {
  return `${JSON.stringify(document, null, 2)}\n`
}

/**
 * The `generate:openapi` script pipes this through `biome format --write`, the
 * way `@voyant-travel/catalog` does, so the checked-in bytes are the ones
 * `verify:openapi-drift` regenerates and compares. That check is registered in
 * `scripts/checks/openapi/generated-specs.json` and is what stops these
 * drifting again: it fails the moment a Trips route is added, removed or
 * reshaped without regenerating.
 */
await Promise.all(
  targets.map(({ file, prefix, apiId, ...rest }) =>
    writeFile(
      new URL(file, import.meta.url),
      serialize(
        withPrefix(
          generateOpenApiDocument(
            stampOpenApiRegistryApiId(
              "surface" in rest && rest.surface === "public"
                ? createTripsPublicSurfaceRoutes()
                : createTripsRoutes(),
              apiId,
            ),
            options,
          ),
          prefix,
        ),
      ),
    ),
  ),
)
