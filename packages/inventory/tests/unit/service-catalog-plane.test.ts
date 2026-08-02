import { resolveEntityView } from "@voyant-travel/catalog"
import { createFieldPolicyRegistry } from "@voyant-travel/catalog/contract"
import { resolveOverlay } from "@voyant-travel/catalog/overlay/resolver"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { describe, expect, it } from "vitest"

import { productCatalogPolicy } from "../../src/catalog-policy.js"
import { resolveProductClassification } from "../../src/classification.js"
import type { Product } from "../../src/schema-core.js"
import {
  createProductStorefrontCardProjectionExtension,
  deriveProductSupplyModel,
  listResolvedProducts,
  productProvenance,
  productRowToProjection,
} from "../../src/service-catalog-plane.js"

function drizzleDb(value: object): AnyDrizzleDb {
  return value as AnyDrizzleDb
}

const sampleRow: Product = {
  id: "prod_abc",
  name: "Bali Wellness Retreat",
  status: "active" as const,
  description: "Source description",
  inclusionsHtml: null,
  exclusionsHtml: null,
  termsHtml: null,
  termsShowOnContract: false,
  bookingMode: "date" as const,
  capacityMode: "limited" as const,
  timezone: "Asia/Jakarta",
  defaultLanguageTag: null,
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
  productSubtypeCode: null,
  durationMinutes: null,
  supplierId: null,
  contractTemplateId: null,
  taxClassId: null,
  customerPaymentPolicy: null,
  tags: ["wellness", "yoga"],
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-04-01"),
}

const customerSlice = {
  vertical: "products",
  locale: "ro-RO",
  audience: "customer",
  market: "default",
} as const

function projectionDb(selectResponses: ReadonlyArray<ReadonlyArray<Record<string, unknown>>>) {
  let selectIndex = 0
  const db = {
    select: () => {
      const rows = selectResponses[selectIndex++] ?? []
      return {
        from: () => ({
          where: () => ({
            orderBy: async () => rows,
          }),
        }),
      }
    },
    execute: async () => [{ count: 0 }],
  }
  return drizzleDb(db)
}

describe("productRowToProjection", () => {
  it("maps every column to its catalog-policy path", () => {
    const projection = productRowToProjection(sampleRow, { sellerOperatorId: "op_xyz" })
    expect(projection.get("name")).toBe("Bali Wellness Retreat")
    expect(projection.get("status")).toBe("active")
    expect(projection.get("sellCurrency")).toBe("EUR")
    expect(projection.get("sellAmountCents")).toBe(250000)
    expect(projection.get("tags[]")).toEqual(["wellness", "yoga"])
    expect(projection.get("productTypeId")).toBe("ptyp_wellness")
    expect(projection.get("supplyModel")).toBe("scheduled")
  })

  it("synthesizes provenance fields for owned products", () => {
    const projection = productRowToProjection(sampleRow, { sellerOperatorId: "op_xyz" })
    expect(projection.get("source.kind")).toBe("owned")
    expect(projection.get("seller.operator_id")).toBe("op_xyz")
  })

  it("includes internal-only fields in the projection (visibility filter happens later)", () => {
    const projection = productRowToProjection(sampleRow, { sellerOperatorId: "op_xyz" })
    expect(projection.get("costAmountCents")).toBe(180000)
    expect(projection.get("marginPercent")).toBe(28)
  })

  it("does not project deprecated product distribution flags", () => {
    const projection = productRowToProjection(sampleRow, { sellerOperatorId: "op_xyz" })
    expect(projection.has("visibility")).toBe(false)
    expect(projection.has("activated")).toBe(false)
  })
})

describe("deriveProductSupplyModel", () => {
  it("maps fixed-date and departure-oriented inventory to scheduled browse", () => {
    for (const bookingMode of ["date", "date_time", "transfer", "itinerary", "other"] as const) {
      expect(deriveProductSupplyModel(bookingMode)).toBe("scheduled")
    }
  })

  it("maps open and stay inventory to dynamic browse", () => {
    for (const bookingMode of ["open", "stay"] as const) {
      expect(deriveProductSupplyModel(bookingMode)).toBe("dynamic")
    }
  })
})

describe("productProvenance", () => {
  it("returns owned provenance with static freshness", () => {
    const provenance = productProvenance(sampleRow, { sellerOperatorId: "op_xyz" })
    expect(provenance.source_kind).toBe("owned")
    expect(provenance.source_freshness).toBe("static")
    expect(provenance.source_ref).toBeUndefined()
  })
})

describe("end-to-end: projection + resolver visibility filter", () => {
  it("staff actor sees internal-only fields; customer actor does not", () => {
    const projection = productRowToProjection(sampleRow, { sellerOperatorId: "op_xyz" })
    const registry = createFieldPolicyRegistry(productCatalogPolicy)

    const staffView = resolveOverlay(registry, projection, [], {
      locale: "en-GB",
      audience: "staff",
      market: "default",
      actor: "staff",
    })
    expect(staffView.values.has("costAmountCents")).toBe(true)
    expect(staffView.values.has("marginPercent")).toBe(true)

    const customerView = resolveOverlay(registry, projection, [], {
      locale: "en-GB",
      audience: "customer",
      market: "default",
      actor: "customer",
    })
    expect(customerView.values.has("costAmountCents")).toBe(false)
    expect(customerView.values.has("marginPercent")).toBe(false)
    expect(customerView.hidden.has("costAmountCents")).toBe(true)
    expect(customerView.values.has("name")).toBe(true)
    expect(customerView.values.has("description")).toBe(true)
  })

  it("applies a marketing overlay on title for the customer audience", () => {
    const projection = productRowToProjection(sampleRow, { sellerOperatorId: "op_xyz" })
    const registry = createFieldPolicyRegistry(productCatalogPolicy)

    const view = resolveOverlay(
      registry,
      projection,
      [
        {
          field_path: "name",
          locale: "en-GB",
          audience: "customer",
          market: "default",
          value: "✨ Sunset Wellness Escape",
        },
      ],
      {
        locale: "en-GB",
        audience: "customer",
        market: "default",
        actor: "customer",
      },
    )
    expect(view.values.get("name")).toBe("✨ Sunset Wellness Escape")
    expect(view.provenance.get("name")).toEqual({
      locale: "en-GB",
      audience: "customer",
      market: "default",
    })
  })
})

describe("listResolvedProducts (batched overlay fetch)", () => {
  const secondRow = { ...sampleRow, id: "prod_def", name: "Alps Hiking Week" }

  // Overlay rows as the catalog_overlay table would return them. The batched
  // fetch keys them by entity_id; the per-entity fetch ignores that column.
  const overlayRows = [
    {
      entity_id: "prod_abc",
      field_path: "name",
      locale: "en-GB",
      audience: "customer",
      market: "default",
      value: "✨ Sunset Wellness Escape",
    },
    {
      entity_id: "prod_abc",
      field_path: "description",
      locale: "default",
      audience: "default",
      market: "default",
      value: "Overlaid description",
    },
    {
      entity_id: "prod_def",
      field_path: "name",
      locale: "en-GB",
      audience: "customer",
      market: "default",
      value: "Alps Hiking Week — Last Seats",
    },
  ]

  const context = {
    sellerOperatorId: "op_xyz",
    scope: {
      locale: "en-GB",
      audience: "customer",
      market: "default",
      actor: "customer",
    } as const,
  }

  /**
   * Mock for the bare `db.select({...}).from(...).where(...)` chain the
   * overlay fetchers use. Responses are scripted per `select` call so the
   * same factory serves both the batched (1 call, all rows) and the serial
   * (1 call per entity) paths.
   */
  function overlaySelectDb(responses: ReadonlyArray<ReadonlyArray<Record<string, unknown>>>) {
    let overlaySelectCalls = 0
    const db = {
      select: (selection?: Record<string, unknown>) => {
        const fields = new Set(Object.keys(selection ?? {}))

        // Classification enrichment runs alongside the overlay query. Model
        // its Product-family and itinerary lookups explicitly so this helper
        // counts only the overlay queries the batching contract is about.
        if (fields.has("code") && fields.has("name")) {
          return {
            from: () => ({
              where: () => ({ limit: async () => [{ code: "wellness", name: "Wellness" }] }),
            }),
          }
        }
        if (fields.has("isDefault")) {
          return {
            from: () => ({
              where: () => ({ orderBy: async () => [] }),
            }),
          }
        }

        const rows = responses[overlaySelectCalls] ?? []
        overlaySelectCalls++
        return {
          from: () => ({
            where: async () => rows,
          }),
        }
      },
    }
    return { db: drizzleDb(db), selectCount: () => overlaySelectCalls }
  }

  function projectionWithClassification(row: Product) {
    const projection = new Map(
      productRowToProjection(row, { sellerOperatorId: context.sellerOperatorId }),
    )
    const classification = resolveProductClassification({
      family: { code: "wellness", name: "Wellness" },
      subtypeCode: row.productSubtypeCode,
      durationMinutes: row.durationMinutes,
      itineraryDurationDays: null,
    })
    projection.set("familyCode", classification.familyCode)
    projection.set("familyName", classification.familyName)
    projection.set("subtypeCode", classification.subtypeCode)
    projection.set("durationMinutes", classification.durationMinutes)
    projection.set("durationDays", classification.durationDays)
    projection.set("durationProvenance", classification.durationProvenance)
    projection.set("classificationReviewRequired", classification.reviewRequired)
    projection.set("classificationReviewReasons", classification.reviewReasons)
    return projection
  }

  it("issues ONE overlay query for N products", async () => {
    const { db, selectCount } = overlaySelectDb([overlayRows])
    const views = await listResolvedProducts(db, [sampleRow, secondRow], context)
    expect(views).toHaveLength(2)
    expect(selectCount()).toBe(1)
  })

  it("produces per-product output identical to calling resolveEntityView per id", async () => {
    const { db: batchedDb } = overlaySelectDb([overlayRows])
    const batched = await listResolvedProducts(batchedDb, [sampleRow, secondRow], context)

    // Baseline: the old serial path — one resolveEntityView (and thus one
    // overlay fetch) per product id.
    const { db: serialDb, selectCount } = overlaySelectDb([
      overlayRows.filter((row) => row.entity_id === "prod_abc"),
      overlayRows.filter((row) => row.entity_id === "prod_def"),
    ])
    const registry = createFieldPolicyRegistry(productCatalogPolicy)
    const baseline = []
    for (const row of [sampleRow, secondRow]) {
      baseline.push(
        await resolveEntityView(
          serialDb,
          registry,
          "products",
          row.id,
          projectionWithClassification(row),
          context.scope,
        ),
      )
    }
    expect(selectCount()).toBe(2)

    expect(batched).toEqual(baseline)
    // Spot-check the overlays actually landed (guards against a vacuously
    // equal pair of broken outputs).
    expect(batched[0]?.values.get("name")).toBe("✨ Sunset Wellness Escape")
    // Localized fields do not consume a `locale=default` overlay when a real
    // locale was requested; that would silently serve the wrong language.
    expect(batched[0]?.values.get("description")).toBe("Source description")
    expect(batched[1]?.values.get("name")).toBe("Alps Hiking Week — Last Seats")
  })

  it("resolves products without overlays from the source projection alone", async () => {
    const { db } = overlaySelectDb([[]])
    const views = await listResolvedProducts(db, [secondRow], context)
    expect(views[0]?.values.get("name")).toBe("Alps Hiking Week")
    expect(views[0]?.provenance.get("name")).toBeNull()
  })

  it("returns [] (and skips the overlay query) for an empty page", async () => {
    const { db, selectCount } = overlaySelectDb([])
    const views = await listResolvedProducts(db, [], context)
    expect(views).toEqual([])
    expect(selectCount()).toBe(0)
  })
})

describe("createProductStorefrontCardProjectionExtension", () => {
  it("preserves base rich text fields when a translation is absent", async () => {
    const extension = createProductStorefrontCardProjectionExtension()
    const projection = await extension.project(
      projectionDb([[], [], [], []]),
      "prod_abc",
      customerSlice,
    )

    expect(projection.has("inclusionsHtml")).toBe(false)
    expect(projection.has("exclusionsHtml")).toBe(false)
    expect(projection.has("termsHtml")).toBe(false)
  })

  it("preserves base rich text fields when the selected translation is partial", async () => {
    const extension = createProductStorefrontCardProjectionExtension()
    const projection = await extension.project(
      projectionDb([
        [
          {
            languageTag: "ro",
            name: "Retreat Bali",
            slug: "retreat-bali",
            shortDescription: "Descriere scurta",
            inclusionsHtml: null,
            exclusionsHtml: null,
            termsHtml: null,
          },
        ],
        [],
        [],
        [],
      ]),
      "prod_abc",
      customerSlice,
    )

    expect(projection.get("name")).toBe("Retreat Bali")
    expect(projection.has("inclusionsHtml")).toBe(false)
    expect(projection.has("exclusionsHtml")).toBe(false)
    expect(projection.has("termsHtml")).toBe(false)
  })

  it("runs the departures count in the first query wave; only the duration estimate trails", async () => {
    // Logs each db call at INVOCATION time. Everything inside the first
    // Promise.all is kicked off synchronously, so wave membership shows up
    // as invocation order: 4 selects + the departures-count execute first,
    // then (after the wave settles) the duration-days select.
    const log: string[] = []
    let selectCalls = 0
    const selectResponses: ReadonlyArray<ReadonlyArray<Record<string, unknown>>> = [
      [], // translations
      [], // media
      [], // locations
      [{ id: "itin_1", isDefault: true }], // itineraries
      [{ dayNumber: 1 }, { dayNumber: 5 }], // product days (duration estimate)
    ]
    const db = {
      select: () => {
        const rows = selectResponses[selectCalls] ?? []
        selectCalls++
        log.push(`select:${selectCalls}`)
        return {
          from: () => ({
            where: () => ({
              orderBy: async () => rows,
            }),
          }),
        }
      },
      execute: async () => {
        log.push("execute:departures-count")
        return [{ count: 3 }]
      },
    }

    const extension = createProductStorefrontCardProjectionExtension()
    const projection = await extension.project(drizzleDb(db), "prod_abc", customerSlice)

    expect(log).toEqual([
      "select:1",
      "select:2",
      "select:3",
      "select:4",
      "execute:departures-count",
      "select:5",
    ])
    expect(projection.get("availableDeparturesCount")).toBe(3)
    expect(projection.get("durationDays")).toBe(5)
  })
})
