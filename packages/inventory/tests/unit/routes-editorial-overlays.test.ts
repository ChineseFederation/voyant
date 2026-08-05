import { OpenAPIHono } from "@hono/zod-openapi"
import type { SourceAdapterRegistry } from "@voyant-travel/catalog/booking-engine"
import { beforeEach, describe, expect, it, vi } from "vitest"

const serviceMocks = vi.hoisted(() => ({
  clearProductEditorialOverlay: vi.fn(),
  listProductEditorialOverlayHistory: vi.fn(async () => []),
  readProductEditorialOverlayState: vi.fn(async () => ({
    subject: { module: "products", id: "prod_1" },
  })),
  writeProductEditorialOverlay: vi.fn(async (_db, _productId, input) => ({
    id: "ovl_1",
    origin: input.origin,
  })),
  OverlayVersionConflictError: class OverlayVersionConflictError extends Error {
    currentVersion = null
  },
  OwnedProductNotOverlayableError: class OwnedProductNotOverlayableError extends Error {
    productId = "prod_1"
  },
}))

vi.mock("../../src/service-editorial-overlays.js", () => serviceMocks)

import { createProductEditorialOverlayRoutes } from "../../src/routes-editorial-overlays.js"

function makeRegistry(): SourceAdapterRegistry {
  return {
    register: vi.fn(),
    resolveByConnection: vi.fn(() => undefined),
    resolveByConnectionOrThrow: vi.fn(),
    resolveOrThrow: vi.fn(),
    byKind: vi.fn(() => []),
    connections: vi.fn(() => []),
    kinds: vi.fn(() => []),
    has: vi.fn(() => false),
    hasKind: vi.fn(() => false),
  } as never
}

function buildApp(userId?: string, eventBus?: { emit: ReturnType<typeof vi.fn> }) {
  const app = new OpenAPIHono()
  app.onError((error, c) => {
    const status = (error as { status?: number }).status ?? 500
    return c.json({ error: error.message }, status as never)
  })
  app.use("*", async (c, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: route unit test injects only context variables used by the handler. -- owner: products
    ;(c as any).set("db", {})
    if (eventBus) {
      // biome-ignore lint/suspicious/noExplicitAny: route unit test injects only context variables used by the handler. -- owner: products
      ;(c as any).set("eventBus", eventBus)
    }
    if (userId) {
      // biome-ignore lint/suspicious/noExplicitAny: route unit test injects only context variables used by the handler. -- owner: products
      ;(c as any).set("userId", userId)
    }
    await next()
  })
  app.route("/", createProductEditorialOverlayRoutes({ resolveRegistry: () => makeRegistry() }))
  return app
}

describe("createProductEditorialOverlayRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("attributes admin-ui writes to the authenticated user id", async () => {
    const app = buildApp("usr_editor")

    const res = await app.request("/prod_1/editorial-overlays", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fieldPath: "name",
        locale: "ro-RO",
        audience: "customer",
        market: "RO",
        value: "Nume",
      }),
    })

    expect(res.status).toBe(200)
    expect(serviceMocks.writeProductEditorialOverlay).toHaveBeenCalledWith(
      expect.anything(),
      "prod_1",
      expect.objectContaining({
        origin: { kind: "admin-ui", user_id: "usr_editor" },
      }),
      expect.anything(),
    )
  })

  it("emits one catalog overlay-change event after a successful write", async () => {
    const eventBus = { emit: vi.fn().mockResolvedValue(undefined) }
    const app = buildApp("usr_editor", eventBus)

    const res = await app.request("/prod_1/editorial-overlays", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodeKind: "itinerary-day",
        nodeKey: "day_2",
        fieldPath: "title",
        locale: "ro-RO",
        audience: "customer",
        market: "RO",
        value: "Ziua doi",
      }),
    })

    expect(res.status).toBe(200)
    expect(eventBus.emit).toHaveBeenCalledTimes(1)
    expect(eventBus.emit).toHaveBeenCalledWith(
      "catalog.entity.overlay.changed",
      expect.objectContaining({
        entity_module: "products",
        entity_id: "prod_1",
        node_kind: "itinerary-day",
        node_key: "day_2",
        field_path: "title",
        locale: "ro-RO",
        audience: "customer",
        market: "RO",
      }),
      expect.anything(),
    )
  })

  it("emits only when clear actually mutates an overlay", async () => {
    const eventBus = { emit: vi.fn().mockResolvedValue(undefined) }
    serviceMocks.clearProductEditorialOverlay
      .mockResolvedValueOnce({
        node_kind: "root",
        node_key: "root",
        field_path: "name",
        locale: "ro-RO",
        audience: "customer",
        market: "RO",
      })
      .mockResolvedValueOnce(null)
    const app = buildApp("usr_editor", eventBus)
    const url = "/prod_1/editorial-overlays?fieldPath=name&locale=ro-RO&audience=customer&market=RO"

    expect((await app.request(url, { method: "DELETE" })).status).toBe(200)
    expect((await app.request(url, { method: "DELETE" })).status).toBe(200)

    expect(eventBus.emit).toHaveBeenCalledTimes(1)
    expect(eventBus.emit).toHaveBeenCalledWith(
      "catalog.entity.overlay.changed",
      expect.objectContaining({ entity_module: "products", entity_id: "prod_1" }),
      expect.anything(),
    )
  })

  it("rejects the default scope sentinel as a localized overlay locale", async () => {
    const app = buildApp("usr_editor")

    const res = await app.request("/prod_1/editorial-overlays", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fieldPath: "name",
        locale: "default",
        audience: "customer",
        market: "RO",
        value: "Nume",
      }),
    })

    expect(res.status).toBe(400)
    expect(serviceMocks.writeProductEditorialOverlay).not.toHaveBeenCalled()
  })

  it("does not attribute unauthenticated writes to system", async () => {
    const app = buildApp()

    const res = await app.request("/prod_1/editorial-overlays", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fieldPath: "name",
        locale: "ro-RO",
        audience: "customer",
        market: "RO",
        value: "Nume",
      }),
    })

    expect(res.status).toBe(401)
    expect(serviceMocks.writeProductEditorialOverlay).not.toHaveBeenCalled()
  })

  // An owned product authors its copy directly, so it has no overlay
  // collection. Every verb has to say that the same way — a 500, or a silent
  // 200 with an empty comparison, is what put a broken card on the operator's
  // owned product page in the first place.
  it("answers 404 not_overlayable on reads of an owned product", async () => {
    serviceMocks.readProductEditorialOverlayState.mockRejectedValueOnce(
      new serviceMocks.OwnedProductNotOverlayableError("owned"),
    )
    const app = buildApp("usr_editor")

    const res = await app.request("/prod_1/editorial-overlays?locale=ro-RO")

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: "not_overlayable" })
  })

  it("answers 404 not_overlayable on writes to an owned product", async () => {
    serviceMocks.writeProductEditorialOverlay.mockRejectedValueOnce(
      new serviceMocks.OwnedProductNotOverlayableError("owned"),
    )
    const app = buildApp("usr_editor")

    const res = await app.request("/prod_1/editorial-overlays", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fieldPath: "name",
        locale: "ro-RO",
        audience: "customer",
        market: "RO",
        value: "Nume",
      }),
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: "not_overlayable" })
  })

  it("answers 404 not_overlayable on clears and history for an owned product", async () => {
    serviceMocks.clearProductEditorialOverlay.mockRejectedValueOnce(
      new serviceMocks.OwnedProductNotOverlayableError("owned"),
    )
    serviceMocks.listProductEditorialOverlayHistory.mockRejectedValueOnce(
      new serviceMocks.OwnedProductNotOverlayableError("owned"),
    )
    const app = buildApp("usr_editor")
    const scope = "locale=ro-RO&audience=customer&market=RO"

    const cleared = await app.request(`/prod_1/editorial-overlays?fieldPath=name&${scope}`, {
      method: "DELETE",
    })
    const history = await app.request(`/prod_1/editorial-overlays/history?${scope}`)

    expect(cleared.status).toBe(404)
    expect(await cleared.json()).toMatchObject({ error: "not_overlayable" })
    expect(history.status).toBe(404)
    expect(await history.json()).toMatchObject({ error: "not_overlayable" })
  })
})
