import { availabilitySlots } from "@voyant-travel/operations"
import { describe, expect, it } from "vitest"

import { catalogInventoryRuntimeExtension } from "../../src/catalog-runtime-extension.js"
import { products } from "../../src/schema.js"
import { productTranslations } from "../../src/schema-settings.js"

const BASE_PRODUCT = {
  name: "Base tour",
  listingPolicy: null,
  supplierId: null,
  startDate: null,
}

const TRANSLATIONS = [
  { languageTag: "en-GB", name: "Danube Delta tour" },
  { languageTag: "ro-RO", name: "Tur în Delta Dunării" },
]

/**
 * The product name this reader returns becomes the checkout line item a hosted
 * payment provider renders, so the locale it resolves is the shopper's, not the
 * operator's. See `PaymentInitiationInput.description`.
 */
describe("loadProductPaymentPolicyContext product name", () => {
  it("returns the translation for the requested locale", async () => {
    const db = fakeDb([
      [products, [BASE_PRODUCT]],
      [productTranslations, TRANSLATIONS],
    ])

    const context = await catalogInventoryRuntimeExtension.loadProductPaymentPolicyContext(
      db,
      "prod_1",
      { locale: "ro-RO" },
    )

    expect(context?.name).toBe("Tur în Delta Dunării")
  })

  // voyant#4740: the cascade is over the listing, and the departure is a
  // property of the selection. Returning one from the other is what let every
  // payment policy be measured from `products.startDate`.
  it("says nothing about when the shopper travels", async () => {
    const db = fakeDb([
      [products, [{ ...BASE_PRODUCT, startDate: "2026-08-16" }]],
      [productTranslations, TRANSLATIONS],
    ])

    const context = await catalogInventoryRuntimeExtension.loadProductPaymentPolicyContext(
      db,
      "prod_1",
    )

    expect(context).not.toHaveProperty("departureDate")
  })

  it("matches on the language subtag when the exact tag has no translation", async () => {
    const db = fakeDb([
      [products, [BASE_PRODUCT]],
      [productTranslations, TRANSLATIONS],
    ])

    const context = await catalogInventoryRuntimeExtension.loadProductPaymentPolicyContext(
      db,
      "prod_1",
      { locale: "ro" },
    )

    expect(context?.name).toBe("Tur în Delta Dunării")
  })

  it("falls back to the base name rather than an unrequested language", async () => {
    const db = fakeDb([
      [products, [BASE_PRODUCT]],
      [productTranslations, TRANSLATIONS],
    ])

    const context = await catalogInventoryRuntimeExtension.loadProductPaymentPolicyContext(
      db,
      "prod_1",
      { locale: "de-DE" },
    )

    expect(context?.name).toBe("Base tour")
  })

  it("does not read translations when no locale is stated", async () => {
    let readTranslations = false
    const db = fakeDb(
      [
        [products, [BASE_PRODUCT]],
        [productTranslations, TRANSLATIONS],
      ],
      (table) => {
        if (table === productTranslations) readTranslations = true
      },
    )

    const context = await catalogInventoryRuntimeExtension.loadProductPaymentPolicyContext(
      db,
      "prod_1",
    )

    expect(context?.name).toBe("Base tour")
    expect(readTranslations).toBe(false)
  })
})

/**
 * The date a customer payment policy is measured from, and the departure the
 * checkout line item names.
 *
 * `products.startDate` is the listing's own window. For a slot-based product it
 * has nothing to do with the departure being bought, and reading it as one
 * collapsed a 50% deposit policy to full payment on a departure five weeks out
 * (voyant#4740). Resolution mirrors what the Booking itself records —
 * `slot?.dateLocal ?? product.startDate` in `convertProductToBooking` — because
 * agreeing with that by construction is the point.
 */
describe("resolveSelectedDepartureDate", () => {
  const SLOT = {
    id: "avsl_01k",
    productId: "prod_1",
    dateLocal: "2026-09-20",
    startsAt: new Date("2026-09-20T06:00:00Z"),
    endsAt: null,
    timezone: "Europe/Bucharest",
  }

  it("returns the selected slot's local date", async () => {
    const db = fakeDb([
      [availabilitySlots, [SLOT]],
      [products, [{ startDate: "2026-08-16" }]],
    ])

    await expect(
      catalogInventoryRuntimeExtension.resolveSelectedDepartureDate(db, {
        productId: "prod_1",
        departureSlotId: "avsl_01k",
      }),
    ).resolves.toBe("2026-09-20")
  })

  it("falls back to the product row when the selection names no slot", async () => {
    const db = fakeDb([
      [availabilitySlots, []],
      [products, [{ startDate: "2026-08-16" }]],
    ])

    await expect(
      catalogInventoryRuntimeExtension.resolveSelectedDepartureDate(db, { productId: "prod_1" }),
    ).resolves.toBe("2026-08-16")
  })

  // The Commit refuses a slot that belongs to another product outright, so its
  // date is not this product's departure and must not price this checkout.
  it("ignores a slot that belongs to another product", async () => {
    const db = fakeDb([
      [availabilitySlots, [{ ...SLOT, productId: "prod_other" }]],
      [products, [{ startDate: "2026-08-16" }]],
    ])

    await expect(
      catalogInventoryRuntimeExtension.resolveSelectedDepartureDate(db, {
        productId: "prod_1",
        departureSlotId: "avsl_01k",
      }),
    ).resolves.toBe("2026-08-16")
  })

  it("reports no departure for a product with neither a slot nor a start date", async () => {
    const db = fakeDb([
      [availabilitySlots, []],
      [products, [{ startDate: null }]],
    ])

    await expect(
      catalogInventoryRuntimeExtension.resolveSelectedDepartureDate(db, { productId: "prod_1" }),
    ).resolves.toBeNull()
  })
})

/**
 * Minimal drizzle stand-in covering the three chains this reader builds:
 * `from().where().limit()`, `from().innerJoin().where().orderBy().limit()`, and
 * `from().where()`. Projections are ignored, so fixtures are keyed by the alias
 * the reader selects into. Rows are keyed by the table the query starts from.
 */
function fakeDb(tables: Array<[unknown, unknown[]]>, onFrom?: (table: unknown) => void) {
  const rowsByTable = new Map(tables)
  return {
    select: () => ({
      from: (table: unknown) => {
        onFrom?.(table)
        return chain(rowsByTable.get(table) ?? [])
      },
    }),
  } as never
}

function chain(rows: unknown[]) {
  const settled = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>
  const self = {
    innerJoin: () => self,
    where: () => settled,
    orderBy: () => settled,
    limit: (limit: number) => Promise.resolve(rows.slice(0, limit)),
  }
  settled.innerJoin = () => self
  settled.where = () => settled
  settled.orderBy = () => settled
  settled.limit = (limit: number) => Promise.resolve(rows.slice(0, limit))
  return self
}
