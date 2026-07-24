import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  catalogCheckoutDatabaseRuntimePort,
  catalogCheckoutLegalRuntimePort,
  createAcceptanceSignatureSubscriberGraphRuntime,
  createCheckoutFinalizeSubscriberGraphRuntime,
} from "../../src/checkout/subscriber-runtime.js"
import * as commerceToolSurface from "../../src/mcp-runtime.js"
import {
  createPromotionRedemptionSubscriberGraphRuntime,
  promotionRedemptionDatabaseRuntimePort,
  promotionsBulkReindexRuntimePort,
} from "../../src/promotions/subscriber-runtime.js"

interface PublishedExport {
  types: string
  import: string
  default: string
}

interface PackageJson {
  exports: Record<string, string>
  publishConfig: {
    exports: Record<string, PublishedExport>
  }
}

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as PackageJson

describe("@voyant-travel/commerce package exports", () => {
  it.each([
    [
      "./catalog-checkout-subscribers",
      "./src/checkout/subscriber-runtime.ts",
      "checkout/subscriber-runtime",
    ],
    [
      "./promotion-boundary-job",
      "./src/promotions/job-boundary-scheduler.ts",
      "promotions/job-boundary-scheduler",
    ],
  ])("publishes %s with matching source and distribution targets", (subpath, source, dist) => {
    expect(packageJson.exports[subpath]).toBe(source)
    expect(packageJson.publishConfig.exports[subpath]).toEqual({
      types: `./dist/${dist}.d.ts`,
      import: `./dist/${dist}.js`,
      default: `./dist/${dist}.js`,
    })
  })

  it("publishes selected-graph checkout factories and typed host ports", () => {
    expect(packageJson.exports["./runtime-port"]).toBe("./src/runtime-port.ts")
    expect(packageJson.publishConfig.exports["./runtime-port"]).toEqual({
      types: "./dist/runtime-port.d.ts",
      import: "./dist/runtime-port.js",
      default: "./dist/runtime-port.js",
    })
    expect(createAcceptanceSignatureSubscriberGraphRuntime).toBeTypeOf("function")
    expect(createCheckoutFinalizeSubscriberGraphRuntime).toBeTypeOf("function")
    expect(catalogCheckoutDatabaseRuntimePort.id).toBe("commerce.checkout-database")
    expect(catalogCheckoutLegalRuntimePort.id).toBe("legal.acceptance-signature")
  })

  it("publishes the promotion-redemption subscriber runtime subpath", () => {
    expect(packageJson.exports["./promotion-redemption-subscriber"]).toBe(
      "./src/promotions/subscriber-runtime.ts",
    )
    expect(packageJson.publishConfig.exports["./promotion-redemption-subscriber"]).toEqual({
      types: "./dist/promotions/subscriber-runtime.d.ts",
      import: "./dist/promotions/subscriber-runtime.js",
      default: "./dist/promotions/subscriber-runtime.js",
    })
    expect(createPromotionRedemptionSubscriberGraphRuntime).toBeTypeOf("function")
    expect(promotionRedemptionDatabaseRuntimePort.id).toBe("commerce.promotion-redemption-database")
    expect(promotionsBulkReindexRuntimePort.id).toBe("commerce.promotions-bulk-reindex")
  })

  it("keeps promotion command internals out of the published Tool surface", () => {
    expect(commerceToolSurface).not.toHaveProperty("executePromotionCreateCommand")
    expect(commerceToolSurface).not.toHaveProperty("promotionCreatedEventId")
  })
})
