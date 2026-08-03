import { OpenAPIHono } from "@hono/zod-openapi"
import { describe, expect, it } from "vitest"

import { publicBookingRoutes } from "../../src/routes-public.js"

describe("committed Booking public routes", () => {
  it.each([
    ["POST", "/"],
    ["GET", "/sessions/legacy"],
    ["PATCH", "/sessions/legacy"],
    ["PUT", "/sessions/legacy/state"],
    ["POST", "/sessions/legacy/reprice"],
    ["POST", "/sessions/legacy/confirm"],
    ["POST", "/sessions/legacy/expire"],
  ])("does not expose %s %s", async (method, path) => {
    const app = new OpenAPIHono().route("/", publicBookingRoutes)
    const response = await app.request(path, { method })
    expect(response.status).toBe(404)
  })
})
