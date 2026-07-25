import { Hono } from "hono"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createTripsRoutes } from "../src/routes.js"
import { tripsService } from "../src/service.js"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("trips routes", () => {
  it("exposes package health", async () => {
    const app = createTripsRoutes()
    const res = await app.request("/health")

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: {
        module: "trips",
        status: "scaffolded",
      },
    })
  })

  it("keeps adapter-backed operations unavailable until runtime deps are configured", async () => {
    const app = createTripsRoutes()
    const res = await app.request("/trip_123/checkout", {
      method: "POST",
      body: JSON.stringify({ intent: "card" }),
      headers: { "content-type": "application/json" },
    })

    expect(res.status).toBe(501)
    await expect(res.json()).resolves.toEqual({
      error: "Trips checkout dependencies are not configured",
    })
  })

  it("blocks admin-only mutation routes on the public surface", async () => {
    const app = createTripsRoutes({ surface: "public" })
    const res = await app.request("/components/trcp_123/refs", {
      method: "POST",
      body: JSON.stringify({ catalogQuoteId: "quote_123" }),
      headers: { "content-type": "application/json" },
    })

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      error: "Trips operation is admin-only",
    })
  })

  it("blocks support cancellation routes on the public surface", async () => {
    const app = createTripsRoutes({ surface: "public" })
    const res = await app.request("/trip_123/cancellation-preview", {
      method: "POST",
      body: JSON.stringify({ componentIds: ["trcp_123"] }),
      headers: { "content-type": "application/json" },
    })

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      error: "Trips operation is admin-only",
    })
  })

  it("blocks requirement routes on the public surface", async () => {
    const app = createTripsRoutes({ surface: "public" })
    // Bodies are valid so the migrated routes reach the admin-only surface
    // guard (403) rather than tripping the OpenAPI body validator (400) first.
    const adminOnly = [
      {
        method: "POST",
        path: "/trip_123/requirements",
        body: { vertical: "accommodation", criteriaVersion: "v1" },
      },
      { method: "GET", path: "/trip_123/requirements" },
      {
        method: "GET",
        path: "/requirements/trrq_1/sourcing-operations/act_1",
      },
      { method: "POST", path: "/requirements/trrq_1/select", body: { candidateId: "trcd_1" } },
    ]
    for (const { method, path, body } of adminOnly) {
      const res = await app.request(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: { "content-type": "application/json" },
      })
      expect(res.status, `${method} ${path}`).toBe(403)
    }
  })

  it("does not expose the removed inline sourcing and re-shop routes", async () => {
    const app = createTripsRoutes()
    const scope = { locale: "en-GB", audience: "staff", market: "GB" }
    for (const path of [
      "/requirements/trrq_1/candidates",
      "/requirements/trrq_1/reshop",
      "/trip_123/reshop",
    ]) {
      const response = await app.request(path, {
        method: "POST",
        body: JSON.stringify({ scope }),
        headers: { "content-type": "application/json" },
      })
      expect(response.status, path).toBe(404)
    }
  })

  it("returns tenant-bound sourcing status without caching or leaking mismatches", async () => {
    const read = vi
      .spyOn(tripsService, "getTripRequirementSourcingOperation")
      .mockResolvedValueOnce({
        operationId: "act_1",
        requirementId: "trrq_1",
        status: "completed",
        result: {
          status: "accepted",
          operationId: "act_1",
          requirementId: "trrq_1",
          statusTool: "get_trip_requirement_sourcing_operation",
        },
        outcome: {
          status: "completed",
          candidateCount: 2,
          requirementStatus: "candidates_ready",
        },
        error: null,
        attempts: 1,
        maxAttempts: 8,
        nextAttemptAt: new Date("2026-07-24T10:00:00.000Z"),
        completedAt: new Date("2026-07-24T10:00:01.000Z"),
        createdAt: new Date("2026-07-24T09:59:59.000Z"),
        updatedAt: new Date("2026-07-24T10:00:01.000Z"),
      })
      .mockResolvedValueOnce(null)
    const app = appWithDb(createTripsRoutes(), "tenant_1")
    const path = "/requirements/trrq_1/sourcing-operations/act_1"

    const response = await app.request(path)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(read).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        operationId: "act_1",
        requirementId: "trrq_1",
        organizationId: "tenant_1",
      }),
    )
    await expect(response.json()).resolves.toMatchObject({
      data: {
        operationId: "act_1",
        status: "completed",
        outcome: { status: "completed", candidateCount: 2 },
      },
    })

    const hidden = await app.request(path)
    expect(hidden.status).toBe(404)
    await expect(hidden.json()).resolves.toEqual({
      error: "Trip requirement sourcing operation was not found",
    })
  })

  it("does not expose direct price or reserve mutation routes", async () => {
    const routeOptions = vi.fn(async () => ({}))
    const app = appWithDb(createTripsRoutes(routeOptions))

    expect(routeOptions).not.toHaveBeenCalled()

    const health = await app.request("/health")
    expect(health.status).toBe(200)
    expect(routeOptions).not.toHaveBeenCalled()

    for (const path of ["/trip_123/price", "/trip_123/reserve"]) {
      const response = await app.request(path, {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      })
      expect(response.status, path).toBe(404)
    }
    expect(routeOptions).not.toHaveBeenCalled()
  })
})

function appWithDb(routes: ReturnType<typeof createTripsRoutes>, organizationId?: string) {
  const app = new Hono()
  app.use("*", async (c, next) => {
    c.set("db" as never, {} as never)
    if (organizationId) c.set("organizationId" as never, organizationId as never)
    await next()
  })
  app.route("/", routes)
  return app
}
