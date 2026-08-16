import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { diffOpenApiCoverage, generateOpenApiDocument } from "@voyant-travel/hono/openapi"
import { describe, expect, it } from "vitest"

import { createCustomerVerificationApiModule } from "../../../src/verification/index.js"

/**
 * Binding a challenge to a subject added `subjectRef` to both public start
 * schemas, and nothing noticed the committed document had gone stale. This
 * asserts the document against the live router so the next such change cannot
 * pass unnoticed.
 */
describe("storefront verification OpenAPI coverage", () => {
  it("documents every public route it serves, and serves every one it documents", () => {
    const apiModule = createCustomerVerificationApiModule()
    const runtime = generateOpenApiDocument(apiModule.publicRoutes as never, {
      info: { title: "storefront-verification", version: "0" },
    })
    const committed = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL("../../../openapi/public-api/identity-verification.json", import.meta.url),
        ),
        "utf8",
      ),
    )

    const diff = diffOpenApiCoverage({
      runtime,
      committed,
      prefix: "/v1/public/customer-verification",
    })

    expect(diff.undocumented).toEqual([])
    expect(diff.stale).toEqual([])
    expect(diff.requestDrift).toEqual([])
    expect(diff.parameterDrift).toEqual([])
  })
})
