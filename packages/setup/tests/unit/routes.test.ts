import { OpenAPIHono } from "@hono/zod-openapi"
import { handleApiError, type VoyantDb } from "@voyant-travel/hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createSetupRoutes } from "../../src/routes.js"
import type { SetupStore } from "../../src/service.js"

const store = {
  transaction: vi.fn(async (run: (store: SetupStore) => Promise<unknown>) => run(store)),
  createOrganization: vi.fn(async () => true),
  getOrganization: vi.fn(async () => ({
    id: "organization",
    startedAt: new Date("2026-07-15T08:00:00.000Z"),
    firstRunOpenedAt: null,
    dismissedAt: null,
  })),
  ensureStep: vi.fn(async () => true),
  listSteps: vi.fn(async () => []),
  markCompleted: vi.fn(),
  markSkipped: vi.fn(),
  markDismissed: vi.fn(async (at: Date) => ({
    id: "organization",
    startedAt: new Date("2026-07-15T08:00:00.000Z"),
    firstRunOpenedAt: null,
    dismissedAt: at,
  })),
} satisfies SetupStore

function app(userId?: string, scopes = userId ? ["*"] : undefined) {
  const app = new OpenAPIHono()
  app.use("*", async (c, next) => {
    c.set("db", {} as VoyantDb)
    if (userId) c.set("userId", userId)
    if (scopes) c.set("scopes", scopes)
    await next()
  })
  app.route(
    "/",
    createSetupRoutes({
      createStore: () => store,
      steps: [
        { id: "acme.profile", skippable: true },
        { id: "acme.required", skippable: false },
      ],
    }),
  )
  app.onError((error, c) => handleApiError(error, c))
  return app
}

describe("setup routes", () => {
  beforeEach(() => vi.clearAllMocks())

  it("requires an authenticated staff user", async () => {
    const response = await app().request("/v1/admin/setup")
    expect(response.status).toBe(401)
  })

  it("initializes setup for an authenticated user", async () => {
    const response = await app("user_1").request("/v1/admin/setup/initialize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepIds: ["acme.profile", "acme.required"], fresh: true }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { shouldRedirect: true } })
  })

  it("allows an exact setup manager scope to read and initialize", async () => {
    const scopedApp = app("user_1", ["setup:write"])
    const stateResponse = await scopedApp.request("/v1/admin/setup")
    expect(stateResponse.status).toBe(200)
    expect(await stateResponse.json()).toMatchObject({ data: { canManage: true } })

    const initializeResponse = await scopedApp.request("/v1/admin/setup/initialize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepIds: ["acme.profile", "acme.required"], fresh: true }),
    })
    expect(initializeResponse.status).toBe(200)
  })

  it.each([
    ["editor", ["bookings:read", "bookings:write"]],
    ["viewer", ["*:read", "*:search"]],
  ])("lets %s scopes read setup without allowing initialization", async (_role, scopes) => {
    const scopedApp = app("user_1", scopes)
    const stateResponse = await scopedApp.request("/v1/admin/setup")
    expect(stateResponse.status).toBe(200)
    expect(await stateResponse.json()).toMatchObject({ data: { canManage: false } })

    const initializeResponse = await scopedApp.request("/v1/admin/setup/initialize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepIds: ["acme.profile", "acme.required"], fresh: true }),
    })
    expect(initializeResponse.status).toBe(403)
    const completeResponse = await scopedApp.request(
      "/v1/admin/setup/steps/acme.profile/complete",
      { method: "POST" },
    )
    const skipResponse = await scopedApp.request("/v1/admin/setup/steps/acme.profile/skip", {
      method: "POST",
    })
    expect(completeResponse.status).toBe(403)
    expect(skipResponse.status).toBe(403)
    expect(store.createOrganization).not.toHaveBeenCalled()
    expect(store.markCompleted).not.toHaveBeenCalled()
    expect(store.markSkipped).not.toHaveBeenCalled()
  })

  it("rejects initialization ids that differ from the selected graph", async () => {
    const response = await app("user_1").request("/v1/admin/setup/initialize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stepIds: ["acme.profile"], fresh: true }),
    })
    expect(response.status).toBe(400)
    expect(store.createOrganization).not.toHaveBeenCalled()
  })

  it("rejects unknown completion and a non-skippable skip", async () => {
    const unknown = await app("user_1").request("/v1/admin/setup/steps/not-selected/complete", {
      method: "POST",
    })
    const required = await app("user_1").request("/v1/admin/setup/steps/acme.required/skip", {
      method: "POST",
    })

    expect(unknown.status).toBe(400)
    expect(required.status).toBe(400)
    expect(store.markCompleted).not.toHaveBeenCalled()
    expect(store.markSkipped).not.toHaveBeenCalled()
  })

  it("dismisses setup guidance for an authenticated manager", async () => {
    const response = await app("user_1").request("/v1/admin/setup/dismiss", { method: "POST" })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { dismissedAt: expect.any(String) },
    })
    expect(store.markDismissed).toHaveBeenCalledOnce()
  })

  it("forbids dismiss without setup write scope", async () => {
    const response = await app("user_1", ["*:read"]).request("/v1/admin/setup/dismiss", {
      method: "POST",
    })
    expect(response.status).toBe(403)
    expect(store.markDismissed).not.toHaveBeenCalled()
  })
})
