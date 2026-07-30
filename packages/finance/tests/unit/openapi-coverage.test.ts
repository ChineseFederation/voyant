import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { diffOpenApiCoverage, generateOpenApiDocument } from "@voyant-travel/hono/openapi"
import { describe, expect, it } from "vitest"

import { createFinanceApiModule } from "../../src/index.js"

/**
 * The committed OpenAPI artifact is the published contract, but nothing ties
 * it to the routes actually served: a new route, a removed route, or a renamed
 * request field can all land without the document noticing. Adding
 * `subjectRef` to a public schema silently staled a document exactly this way.
 *
 * This asserts the document against the live router instead of against review
 * attention.
 */
describe("finance storefront OpenAPI coverage", () => {
  it("documents every public route it serves, and serves every one it documents", () => {
    const apiModule = createFinanceApiModule()
    const runtime = generateOpenApiDocument(apiModule.publicRoutes as never, {
      info: { title: "finance", version: "0" },
    })
    const committed = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../openapi/storefront/finance.json", import.meta.url)),
        "utf8",
      ),
    )

    const diff = diffOpenApiCoverage({
      runtime,
      committed,
      // The public bundle mounts at `finance` on the `/v1/public` surface.
      prefix: "/v1/public/finance",
    })

    expect(diff.undocumented).toEqual([])
    expect(diff.stale).toEqual([])
    expect(diff.requestDrift).toEqual([])
    expect(diff.parameterDrift).toEqual([])
  })
})
