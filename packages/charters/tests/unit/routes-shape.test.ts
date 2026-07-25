import { mountTestApp } from "@voyant-travel/voyant-test-utils/http"
import { afterEach, describe, expect, it } from "vitest"

import type {
  ExternalCharterProduct,
  ExternalCharterSuite,
  ExternalCharterVoyage,
  ExternalCharterYacht,
} from "../../src/adapters/index.js"
import { MockCharterAdapter } from "../../src/adapters/mock.js"
import { clearCharterAdapters, registerCharterAdapter } from "../../src/adapters/registry.js"
import { chartersAdminRoutes } from "../../src/routes.js"
import { chartersPublicRoutes } from "../../src/routes-public.js"

afterEach(() => clearCharterAdapters())

const seedProduct: ExternalCharterProduct = {
  sourceRef: { externalId: "ext-prod-1" },
  name: "Mediterranean Spring",
  slug: "med-spring",
  lineName: "Acme",
  defaultBookingModes: ["per_suite", "whole_yacht"],
  defaultApaPercent: "27.50",
  defaultMybaTemplateRef: "ctpl_default",
  defaultYachtRef: { externalId: "ext-yacht-1" },
  status: "live",
}
const seedVoyage: ExternalCharterVoyage = {
  sourceRef: { externalId: "ext-voy-1" },
  productRef: seedProduct.sourceRef,
  yachtRef: { externalId: "ext-yacht-1" },
  voyageCode: "MED-2026-04",
  departureDate: "2026-04-12",
  returnDate: "2026-04-19",
  nights: 7,
  bookingModes: ["per_suite", "whole_yacht"],
  wholeYachtPricesByCurrency: { USD: "5000000.00" },
  apaPercentOverride: "30.00",
}
const seedSuite: ExternalCharterSuite = {
  sourceRef: { externalId: "ext-suite-1" },
  voyageRef: seedVoyage.sourceRef,
  suiteCode: "OS-1",
  suiteName: "Owners Suite",
  pricesByCurrency: { USD: "150000.00" },
  availability: "available",
  maxGuests: 4,
}
const seedYacht: ExternalCharterYacht = {
  sourceRef: { externalId: "ext-yacht-1" },
  name: "M/Y Acme One",
  slug: "my-acme-one",
  yachtClass: "luxury_motor",
}

function seedAdapter() {
  const adapter = new MockCharterAdapter({ name: "voyant-connect" })
  adapter.addProduct(seedProduct, [seedVoyage])
  adapter.setVoyageSuites(seedVoyage.sourceRef, [seedSuite])
  adapter.setVoyageSchedule(seedVoyage.sourceRef, [])
  adapter.addYacht(seedYacht)
  registerCharterAdapter(adapter)
  return adapter
}

describe("admin routes — invalid key handling", () => {
  const app = mountTestApp(chartersAdminRoutes, { db: undefined })

  it("returns 400 + invalid_key for non-typeid non-external", async () => {
    const res = await app.request("/products/not-a-typeid-and-not-external")
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("invalid_key")
  })
})

describe("admin routes — external key without registered adapter", () => {
  const app = mountTestApp(chartersAdminRoutes, { db: undefined })

  it("returns 501 + adapter_not_registered for external product key", async () => {
    const res = await app.request("/products/voyant-connect:ext-prod-1")
    expect(res.status).toBe(501)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("adapter_not_registered")
  })

  it("returns 501 + adapter_not_registered for external voyage key", async () => {
    const res = await app.request("/voyages/voyant-connect:ext-voy-1")
    expect(res.status).toBe(501)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("adapter_not_registered")
  })
})

describe("admin routes — write rejection on external rows", () => {
  const app = mountTestApp(chartersAdminRoutes, { db: undefined })

  it("returns 409 + external_charter_read_only on PUT /products/<external>", async () => {
    const res = await app.request("/products/voyant-connect:ext-prod-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("external_charter_read_only")
  })

  it("returns 409 on DELETE /products/<external>", async () => {
    const res = await app.request("/products/voyant-connect:ext-prod-1", { method: "DELETE" })
    expect(res.status).toBe(409)
  })

  it("returns 409 on PUT /voyages/<external>/suites/bulk", async () => {
    const res = await app.request("/voyages/voyant-connect:ext-voy-1/suites/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suites: [] }),
    })
    expect(res.status).toBe(409)
  })
})

describe("admin routes — external dispatch via registered adapter", () => {
  it("GET /products/<external> returns the external product", async () => {
    seedAdapter()
    const app = mountTestApp(chartersAdminRoutes, { db: undefined })
    const res = await app.request("/products/voyant-connect:ext-prod-1")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { source: string; sourceProvider: string; product: { name: string } }
    }
    expect(body.data.source).toBe("external")
    expect(body.data.sourceProvider).toBe("voyant-connect")
    expect(body.data.product.name).toBe("Mediterranean Spring")
  })

  it("GET /products/<external>?include=voyages returns the voyages list", async () => {
    seedAdapter()
    const app = mountTestApp(chartersAdminRoutes, { db: undefined })
    const res = await app.request("/products/voyant-connect:ext-prod-1?include=voyages")
    const body = (await res.json()) as { data: { voyages: Array<{ voyageCode: string }> } }
    expect(body.data.voyages).toHaveLength(1)
    expect(body.data.voyages[0]?.voyageCode).toBe("MED-2026-04")
  })

  it("POST /voyages/<external>/quote/per-suite composes a quote from upstream suites", async () => {
    seedAdapter()
    const app = mountTestApp(chartersAdminRoutes, { db: undefined })
    const res = await app.request("/voyages/voyant-connect:ext-voy-1/quote/per-suite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suiteId: "ext-suite-1", currency: "USD" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { total: string; currency: string } }
    expect(body.data.total).toBe("150000.00")
    expect(body.data.currency).toBe("USD")
  })

  it("POST /voyages/<external>/quote/whole-yacht uses voyage override APA", async () => {
    seedAdapter()
    const app = mountTestApp(chartersAdminRoutes, { db: undefined })
    const res = await app.request("/voyages/voyant-connect:ext-voy-1/quote/whole-yacht", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency: "USD" }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { charterFee: string; apaAmount: string; total: string }
    }
    expect(body.data.charterFee).toBe("5000000.00")
    expect(body.data.apaAmount).toBe("1500000.00") // 30% of 5,000,000
    expect(body.data.total).toBe("6500000.00")
  })

  it("returns 404 no_matching_suite when external suite ref is unknown", async () => {
    seedAdapter()
    const app = mountTestApp(chartersAdminRoutes, { db: undefined })
    const res = await app.request("/voyages/voyant-connect:ext-voy-1/quote/per-suite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suiteId: "ext-suite-nope", currency: "USD" }),
    })
    expect(res.status).toBe(404)
  })
})

describe("admin routes — MYBA endpoint without contracts service", () => {
  it("returns 501 + contracts_service_unavailable when chartersContractsService is unset", async () => {
    const app = mountTestApp(chartersAdminRoutes, { db: undefined })
    const res = await app.request("/bookings/book_abc/myba", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(501)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("contracts_service_unavailable")
  })
})

describe("public routes — external dispatch", () => {
  it("GET /products/<external> resolves the external product when adapter is registered", async () => {
    seedAdapter()
    const app = mountTestApp(chartersPublicRoutes, { db: undefined })
    const res = await app.request("/products/voyant-connect:ext-prod-1")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { source: string; sourceProvider: string; product: { name: string } }
    }
    expect(body.data.source).toBe("external")
    expect(body.data.product.name).toBe("Mediterranean Spring")
  })

  it("GET /yachts/<external> returns the upstream yacht", async () => {
    seedAdapter()
    const app = mountTestApp(chartersPublicRoutes, { db: undefined })
    const res = await app.request("/yachts/voyant-connect:ext-yacht-1")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { name: string } }
    expect(body.data.name).toBe("M/Y Acme One")
  })

  it("returns 501 adapter_not_registered when external key resolves no adapter", async () => {
    const app = mountTestApp(chartersPublicRoutes, { db: undefined })
    const res = await app.request("/voyages/voyant-connect:ext-voy-1")
    expect(res.status).toBe(501)
  })
})
