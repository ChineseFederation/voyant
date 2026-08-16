import { describe, expect, it } from "vitest"

import {
  buildPublicCatalogSlotsUrl,
  publicCatalogSlotsQueryKey,
  resolveSelectedCatalogSlotId,
} from "./slots.js"

describe("public catalog slots helpers", () => {
  it("includes storefront scope in the React Query key", () => {
    expect(
      publicCatalogSlotsQueryKey("products", "prod_1", {
        market: "mkt_gb",
        locale: "en-GB",
        currency: "GBP",
      }),
    ).toEqual(["public-catalog-slots", "products", "prod_1", "mkt_gb", "en-GB", "GBP"])
  })

  it("threads storefront scope into the slots URL", () => {
    expect(
      buildPublicCatalogSlotsUrl("https://example.test/api/", "products", "prod 1", {
        market: "mkt_gb",
        locale: "en-GB",
        currency: "GBP",
      }),
    ).toBe(
      "https://example.test/api/v1/public/catalog/slots?entityModule=products&entityId=prod+1&market=mkt_gb&locale=en-GB&currency=GBP",
    )
  })

  it("resets stale selected slots to the first row in a fresh scope", () => {
    expect(
      resolveSelectedCatalogSlotId([{ id: "slot_ro_1" }, { id: "slot_ro_2" }], "slot_gb_1"),
    ).toBe("slot_ro_1")
    expect(
      resolveSelectedCatalogSlotId([{ id: "slot_ro_1" }, { id: "slot_ro_2" }], "slot_ro_2"),
    ).toBe("slot_ro_2")
    expect(resolveSelectedCatalogSlotId([], "slot_gb_1")).toBeUndefined()
  })
})
