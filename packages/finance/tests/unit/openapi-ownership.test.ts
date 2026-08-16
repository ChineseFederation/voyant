import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  createBookingTaxPreviewRoutes,
  createBookingTaxSettingsRoutes,
} from "../../src/booking-tax.js"
import { createFinanceApiModule } from "../../src/index.js"

const settingsDocument = JSON.parse(
  readFileSync(new URL("../../openapi/admin/booking-tax-settings.json", import.meta.url), "utf8"),
) as { paths: Record<string, Record<string, { "x-voyant-api-id"?: string }>> }
const previewDocument = JSON.parse(
  readFileSync(new URL("../../openapi/admin/booking-tax-preview.json", import.meta.url), "utf8"),
) as { paths: Record<string, Record<string, { "x-voyant-api-id"?: string }>> }

const settingsApiId = "@voyant-travel/finance#booking-tax-settings-extension.api"
const previewApiId = "@voyant-travel/finance#booking-tax-preview-extension.api"

const openApiOptions = {
  openapi: "3.1.0" as const,
  info: {
    title: "Voyant Operator API",
    version: "0.0.0",
    description: "Generated from the composed operator app. Do not edit by hand.",
  },
  servers: [{ url: "/", description: "This deployment (same origin)" }],
}

describe("booking tax OpenAPI ownership", () => {
  it("claims the tax-settings operations on the finance surface", () => {
    const operations = [
      settingsDocument.paths["/v1/admin/finance/tax-settings"]?.get,
      settingsDocument.paths["/v1/admin/finance/tax-settings"]?.patch,
    ]

    expect(operations.every((operation) => operation?.["x-voyant-api-id"] === settingsApiId)).toBe(
      true,
    )
  })

  it("claims the tax-preview operation on the bookings surface", () => {
    expect(previewDocument.paths["/v1/admin/bookings/tax-preview"]?.post?.["x-voyant-api-id"]).toBe(
      previewApiId,
    )
  })

  it("stamps the same ownership on the live route registries", () => {
    const settings = createBookingTaxSettingsRoutes().getOpenAPIDocument({
      info: { title: "test", version: "1" },
    })
    const settingsOps = [
      settings.paths?.["/tax-settings"]?.get,
      settings.paths?.["/tax-settings"]?.patch,
    ]
    expect(settingsOps.every((operation) => operation?.["x-voyant-api-id"] === settingsApiId)).toBe(
      true,
    )

    const preview = createBookingTaxPreviewRoutes().getOpenAPIDocument({
      info: { title: "test", version: "1" },
    })
    expect(preview.paths?.["/tax-preview"]?.post?.["x-voyant-api-id"]).toBe(previewApiId)
  })

  it("stamps base Finance routes without overwriting the tax-settings ownership", () => {
    const routes = createFinanceApiModule().adminRoutes as ReturnType<
      typeof createBookingTaxSettingsRoutes
    >
    const live = routes.getOpenAPIDocument({ info: { title: "test", version: "1" } })

    expect(live.paths?.["/payment-sessions"]?.get?.["x-voyant-api-id"]).toBe(
      "@voyant-travel/finance#api.admin",
    )
    expect(live.paths?.["/tax-settings"]?.get?.["x-voyant-api-id"]).toBe(settingsApiId)
    // The preview route is NOT on the finance surface.
    expect(live.paths?.["/tax-preview"]).toBeUndefined()
  })
})

describe("Travel Credit OpenAPI ownership", () => {
  const financeModule = createFinanceApiModule()
  const adminLive = financeModule.adminRoutes.getOpenAPI31Document(openApiOptions)
  const publicApiLive = financeModule.publicRoutes.getOpenAPI31Document(openApiOptions)
  const adminCommitted = JSON.parse(
    readFileSync(new URL("../../openapi/admin/finance.json", import.meta.url), "utf8"),
  )
  const publicApiCommitted = JSON.parse(
    readFileSync(new URL("../../openapi/public-api/finance.json", import.meta.url), "utf8"),
  )

  it.each([
    ["/travel-credits", "/v1/admin/finance/travel-credits"],
    ["/travel-credits/{id}", "/v1/admin/finance/travel-credits/{id}"],
    ["/travel-credits/{id}/redeem", "/v1/admin/finance/travel-credits/{id}/redeem"],
  ])("keeps the admin %s schema in sync", (livePath, committedPath) => {
    expect(adminCommitted.paths[committedPath]).toEqual(
      withCompositionMetadata(adminLive.paths[livePath], adminCommitted.paths[committedPath]),
    )
  })

  it("keeps the public validation schema in sync", () => {
    const committedPath = publicApiCommitted.paths["/v1/public/finance/travel-credits/validate"]
    expect(committedPath).toEqual(
      withCompositionMetadata(publicApiLive.paths["/travel-credits/validate"], committedPath),
    )
  })

  it("does not publish the former Finance voucher paths", () => {
    expect(Object.keys(adminCommitted.paths)).not.toContain(
      expect.stringContaining("/finance/vouchers"),
    )
    expect(Object.keys(publicApiCommitted.paths)).not.toContain(
      expect.stringContaining("/finance/vouchers"),
    )
  })
})

function withCompositionMetadata(livePath: unknown, committedPath: unknown) {
  const live = structuredClone(livePath) as Record<string, Record<string, unknown>>
  const committed = committedPath as Record<string, Record<string, unknown>>
  for (const [method, operation] of Object.entries(live)) {
    for (const key of ["operationId", "summary", "tags", "x-voyant-module", "x-voyant-surface"]) {
      if (committed[method]?.[key] !== undefined) {
        operation[key] = structuredClone(committed[method][key])
      }
    }
  }
  return live
}
