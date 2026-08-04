import type { BookingRequirements } from "@voyant-travel/catalog/booking-engine"
import { beforeEach, describe, expect, it, vi } from "vitest"

const getProductContent = vi.hoisted(() => vi.fn())
const buildProductRequirements = vi.hoisted(() => vi.fn())

vi.mock("@voyant-travel/inventory/service-content", () => ({ getProductContent }))
vi.mock("@voyant-travel/inventory/requirements", () => ({ buildProductRequirements }))

const { enrichProductQuoteShape } = await import("./catalog-runtime-extension.js")

const productShape = {
  showsConfigure: true,
  showsBilling: true,
  showsTravelers: true,
  showsAccommodation: false,
  showsAddons: false,
  showsPayment: true,
  showsReview: true,
  paxBands: [{ code: "adult", label: "Adult", minCount: 1, maxCount: 8 }],
  paxBandsAllowedTotal: { min: 1, max: 8 },
  travelerFields: [],
  bookingFields: [],
  paymentIntents: ["hold", "card"],
} satisfies BookingRequirements

const baseQuote = {
  quoteId: "cquo_1",
  quotedAt: new Date("2026-06-30T00:00:00.000Z"),
  expiresAt: new Date("2026-06-30T00:10:00.000Z"),
  available: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  buildProductRequirements.mockReturnValue(productShape)
})

describe("enrichProductQuoteShape", () => {
  it("attaches a product draft shape when a sourced product quote omitted it", async () => {
    const content = { product: { name: "Lisbon Sunset Catamaran" } }
    getProductContent.mockResolvedValue({ content })

    const result = await enrichProductQuoteShape({
      db: {} as never,
      result: baseQuote,
      entityModule: "products",
      entityId: "prod_1",
      locale: "ro-RO",
      audience: "customer",
      market: "default",
      currency: "EUR",
      registry: {} as never,
      adapterContext: { connection_id: "demo" },
    })

    expect(result.shape).toBe(productShape)
    expect(getProductContent).toHaveBeenCalledWith(
      {},
      "prod_1",
      {
        preferredLocales: ["ro-RO", "en-GB", "en"],
        audience: "customer",
        market: "default",
        currency: "EUR",
      },
      expect.objectContaining({ registry: {} }),
    )
    expect(buildProductRequirements).toHaveBeenCalledWith(content, { locale: "ro-RO" })
  })

  it("uses quote scope defaults when optional scope fields are omitted", async () => {
    const content = { product: { name: "Lisbon Sunset Catamaran" } }
    getProductContent.mockResolvedValue({ content })

    const result = await enrichProductQuoteShape({
      db: {} as never,
      result: baseQuote,
      entityModule: "products",
      entityId: "prod_1",
      locale: "en-GB",
      audience: "staff",
      market: "default",
      registry: {} as never,
    })

    expect(result.shape).toBe(productShape)
    expect(getProductContent).toHaveBeenCalledWith(
      {},
      "prod_1",
      {
        preferredLocales: ["en-GB", "en"],
        audience: "staff",
        market: "default",
        currency: undefined,
      },
      expect.objectContaining({ registry: {} }),
    )
    expect(buildProductRequirements).toHaveBeenCalledWith(content, { locale: "en-GB" })
  })

  it("does not replace an existing quote shape", async () => {
    const result = await enrichProductQuoteShape({
      db: {} as never,
      result: { ...baseQuote, shape: productShape },
      entityModule: "products",
      entityId: "prod_1",
      registry: {} as never,
    })

    expect(result.shape).toBe(productShape)
    expect(getProductContent).not.toHaveBeenCalled()
  })

  it("leaves non-product quotes unchanged", async () => {
    const result = await enrichProductQuoteShape({
      db: {} as never,
      result: baseQuote,
      entityModule: "cruises",
      entityId: "cruise_1",
      registry: {} as never,
    })

    expect(result).toBe(baseQuote)
    expect(getProductContent).not.toHaveBeenCalled()
  })
})
