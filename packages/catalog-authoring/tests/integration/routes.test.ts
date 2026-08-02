import { priceCatalogs } from "@voyant-travel/commerce"
import { createTestDb, describeIfDb } from "@voyant-travel/voyant-test-utils/db"
import { jsonRequest, mountTestApp } from "@voyant-travel/voyant-test-utils/http"
import { beforeAll, expect, it } from "vitest"
import { catalogAuthoringRoutes } from "../../src/extension.js"
import type { ProductGraphSpec } from "../../src/spec.js"

describeIfDb("catalog-authoring compose route", () => {
  const db = createTestDb()
  const app = mountTestApp(catalogAuthoringRoutes, { db, userId: "test-user" })
  const stamp = `${Date.now()}`
  let catalogId: string

  function excursionSpec(catalog: string | null): ProductGraphSpec {
    return {
      product: {
        name: `Walk ${stamp}`,
        status: "active",
        bookingMode: "date",
        capacityMode: "limited",
        visibility: "private",
        sellCurrency: "RON",
        termsShowOnContract: false,
        tags: [],
      } as ProductGraphSpec["product"],
      options: [
        {
          ref: "o",
          name: "Standard",
          status: "active",
          isDefault: true,
          sortOrder: 0,
          units: [
            {
              ref: "u",
              name: "Adult",
              unitType: "person",
              isRequired: true,
              isHidden: false,
              sortOrder: 0,
            },
          ],
          priceRules: [
            {
              priceCatalogId: catalog,
              name: "Base",
              pricingMode: "per_person",
              allPricingCategories: true,
              isDefault: true,
              active: true,
              unitPriceRules: [
                {
                  unitRef: "u",
                  pricingMode: "per_unit",
                  sellAmountCents: 12000,
                  active: true,
                  sortOrder: 0,
                  tiers: [],
                },
              ],
            },
          ],
        },
      ] as ProductGraphSpec["options"],
      paxPricingTiers: [],
      itineraries: [],
    }
  }

  beforeAll(async () => {
    const [cat] = await db
      .insert(priceCatalogs)
      .values({ code: `CAT-${stamp}`, name: `Test ${stamp}`, currencyCode: "RON", isDefault: true })
      .returning({ id: priceCatalogs.id })
    catalogId = cat?.id as string
  })

  it("builds a new product from a valid spec (201), resolving the default catalog", async () => {
    // priceCatalogId omitted on the rule — exercises default-catalog resolution.
    const res = await jsonRequest(app, "POST", "/compose", { spec: excursionSpec(null) })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { data: { id: string } }
    expect(body.data.id).toBeTruthy()
  })

  it("is idempotent under a repeated Idempotency-Key", async () => {
    const key = `idem-${stamp}`
    const send = () =>
      app.request("/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ spec: excursionSpec(catalogId) }),
      })
    const first = await send()
    const second = await send()
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    const a = (await first.json()) as { data: { id: string } }
    const b = (await second.json()) as { data: { id: string } }
    expect(b.data.id).toBe(a.data.id)
  })

  it("rejects a wrong-shape spec with 422 + recoverable issues", async () => {
    const spec = excursionSpec(catalogId)
    spec.itineraries = [
      {
        name: "Main",
        isDefault: true,
        sortOrder: 0,
        days: [1, 2, 3].map((n) => ({
          dayNumber: n,
          title: `Day ${n}`,
          description: null,
          location: null,
          services: [],
        })),
      },
    ] as ProductGraphSpec["itineraries"]
    const res = await jsonRequest(app, "POST", "/compose", { spec })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: string; issues: Array<{ code: string }> }
    expect(body.error).toBe("invalid_product_graph")
    expect(body.issues.some((i) => i.code === "single_slot_mode_multi_day_itinerary")).toBe(true)
  })
})
