// Integration coverage for the Product merchandising family/subtype/duration
// classification (voyant#4029) against a real Postgres instance. The pure
// resolver logic (`resolveProductDuration` / `resolveProductClassification`)
// is already unit-tested in `tests/unit/classification.test.ts`; this file
// exercises the DB-backed consumers that wire that resolver into the
// catalog-plane projection, the legacy Catalog search document, and the
// list/detail read paths.
import type { IndexerSlice } from "@voyant-travel/catalog"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { productDays, productItineraries, products, productTypes } from "../../src/schema.js"
import { catalogProductsService } from "../../src/service-catalog.js"
import {
  buildProductSnapshotInput,
  createProductClassificationProjectionExtension,
  getResolvedProductById,
} from "../../src/service-catalog-plane.js"
import { coreProductsService } from "../../src/service-core.js"
import { productListQuerySchema } from "../../src/validation.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

const customerSlice: IndexerSlice = {
  vertical: "products",
  locale: "en-GB",
  audience: "customer",
  market: "default",
}

describe.skipIf(!DB_AVAILABLE)("Product classification (integration)", () => {
  let db: PostgresJsDatabase

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
  })

  async function insertTourFamily() {
    const [family] = await db
      .insert(productTypes)
      .values({ name: "Tour", code: "tour", active: true })
      .returning()
    if (!family) throw new Error("failed to insert tour product type")
    return family
  }

  async function insertProduct(overrides: Partial<typeof products.$inferInsert> = {}) {
    const [product] = await db
      .insert(products)
      .values({
        name: "Sunset Boat Tour",
        sellCurrency: "EUR",
        status: "active",
        activated: true,
        visibility: "public",
        ...overrides,
      })
      .returning()
    if (!product) throw new Error("failed to insert product")
    return product
  }

  describe("createProductClassificationProjectionExtension", () => {
    it("classifies a 60-minute product from its explicit duration, needing no itinerary", async () => {
      const family = await insertTourFamily()
      const product = await insertProduct({
        productTypeId: family.id,
        productSubtypeCode: "boat-tour",
        durationMinutes: 60,
      })

      const extension = createProductClassificationProjectionExtension()
      const projection = await extension.project(db, product.id, customerSlice)

      expect(projection.get("familyCode")).toBe("tour")
      expect(projection.get("familyName")).toBe("Tour")
      expect(projection.get("subtypeCode")).toBe("boat-tour")
      expect(projection.get("durationMinutes")).toBe(60)
      expect(projection.get("durationDays")).toBe(1)
      expect(projection.get("durationProvenance")).toBe("explicit")
      expect(projection.get("classificationReviewRequired")).toBe(false)
    })

    it("keeps resolved views and booking snapshots in classification parity", async () => {
      const family = await insertTourFamily()
      const product = await insertProduct({
        productTypeId: family.id,
        productSubtypeCode: "boat-tour",
        durationMinutes: 60,
      })
      const context = {
        sellerOperatorId: "operator_test",
        scope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" } as const,
      }

      const view = await getResolvedProductById(db, product.id, context)
      const snapshot = await buildProductSnapshotInput(db, product.id, context)

      expect(view?.values.get("familyCode")).toBe("tour")
      expect(view?.values.get("subtypeCode")).toBe("boat-tour")
      expect(view?.values.get("durationMinutes")).toBe(60)
      expect(snapshot?.frozenPayload).toMatchObject({
        familyCode: "tour",
        subtypeCode: "boat-tour",
        durationMinutes: 60,
        durationProvenance: "explicit",
        classificationReviewRequired: false,
        classificationReviewReasons: [],
      })
    })

    it("falls back to the itinerary-derived day count when no explicit duration is authored", async () => {
      const family = await insertTourFamily()
      const product = await insertProduct({ productTypeId: family.id, name: "Alps Multi-day Trek" })

      const [itinerary] = await db
        .insert(productItineraries)
        .values({ productId: product.id, name: "Default itinerary", isDefault: true })
        .returning()
      if (!itinerary) throw new Error("failed to insert itinerary")
      await db.insert(productDays).values([
        { itineraryId: itinerary.id, dayNumber: 1 },
        { itineraryId: itinerary.id, dayNumber: 2 },
      ])

      const extension = createProductClassificationProjectionExtension()
      const projection = await extension.project(db, product.id, customerSlice)

      expect(projection.get("familyCode")).toBe("tour")
      expect(projection.get("durationMinutes")).toBeNull()
      expect(projection.get("durationDays")).toBe(2)
      expect(projection.get("durationProvenance")).toBe("itinerary-derived")
      expect(projection.get("classificationReviewRequired")).toBe(false)
    })

    it("uses the first itinerary when a legacy product has no default itinerary", async () => {
      const family = await insertTourFamily()
      const product = await insertProduct({ productTypeId: family.id, name: "Legacy Trek" })
      const [itinerary] = await db
        .insert(productItineraries)
        .values({ productId: product.id, name: "Only itinerary", isDefault: false })
        .returning()
      if (!itinerary) throw new Error("failed to insert itinerary")
      await db.insert(productDays).values([
        { itineraryId: itinerary.id, dayNumber: 1 },
        { itineraryId: itinerary.id, dayNumber: 4 },
      ])

      const detail = await coreProductsService.getProductByIdWithType(db, product.id)
      const search = await catalogProductsService.listSearchDocuments(db, {
        productIds: [product.id],
        limit: 50,
        offset: 0,
      })

      expect(detail?.classification?.durationDays).toBe(4)
      expect(search.data.find((row) => row.productId === product.id)?.durationDays).toBe(4)
    })

    it("flags for review a product with no family and no resolvable duration", async () => {
      const product = await insertProduct({
        name: "Unclassified Legacy Product",
        status: "draft",
        activated: false,
        visibility: "private",
      })

      const extension = createProductClassificationProjectionExtension()
      const projection = await extension.project(db, product.id, customerSlice)

      expect(projection.get("familyCode")).toBeNull()
      expect(projection.get("familyName")).toBeNull()
      expect(projection.get("durationMinutes")).toBeNull()
      expect(projection.get("durationDays")).toBeNull()
      expect(projection.get("durationProvenance")).toBe("unresolved")
      expect(projection.get("classificationReviewRequired")).toBe(true)
    })
  })

  describe("catalogProductsService.listSearchDocuments — legacy Catalog document", () => {
    it("emits family/subtype/duration fields alongside the legacy productType fields", async () => {
      const family = await insertTourFamily()
      const product = await insertProduct({
        productTypeId: family.id,
        productSubtypeCode: "boat-tour",
        durationMinutes: 60,
      })

      const result = await catalogProductsService.listSearchDocuments(db, {
        productIds: [product.id],
        limit: 50,
        offset: 0,
      })

      // Scope to the inserted product id — the shared test DB may hold rows
      // from other suites, so assert on this product's document rather than a
      // global total.
      const doc = result.data.find((d) => d.productId === product.id)
      expect(doc).toEqual(
        expect.objectContaining({
          productId: product.id,
          productTypeCode: "tour",
          productTypeName: "Tour",
          familyCode: "tour",
          familyName: "Tour",
          subtypeCode: "boat-tour",
          durationMinutes: 60,
          durationDays: 1,
          durationProvenance: "explicit",
          reviewRequired: false,
          reviewReasons: [],
        }),
      )
    })

    it("preserves the classification of products assigned to an inactive family", async () => {
      const family = await insertTourFamily()
      await db.update(productTypes).set({ active: false }).where(eq(productTypes.id, family.id))
      const product = await insertProduct({
        productTypeId: family.id,
        durationMinutes: 60,
      })

      const result = await catalogProductsService.listSearchDocuments(db, {
        productIds: [product.id],
        limit: 50,
        offset: 0,
      })

      expect(result.data.find((row) => row.productId === product.id)).toMatchObject({
        familyCode: "tour",
        familyName: "Tour",
        reviewReasons: [],
      })
    })
  })

  describe("coreProductsService — list/detail classification + facet filters", () => {
    it("attaches classification to every listProducts row and narrows by familyCode/productSubtypeCode", async () => {
      const tourFamily = await insertTourFamily()
      const [activityFamily] = await db
        .insert(productTypes)
        .values({ name: "Activity", code: "activity", active: true })
        .returning()
      if (!activityFamily) throw new Error("failed to insert activity product type")

      const tourProduct = await insertProduct({
        name: "Boat Tour",
        productTypeId: tourFamily.id,
        productSubtypeCode: "boat-tour",
        durationMinutes: 60,
      })
      const activityProduct = await insertProduct({
        name: "Cooking Class",
        productTypeId: activityFamily.id,
        productSubtypeCode: "cooking-class",
        durationMinutes: 120,
      })

      // The shared test DB may hold rows from parallel suites, so assert on the
      // inserted rows by id rather than on global totals.
      const all = await coreProductsService.listProducts(db, productListQuerySchema.parse({}))
      const tourRow = all.data.find((row) => row.id === tourProduct.id)
      expect(tourRow?.classification).toMatchObject({
        familyCode: "tour",
        familyName: "Tour",
        subtypeCode: "boat-tour",
        durationMinutes: 60,
        durationDays: 1,
        durationProvenance: "explicit",
        reviewRequired: false,
      })

      const byFamily = await coreProductsService.listProducts(
        db,
        productListQuerySchema.parse({ familyCode: "tour" }),
      )
      const byFamilyIds = byFamily.data.map((row) => row.id)
      expect(byFamilyIds).toContain(tourProduct.id)
      expect(byFamilyIds).not.toContain(activityProduct.id)

      const bySubtype = await coreProductsService.listProducts(
        db,
        productListQuerySchema.parse({ productSubtypeCode: "cooking-class" }),
      )
      const bySubtypeIds = bySubtype.data.map((row) => row.id)
      expect(bySubtypeIds).toContain(activityProduct.id)
      expect(bySubtypeIds).not.toContain(tourProduct.id)
    })

    it("attaches classification to getProductByIdWithType", async () => {
      const family = await insertTourFamily()
      const product = await insertProduct({
        productTypeId: family.id,
        productSubtypeCode: "boat-tour",
        durationMinutes: 60,
      })

      const detail = await coreProductsService.getProductByIdWithType(db, product.id)

      expect(detail?.classification).toMatchObject({
        familyCode: "tour",
        familyName: "Tour",
        subtypeCode: "boat-tour",
        durationMinutes: 60,
        durationDays: 1,
        durationProvenance: "explicit",
        reviewRequired: false,
      })
    })
  })
})
