import { createContainer } from "@voyant-travel/core"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import {
  RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY,
  type RelationshipsRouteRuntime,
} from "../../src/route-runtime.js"
import { relationshipsRoutes } from "../../src/routes/index.js"

describe("Inquiry conversion availability", () => {
  it("returns 503 when Relationships is deployed without the optional Proposal provider", async () => {
    const container = createContainer()
    container.register(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY, {
      getKmsProvider: async () => null,
    } satisfies RelationshipsRouteRuntime)
    const app = new Hono()
    const authorizePermission = vi.fn(async () => "allowed" as const)
    app.use("*", async (c, next) => {
      c.set("userId" as never, "staff_1")
      c.set("db" as never, {})
      c.set("container" as never, container)
      c.set("authorizePermission" as never, authorizePermission)
      await next()
    })
    app.route("/", relationshipsRoutes)

    const response = await app.request("/inquiries/inq_missing/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "proposal", idempotencyKey: "unavailable" }),
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: "Proposal conversion is unavailable" })
    expect(authorizePermission).toHaveBeenCalledWith({ resource: "proposals", action: "write" })
  })

  it("requires Catalog Booking Session permission before returning a direct-Booking refusal", async () => {
    const container = createContainer()
    container.register(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY, {
      getKmsProvider: async () => null,
    } satisfies RelationshipsRouteRuntime)
    const authorizePermission = vi.fn(async () => "allowed" as const)
    const app = new Hono()
    app.use("*", async (c, next) => {
      c.set("userId" as never, "staff_1")
      c.set("db" as never, {})
      c.set("container" as never, container)
      c.set("authorizePermission" as never, authorizePermission)
      await next()
    })
    app.route("/", relationshipsRoutes)

    const response = await app.request("/inquiries/inq_missing/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "booking", idempotencyKey: "direct-refusal" }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ reason: "booking_session_required" })
    expect(authorizePermission).toHaveBeenCalledWith({
      resource: "catalog",
      action: "booking-session-write",
    })
  })
})
