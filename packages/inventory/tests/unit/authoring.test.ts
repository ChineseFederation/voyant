import { pickupPriceRules, priceCatalogs } from "@voyant-travel/commerce"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { availabilitySlots } from "@voyant-travel/operations"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { productAuthoringRequests } from "../../src/authoring/schema.js"
import {
  composeProduct,
  inventoryAuthoringExtension,
  inventoryAuthoringModule,
  productGraphSpecSchema,
  validateProductGraph,
} from "../../src/authoring.js"
import { productsService } from "../../src/service.js"
import { ProductPublishReadinessError } from "../../src/service-core.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const DB_AVAILABLE = !!TEST_DATABASE_URL

function transferSpec(overrides: Record<string, unknown> = {}) {
  return productGraphSpecSchema.parse({
    product: {
      name: "Airport transfer",
      bookingMode: "transfer",
      sellCurrency: "USD",
    },
    options: [
      {
        ref: "standard",
        name: "Standard",
        status: "active",
        isDefault: true,
        units: [
          {
            ref: "vehicle",
            name: "Vehicle",
            unitType: "vehicle",
            occupancyMin: 1,
          },
        ],
        priceRules: [
          {
            name: "Base transfer",
            isDefault: true,
            unitPriceRules: [
              {
                unitRef: "vehicle",
                sellAmountCents: 5000,
              },
            ],
            ...overrides,
          },
        ],
      },
    ],
  })
}

describe("Inventory authoring owner path", () => {
  it("exposes operated product graph authoring from Inventory", () => {
    expect(inventoryAuthoringModule.name).toBe("inventory-authoring")
    expect(inventoryAuthoringExtension.extension).toMatchObject({
      name: "inventory-authoring",
      module: "products",
      requiresTransactionalDb: true,
    })
    expect(inventoryAuthoringExtension.adminRoutes).toBeDefined()
  })

  it("keeps the product graph spec and idempotency table on the owner path", () => {
    expect(productGraphSpecSchema.shape.product).toBeDefined()
    expect(productAuthoringRequests).toBeDefined()
  })

  it("rejects transfer specs without an active pickup or dropoff price rule", () => {
    const issues = validateProductGraph(transferSpec())

    expect(issues).toContainEqual(
      expect.objectContaining({ code: "transfer_needs_pickup_or_dropoff" }),
    )
  })

  it("accepts transfer specs with an active pickup price rule", () => {
    const issues = validateProductGraph(
      transferSpec({
        pickupPriceRules: [{ pickupPointId: "pickup_point_airport" }],
      }),
    )

    expect(issues).toEqual([])
  })
})

describe.skipIf(!DB_AVAILABLE)("Inventory authoring persistence", () => {
  const db = createTestDb()

  it("persists authored pickup price rules during compose", async () => {
    await cleanupTestDb(db)
    await db.insert(priceCatalogs).values({
      code: "default",
      name: "Default catalog",
      isDefault: true,
      active: true,
    })

    const outcome = await composeProduct(
      db,
      transferSpec({
        pickupPriceRules: [
          {
            pickupPointId: "pickup_point_airport",
            pricingMode: "per_booking",
            sellAmountCents: 1200,
          },
        ],
      }),
    )

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return

    const optionId = outcome.result.options[0]?.id
    expect(optionId).toBeDefined()
    const rows = await db
      .select()
      .from(pickupPriceRules)
      .where(eq(pickupPriceRules.optionId, optionId ?? ""))

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      pickupPointId: "pickup_point_airport",
      pricingMode: "per_booking",
      sellAmountCents: 1200,
      active: true,
    })
  })
})

describe.skipIf(!DB_AVAILABLE)("Inventory publish readiness", () => {
  const db = createTestDb()

  it("requires a future open departure before publishing scheduled products", async () => {
    await cleanupTestDb(db)
    const product = await productsService.createProduct(db, {
      name: "Scheduled tour",
      bookingMode: "date",
      sellCurrency: "USD",
      status: "draft",
      visibility: "private",
      activated: false,
      termsShowOnContract: false,
      tags: [],
    })

    await expect(
      productsService.updateProduct(db, product.id, {
        status: "active",
      }),
    ).rejects.toBeInstanceOf(ProductPublishReadinessError)

    await db.insert(availabilitySlots).values({
      productId: product.id,
      dateLocal: "2035-01-10",
      startsAt: new Date("2035-01-10T09:00:00Z"),
      timezone: "UTC",
      status: "open",
    })

    const published = await productsService.updateProduct(db, product.id, {
      status: "active",
    })

    expect(published).toMatchObject({
      id: product.id,
      status: "active",
      visibility: "private",
      activated: false,
    })
  })
})
