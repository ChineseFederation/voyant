import { describe, expect, it } from "vitest"

import {
  effectivePublicationInputSchema,
  insertChannelProductMappingSchema,
  insertChannelProductPublicationSchema,
  insertChannelSupplierPublicationSchema,
  updateChannelProductMappingSchema,
} from "../../src/validation.js"

describe("distribution validation schemas", () => {
  it("defaults channel-push product mapping flags on create", () => {
    expect(
      insertChannelProductMappingSchema.parse({
        channelId: "channel_1",
        productId: "product_1",
        externalProductId: "EXT-1",
      }),
    ).toMatchObject({
      active: true,
      pushBookings: true,
      pushAvailability: true,
      pushContent: true,
    })
  })

  it("does not inject create defaults into product mapping patches", () => {
    expect(updateChannelProductMappingSchema.parse({ sourceKind: "demo" })).toEqual({
      sourceKind: "demo",
    })
  })

  it("rejects unknown fields on product publication contracts", () => {
    expect(() =>
      insertChannelProductPublicationSchema.parse({
        channelId: "channel_1",
        productId: "product_1",
        decision: "include",
        unexpected: true,
      }),
    ).toThrow()
  })

  it("rejects product publication records without subject identifiers", () => {
    expect(() =>
      insertChannelProductPublicationSchema.parse({
        channelId: "channel_1",
        decision: "include",
      }),
    ).toThrow()
  })

  it("rejects supplier publication records without subject identifiers", () => {
    expect(() =>
      insertChannelSupplierPublicationSchema.parse({
        channelId: "channel_1",
        decision: "exclude",
      }),
    ).toThrow()
  })

  it("rejects invalid publication decisions", () => {
    expect(() =>
      insertChannelSupplierPublicationSchema.parse({
        channelId: "channel_1",
        supplierId: "supplier_1",
        decision: "allow",
      }),
    ).toThrow()
  })

  it("keeps effective publication input strict and provider-neutral", () => {
    expect(
      effectivePublicationInputSchema.parse({
        channelId: "channel_1",
        productId: "product_1",
        canonicalSupplierId: null,
      }),
    ).toEqual({
      channelId: "channel_1",
      productId: "product_1",
      canonicalSupplierId: null,
    })
  })
})
