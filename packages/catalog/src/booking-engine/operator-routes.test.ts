import { readFileSync } from "node:fs"
import { OpenAPIHono } from "@hono/zod-openapi"
import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { readSourcedEntry } from "../services/sourced-entry-service.js"
import { cancelEntity } from "./cancel.js"
import { BookingEngineError } from "./errors.js"
import {
  type CatalogBookingRouteModuleOptions,
  catalogBookingRoutePaths,
  catalogBookingTransactionalPaths,
  createCatalogBookingEngineApiModule,
  createCatalogBookingOrdersRoutes,
  mountCatalogBookingRoutes,
} from "./operator-routes.js"
import { getOrderById, listOrders } from "./orders.js"
import { createSourceAdapterRegistry } from "./registry.js"

vi.mock("./orders.js", () => ({
  listOrders: vi.fn(),
  getOrderById: vi.fn(),
}))

vi.mock("./cancel.js", () => ({
  cancelEntity: vi.fn(),
}))

vi.mock("../services/sourced-entry-service.js", () => ({
  readSourcedEntry: vi.fn(),
}))

const db = { kind: "db" } as never
const registry = createSourceAdapterRegistry()

function makeOptions(
  overrides: Partial<CatalogBookingRouteModuleOptions> = {},
): CatalogBookingRouteModuleOptions {
  return {
    resolveDb: () => db,
    resolveRegistry: () => registry,
    getProductContent: vi.fn(async () => null),
    listAvailabilitySlots: vi.fn(async () => []),
    getOwnedProductById: vi.fn(async () => null),
    ...overrides,
  }
}

function ordersApp(options = makeOptions()) {
  const app = new Hono()
  app.route("/v1/admin/catalog", createCatalogBookingOrdersRoutes(options))
  return app
}

/**
 * A fake drizzle db whose `select(...).from(...).where(...).limit(...)`
 * chain resolves to the next queued result array. The snapshot path issues
 * two reads (snapshot row, then sourced-entries projection); queue results
 * in call order.
 */
function makeFakeDb(results: unknown[][]) {
  let call = 0
  const next = () => results[call++] ?? []
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(next()),
  }
  return { select: () => chain } as never
}

beforeEach(() => {
  vi.mocked(listOrders).mockReset()
  vi.mocked(getOrderById).mockReset()
  vi.mocked(cancelEntity).mockReset()
  vi.mocked(readSourcedEntry).mockReset()
})

describe("createCatalogBookingOrdersRoutes", () => {
  describe("GET /orders", () => {
    it("delegates to listOrders with parsed filters and returns rows", async () => {
      vi.mocked(listOrders).mockResolvedValue({ rows: [{ id: "snap_1" } as never] })
      const app = ordersApp()

      const res = await app.request(
        "/v1/admin/catalog/orders?bookingId=bk_1&entityModule=products&sourceKinds=demo,owned&limit=10&offset=5",
      )

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ rows: [{ id: "snap_1" }] })
      expect(listOrders).toHaveBeenCalledWith(db, {
        bookingId: "bk_1",
        entityModule: "products",
        sourceKinds: ["demo", "owned"],
        limit: 10,
        offset: 5,
      })
    })

    it("falls back to default limit/offset when not numeric", async () => {
      vi.mocked(listOrders).mockResolvedValue({ rows: [] })
      const app = ordersApp()

      await app.request("/v1/admin/catalog/orders?limit=abc")

      expect(listOrders).toHaveBeenCalledWith(db, expect.objectContaining({ limit: 50, offset: 0 }))
    })
  })

  describe("GET /orders/:id", () => {
    it("returns the order row when found", async () => {
      vi.mocked(getOrderById).mockResolvedValue({ id: "snap_1" } as never)
      const app = ordersApp()

      const res = await app.request("/v1/admin/catalog/orders/snap_1")

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ id: "snap_1" })
      expect(getOrderById).toHaveBeenCalledWith(db, "snap_1")
    })

    it("404s when the order is missing", async () => {
      vi.mocked(getOrderById).mockResolvedValue(null)
      const app = ordersApp()

      const res = await app.request("/v1/admin/catalog/orders/missing")

      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "order not found" })
    })
  })

  describe("POST /orders/:id/cancel", () => {
    it("400s when required body fields are missing", async () => {
      const app = ordersApp()

      const res = await app.request("/v1/admin/catalog/orders/snap_1/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId: "bk_1" }),
      })

      expect(res.status).toBe(400)
      expect(cancelEntity).not.toHaveBeenCalled()
    })

    it("delegates to cancelEntity with the resolved registry", async () => {
      vi.mocked(cancelEntity).mockResolvedValue({
        status: "cancelled",
        snapshotId: "snap_1",
      } as never)
      const app = ordersApp()

      const res = await app.request("/v1/admin/catalog/orders/snap_1/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId: "bk_1",
          entityModule: "products",
          entityId: "prod_1",
          reason: "customer request",
        }),
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: "cancelled", snapshotId: "snap_1" })
      expect(cancelEntity).toHaveBeenCalledWith(
        db,
        { registry },
        expect.objectContaining({
          bookingId: "bk_1",
          entityModule: "products",
          entityId: "prod_1",
          reason: "customer request",
        }),
      )
    })

    it("translates BookingEngineError codes into HTTP statuses", async () => {
      vi.mocked(cancelEntity).mockRejectedValue(new BookingEngineError("ORDER_NOT_FOUND", "nope"))
      const app = ordersApp()

      const res = await app.request("/v1/admin/catalog/orders/snap_1/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId: "bk_1",
          entityModule: "products",
          entityId: "prod_1",
        }),
      })

      expect(res.status).toBe(404)
      const body = (await res.json()) as { code: string }
      expect(body.code).toBe("ORDER_NOT_FOUND")
    })
  })
})

describe("mountCatalogBookingRoutes", () => {
  it("keeps the lazy dispatch contract aligned with the published OpenAPI paths", () => {
    const admin = JSON.parse(
      readFileSync(new URL("../../openapi/admin/catalog-booking.json", import.meta.url), "utf8"),
    ) as { paths: Record<string, unknown> }
    const storefront = JSON.parse(
      readFileSync(
        new URL("../../openapi/storefront/catalog-booking.json", import.meta.url),
        "utf8",
      ),
    ) as { paths: Record<string, unknown> }
    const publishedPaths = [...Object.keys(admin.paths), ...Object.keys(storefront.paths)].sort()
    const dispatchPaths = catalogBookingRoutePaths
      .map((path) => path.replace(/:([^/]+)/g, "{$1}"))
      .sort()

    expect(publishedPaths).toEqual(dispatchPaths)
  })

  it("publishes a lazy package runtime descriptor with the complete route contract", async () => {
    const descriptor = createCatalogBookingEngineApiModule(makeOptions())

    expect(descriptor.module).toEqual({ name: "catalog-booking" })
    expect(descriptor.publicPath).toBe("catalog")
    expect(descriptor.anonymous).toEqual(["/booking-sessions"])
    expect(descriptor.optionalCustomerAuth).toEqual(["/booking-sessions"])
    expect(descriptor.lazyRoutes?.paths).toBe(catalogBookingRoutePaths)
    expect(descriptor.transactionalPaths).toBe(catalogBookingTransactionalPaths)

    const routes = await descriptor.lazyRoutes?.load()
    const response = await routes?.request("/v1/public/catalog/quote", { method: "POST" })
    expect(response?.status).toBe(404)
  })

  it("does not mount the retired quote/draft/hold bootstrap surface", async () => {
    const app = new OpenAPIHono()
    mountCatalogBookingRoutes(app, makeOptions())

    const admin = await app.request("/v1/admin/catalog/quote", { method: "POST" })
    const pub = await app.request("/v1/public/catalog/quote", { method: "POST" })
    const draft = await app.request("/v1/public/catalog/drafts/draft_1")
    const hold = await app.request("/v1/public/catalog/holds/place", { method: "POST" })

    expect([admin.status, pub.status, draft.status, hold.status]).toEqual([404, 404, 404, 404])
  })

  it("mounts admin-only order routes", async () => {
    vi.mocked(listOrders).mockResolvedValue({ rows: [] })
    const app = new OpenAPIHono()
    mountCatalogBookingRoutes(app, makeOptions())

    const res = await app.request("/v1/admin/catalog/orders")

    expect(res.status).toBe(200)
    expect(listOrders).toHaveBeenCalled()
  })
})

describe("GET /catalog/slots", () => {
  it("400s when entityModule/entityId are missing", async () => {
    const app = new OpenAPIHono()
    mountCatalogBookingRoutes(app, makeOptions())

    const res = await app.request("/v1/admin/catalog/slots?entityModule=products")

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "entityModule and entityId are required" })
  })

  it("returns empty rows for non-products entities", async () => {
    const app = new OpenAPIHono()
    mountCatalogBookingRoutes(app, makeOptions())

    const res = await app.request("/v1/public/catalog/slots?entityModule=cruises&entityId=crz_1")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rows: [] })
  })

  it("maps sourced product departures via market-scoped getProductContent", async () => {
    vi.mocked(readSourcedEntry).mockResolvedValue({ entity_id: "prod_1" } as never)
    const getProductContent = vi.fn(async () => ({
      content: {
        departures: [
          {
            id: "dep_1",
            starts_at: "2999-01-01T08:00:00Z",
            ends_at: "2999-01-01T12:00:00Z",
            status: "open",
            capacity: 10,
            remaining: 4,
          },
          // Filtered out — sold_out.
          { id: "dep_2", starts_at: "2999-02-01T08:00:00Z", status: "sold_out" },
          // Filtered out — in the past.
          { id: "dep_3", starts_at: "2000-01-01T08:00:00Z", status: "open" },
        ],
      },
    }))
    const app = new OpenAPIHono()
    mountCatalogBookingRoutes(app, makeOptions({ getProductContent }))

    const res = await app.request(
      "/v1/admin/catalog/slots?entityModule=products&entityId=prod_1&market=mkt_ro&locale=ro-RO&currency=RON",
      { headers: { "accept-language": "ro-RO,en-GB;q=0.8" } },
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      rows: [
        {
          id: "dep_1",
          dateLocal: "2999-01-01",
          startsAt: "2999-01-01T08:00:00Z",
          endsAt: "2999-01-01T12:00:00Z",
          timezone: "UTC",
          status: "open",
          unlimited: false,
          remainingPax: 4,
          initialPax: 10,
          nights: null,
          days: null,
        },
      ],
    })
    expect(getProductContent).toHaveBeenCalledWith(
      expect.anything(),
      "prod_1",
      {
        preferredLocales: ["ro-RO", "en-GB"],
        audience: "staff",
        market: "mkt_ro",
        currency: "RON",
      },
      expect.objectContaining({ forceFresh: true }),
    )
  })

  it("falls back to owned availability slots when not sourced", async () => {
    vi.mocked(readSourcedEntry).mockResolvedValue(null)
    const ownedRows = [{ id: "slot_1", dateLocal: "2999-01-01" }]
    const listAvailabilitySlots = vi.fn(async () => ownedRows as never)
    const app = new OpenAPIHono()
    mountCatalogBookingRoutes(app, makeOptions({ listAvailabilitySlots }))

    const res = await app.request("/v1/public/catalog/slots?entityModule=products&entityId=prod_1")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rows: ownedRows })
    expect(listAvailabilitySlots).toHaveBeenCalledWith(
      expect.anything(),
      "prod_1",
      expect.any(String),
      { market: undefined, locale: undefined, currency: undefined },
    )
  })

  it("passes storefront scope to owned availability slot readers", async () => {
    vi.mocked(readSourcedEntry).mockResolvedValue(null)
    const listAvailabilitySlots = vi.fn(async () => [] as never)
    const app = new OpenAPIHono()
    mountCatalogBookingRoutes(app, makeOptions({ listAvailabilitySlots }))

    const res = await app.request(
      "/v1/public/catalog/slots?entityModule=products&entityId=prod_1&market=mkt_gb&locale=en-GB&currency=GBP",
    )

    expect(res.status).toBe(200)
    expect(listAvailabilitySlots).toHaveBeenCalledWith(
      expect.anything(),
      "prod_1",
      expect.any(String),
      { market: "mkt_gb", locale: "en-GB", currency: "GBP" },
    )
  })
})

describe("GET /admin/bookings/:id/catalog-snapshot", () => {
  it("404s when no snapshot exists", async () => {
    const options = makeOptions()
    options.resolveDb = () => makeFakeDb([[]])
    const app = new OpenAPIHono()
    mountCatalogBookingRoutes(app, options)

    const res = await app.request("/v1/admin/bookings/bk_1/catalog-snapshot")

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "snapshot_not_found" })
  })

  it("returns the snapshot enriched with resolved labels", async () => {
    const snapshot = {
      booking_id: "bk_1",
      entity_module: "products",
      entity_id: "prod_1",
      source_kind: "demo",
      source_provider: "demo",
      frozen_payload: {},
    }
    // First read → snapshot row; second read → sourced-entries projection.
    const db = makeFakeDb([
      [snapshot],
      [{ projection: { name: "Northern Lights Hunt", description: "A tour" } }],
    ])
    const options = makeOptions()
    options.resolveDb = () => db
    const app = new OpenAPIHono()
    mountCatalogBookingRoutes(app, options)

    const res = await app.request("/v1/admin/bookings/bk_1/catalog-snapshot")

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: {
        booking_id: string
        resolved: {
          entity: { title: string | null; description: string | null }
          source: { label: string }
        }
      }
    }
    expect(body.data.booking_id).toBe("bk_1")
    expect(body.data.resolved.entity.title).toBe("Northern Lights Hunt")
    expect(body.data.resolved.entity.description).toBe("A tour")
    expect(body.data.resolved.source.label).toBe("Demo Catalog")
  })

  it("falls back to owned product when the sourced projection is empty", async () => {
    const snapshot = {
      booking_id: "bk_1",
      entity_module: "products",
      entity_id: "prod_1",
      source_kind: "owned",
      source_provider: null,
      frozen_payload: {},
    }
    const db = makeFakeDb([[snapshot], []])
    const getOwnedProductById = vi.fn(async () => ({
      name: "Owned Tour",
      description: "Owned desc",
    }))
    const options = makeOptions({ getOwnedProductById })
    options.resolveDb = () => db
    const app = new OpenAPIHono()
    mountCatalogBookingRoutes(app, options)

    const res = await app.request("/v1/admin/bookings/bk_1/catalog-snapshot")

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { resolved: { entity: { title: string | null }; source: { label: string } } }
    }
    expect(body.data.resolved.entity.title).toBe("Owned Tour")
    expect(body.data.resolved.source.label).toBe("Owned (this operator)")
    expect(getOwnedProductById).toHaveBeenCalledWith(expect.anything(), "prod_1")
  })
})
