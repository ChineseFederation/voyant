import { describe, expect, it } from "vitest"

import { catalogInventoryRuntimeExtension } from "../../src/catalog-runtime-extension.js"
import { products } from "../../src/schema.js"
import { productTranslations } from "../../src/schema-settings.js"

const BASE_PRODUCT = {
  name: "Base tour",
  listingPolicy: null,
  supplierId: null,
  departureDate: null,
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
      [products, [{ ...BASE_PRODUCT, departureDate: "2026-09-12" }]],
      [productTranslations, TRANSLATIONS],
    ])

    const context = await catalogInventoryRuntimeExtension.loadProductPaymentPolicyContext(
      db,
      "prod_1",
      { locale: "ro-RO" },
    )

    expect(context?.name).toBe("Tur în Delta Dunării")
    expect(context?.departureDate).toBe("2026-09-12")
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
