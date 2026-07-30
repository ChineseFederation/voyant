import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { diffOpenApiCoverage, generateOpenApiDocument } from "@voyant-travel/hono/openapi"
import { describe, expect, it } from "vitest"

import { createBookingsApiModule } from "../../src/index.js"

/**
 * Asserts the published bookings contract against the routes actually served,
 * so a new or moved public route cannot land undocumented.
 */
describe("bookings storefront OpenAPI coverage", () => {
  it("documents every public route it serves, and serves every one it documents", () => {
    const apiModule = createBookingsApiModule()
    const runtime = generateOpenApiDocument(apiModule.publicRoutes as never, {
      info: { title: "bookings", version: "0" },
    })
    const committed = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../openapi/storefront/bookings.json", import.meta.url)),
        "utf8",
      ),
    )

    const diff = diffOpenApiCoverage({
      runtime,
      committed,
      prefix: "/v1/public/bookings",
    })

    expect(diff.undocumented).toEqual([])
    expect(diff.stale).toEqual([])
    expect(diff.requestDrift).toEqual([])
    expect(diff.parameterDrift).toEqual([])
  })
})
