import { describe, expect, it } from "vitest"

import {
  insertProductSchema,
  productListQuerySchema,
  selectProductSchema,
  updateProductSchema,
} from "../../src/validation-core.js"
import { publicCatalogProductSummarySchema } from "../../src/validation-public.js"

const CUSTOMER_TEMPLATE_ID = "ctpl_01j00000000000000000000000"
const ALTERNATE_TEMPLATE_ID = "ctpl_01j00000000000000000000001"
const PRODUCT_ID = "prod_01j00000000000000000000000"

describe("product contract templates", () => {
  it("accepts a contract template soft reference on product mutations", () => {
    const insert = insertProductSchema.parse({
      name: "Contracted tour",
      sellCurrency: "EUR",
      contractTemplateId: CUSTOMER_TEMPLATE_ID,
    })
    const update = updateProductSchema.parse({
      contractTemplateId: ALTERNATE_TEMPLATE_ID,
    })

    expect(insert.contractTemplateId).toBe(CUSTOMER_TEMPLATE_ID)
    expect(update.contractTemplateId).toBe(ALTERNATE_TEMPLATE_ID)
  })

  it("accepts null to inherit the organization default", () => {
    const update = updateProductSchema.parse({ contractTemplateId: null })

    expect(update.contractTemplateId).toBeNull()
  })

  it("surfaces the contract template id on admin and public read shapes", () => {
    expect(
      selectProductSchema.parse({
        id: PRODUCT_ID,
        name: "Contracted tour",
        sellCurrency: "EUR",
        status: "active",
        bookingMode: "date",
        capacityMode: "limited",
        visibility: "public",
        activated: true,
        termsShowOnContract: false,
        contractTemplateId: CUSTOMER_TEMPLATE_ID,
        productSubtypeCode: null,
        durationMinutes: null,
        sellAmountCents: null,
        costAmountCents: null,
        marginPercent: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).contractTemplateId,
    ).toBe(CUSTOMER_TEMPLATE_ID)

    expect(
      publicCatalogProductSummarySchema.parse({
        id: PRODUCT_ID,
        name: "Contracted tour",
        description: null,
        inclusionsHtml: null,
        exclusionsHtml: null,
        termsHtml: null,
        contentLanguageTag: null,
        slug: null,
        shortDescription: null,
        seoTitle: null,
        seoDescription: null,
        bookingMode: "date",
        capacityMode: "limited",
        visibility: "public",
        sellCurrency: "EUR",
        sellAmountCents: null,
        startDate: null,
        endDate: null,
        pax: null,
        contractTemplateId: CUSTOMER_TEMPLATE_ID,
        productType: null,
        categories: [],
        tags: [],
        capabilities: [],
        destinations: [],
        locations: [],
        coverMedia: null,
        isFeatured: false,
      }).contractTemplateId,
    ).toBe(CUSTOMER_TEMPLATE_ID)
  })

  it("supports filtering products by contract template", () => {
    const query = productListQuerySchema.parse({ contractTemplateId: CUSTOMER_TEMPLATE_ID })

    expect(query.contractTemplateId).toBe(CUSTOMER_TEMPLATE_ID)
  })
})
