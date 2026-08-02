import type { IndexerSlice } from "@voyant-travel/catalog"
import { describe, expect, it } from "vitest"

import { createProductDocumentEmitter } from "../../src/service-catalog-plane.js"

const sampleRow = {
  id: "prod_abc",
  name: "Bali Wellness Retreat",
  status: "active" as const,
  description: "Source description",
  bookingMode: "date" as const,
  capacityMode: "limited" as const,
  timezone: "Asia/Jakarta",
  visibility: "public" as const,
  activated: true,
  reservationTimeoutMinutes: 30,
  sellCurrency: "EUR",
  sellAmountCents: 250000,
  costAmountCents: 180000,
  marginPercent: 28,
  facilityId: null,
  startDate: "2026-05-01",
  endDate: "2026-12-31",
  pax: 12,
  productTypeId: "ptyp_wellness",
  tags: ["wellness", "yoga"],
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-04-01"),
  // biome-ignore lint/suspicious/noExplicitAny: test fixture -- owner: products; existing suppression is intentional pending typed cleanup.
} as any

const customerSlice: IndexerSlice = {
  vertical: "products",
  locale: "en-GB",
  audience: "customer",
  market: "default",
}

const adminSlice: IndexerSlice = {
  vertical: "products",
  locale: "en-GB",
  audience: "staff-admin",
  market: "default",
}

describe("createProductDocumentEmitter", () => {
  const emitter = createProductDocumentEmitter({ sellerOperatorId: "op_xyz" })

  it("declares its vertical as 'products'", () => {
    expect(emitter.vertical).toBe("products")
  })

  it("emits a document with the entity id as document id", () => {
    const doc = emitter.emit(sampleRow, customerSlice)
    expect(doc.id).toBe("prod_abc")
  })

  it("includes customer-visible facet-affecting structural fields", () => {
    const doc = emitter.emit(sampleRow, customerSlice)
    // bookingMode, productTypeId, start/end dates are visibility:[staff,customer,partner]
    expect(doc.fields).toHaveProperty("bookingMode")
    expect(doc.fields).toHaveProperty("supplyModel")
    expect(doc.fields.supplyModel).toBe("scheduled")
    expect(doc.fields).toHaveProperty("productTypeId")
    expect(doc.fields).toHaveProperty("startDate")
    expect(doc.fields).toHaveProperty("endDate")
  })

  it("excludes staff-only lifecycle status from customer documents", () => {
    const doc = emitter.emit(sampleRow, customerSlice)
    expect(doc.fields).not.toHaveProperty("status")
    expect(doc.fields).not.toHaveProperty("visibility")
    expect(doc.fields).not.toHaveProperty("activated")
  })

  it("includes status but omits deprecated distribution flags from admin documents", () => {
    const doc = emitter.emit(sampleRow, adminSlice)
    expect(doc.fields).toHaveProperty("status")
    expect(doc.fields).not.toHaveProperty("visibility")
    expect(doc.fields).not.toHaveProperty("activated")
  })

  it("excludes costAmountCents and marginPercent from every slice (blob-only — stored on row, not indexed)", () => {
    // These are query: "blob-only" — they live on the entity row but never
    // appear in any indexer document, even admin documents. To query them,
    // join the products table directly.
    const customerDoc = emitter.emit(sampleRow, customerSlice)
    const adminDoc = emitter.emit(sampleRow, adminSlice)
    expect(customerDoc.fields).not.toHaveProperty("costAmountCents")
    expect(adminDoc.fields).not.toHaveProperty("costAmountCents")
    expect(customerDoc.fields).not.toHaveProperty("marginPercent")
    expect(adminDoc.fields).not.toHaveProperty("marginPercent")
  })

  it("excludes blob-only fields (description, timezone)", () => {
    const doc = emitter.emit(sampleRow, customerSlice)
    expect(doc.fields).not.toHaveProperty("description")
    expect(doc.fields).not.toHaveProperty("timezone")
  })

  it("includes the customer-visible from_price approximation (sellAmountCents)", () => {
    const doc = emitter.emit(sampleRow, customerSlice)
    expect(doc.fields).toHaveProperty("sellAmountCents")
    expect(doc.fields.sellAmountCents).toBe(250000)
  })

  it("each emitter is independent — different sellerOperatorId in different emitters", () => {
    const a = createProductDocumentEmitter({ sellerOperatorId: "op_a" })
    const b = createProductDocumentEmitter({ sellerOperatorId: "op_b" })
    expect(a).not.toBe(b)
    expect(a.vertical).toBe(b.vertical)
  })
})
