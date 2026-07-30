// agent-quality: file-size exception -- owner: catalog; booking-engine route tests stay co-located to cover the shared quote/draft/hold route factory until a dedicated split preserves route setup coverage.
import { handleApiError } from "@voyant-travel/hono"
import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { PricingBasis } from "../snapshot/schema.js"
import { issueBookingDraftCapability } from "./draft-capability.js"

import {
  createBookingDraft,
  deleteBookingDraft,
  getBookingDraft,
  updateBookingDraft,
} from "./drafts-service.js"
import { createOwnedBookingHandlerRegistry, type OwnedBookingHandler } from "./owned-handler.js"
import { quoteEntitiesBatch, quoteEntity } from "./quote.js"
import { createSourceAdapterRegistry } from "./registry.js"
import {
  type CatalogBookingRoutesOptions,
  createCatalogBookingApiModule,
  createCatalogBookingRoutes,
} from "./routes.js"

vi.mock("./quote.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./quote.js")>()
  return { ...actual, quoteEntity: vi.fn(), quoteEntitiesBatch: vi.fn() }
})

vi.mock("./drafts-service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./drafts-service.js")>()
  return {
    ...actual,
    createBookingDraft: vi.fn(),
    deleteBookingDraft: vi.fn(),
    getBookingDraft: vi.fn(),
    updateBookingDraft: vi.fn(),
  }
})

const db = { kind: "db" } as never
const registry = createSourceAdapterRegistry()

function createTestApp(overrides: Partial<CatalogBookingRoutesOptions> = {}) {
  const ownedHandlers = createOwnedBookingHandlerRegistry()
  const app = new Hono()
  app.onError(handleApiError)
  app.route(
    "/v1/public/catalog",
    createCatalogBookingRoutes({
      resolveDb: () => db,
      resolveSourceRegistry: () => registry,
      resolveOwnedHandlers: () => ownedHandlers,
      ...overrides,
    }),
  )
  return { app, ownedHandlers }
}

const pricing: PricingBasis = {
  base_amount: 10000,
  taxes: 1900,
  fees: 250,
  surcharges: 0,
  currency: "EUR",
}

const DRAFT_CAPABILITY_ENV = {
  VOYANT_BOOKING_DRAFT_CAPABILITY_SECRET: "draft-capability-test-secret-32c",
}

/** Drafts are capability-scoped: the id alone no longer grants access. */
async function draftHeaders(draftId: string) {
  const capability = await issueBookingDraftCapability(draftId, DRAFT_CAPABILITY_ENV)
  return { "X-Voyant-Booking-Draft": capability.token }
}

describe("createCatalogBookingRoutes", () => {
  beforeEach(() => {
    vi.mocked(createBookingDraft).mockReset()
    vi.mocked(deleteBookingDraft).mockReset()
    vi.mocked(getBookingDraft).mockReset()
    vi.mocked(quoteEntitiesBatch).mockReset()
    vi.mocked(quoteEntity).mockReset()
    vi.mocked(updateBookingDraft).mockReset()
  })

  it("exposes both admin and public routes through the API module wrapper", () => {
    const module = createCatalogBookingApiModule({
      resolveDb: () => db,
      resolveSourceRegistry: () => registry,
    })

    expect(module.module.name).toBe("catalog")
    expect(module.adminRoutes).toBeTruthy()
    expect(module.publicRoutes).toBeTruthy()
  })

  it("uses shared JSON validation errors for invalid bodies", async () => {
    const { app } = createTestApp()

    const response = await app.request("/v1/public/catalog/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: "Malformed JSON in request body",
      code: "invalid_request",
    })
  })

  it("quotes through injected provenance, registries, and adapter context", async () => {
    vi.mocked(quoteEntity).mockResolvedValue({
      quoteId: "quote_1",
      quotedAt: new Date("2026-05-05T10:00:00.000Z"),
      expiresAt: new Date("2026-05-05T10:10:00.000Z"),
      available: true,
      pricing,
      upstreamPayload: { ok: true },
    })
    const resolveEntityProvenance = vi.fn(async () => ({
      sourceKind: "demo",
      sourceConnectionId: "conn_demo",
      sourceRef: "upstream_1",
    }))
    const resolveAdapterContext = vi.fn(({ sourceConnectionId, correlationId }) => ({
      connection_id: sourceConnectionId ?? "fallback",
      correlation_id: correlationId,
      credentials: { token: "secret" },
    }))
    const { app, ownedHandlers } = createTestApp({
      resolveCorrelationId: () => "req_1",
      resolveEntityProvenance,
      resolveAdapterContext,
    })

    const response = await app.request("/v1/public/catalog/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entityModule: "products",
        entityId: "prod_1",
        draft: {
          configure: {
            departureSlotId: "slot_1",
            pax: { adult: 2 },
            roomTypeId: "HOTEL:DZL1",
            ratePlanId: "HOTEL:DZL1:BB",
            board: "BB",
          },
        },
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      quoteId: "quote_1",
      quotedAt: "2026-05-05T10:00:00.000Z",
      pricing: {
        currency: "EUR",
        subtotal: 10250,
        taxTotal: 1900,
        total: 12150,
      },
    })
    expect(resolveEntityProvenance).toHaveBeenCalledWith(
      expect.objectContaining({ db, entityModule: "products", entityId: "prod_1" }),
    )
    expect(quoteEntity).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ registry, ownedHandlers }),
      expect.objectContaining({
        entityModule: "products",
        entityId: "prod_1",
        sourceKind: "demo",
        sourceConnectionId: "conn_demo",
        sourceRef: "upstream_1",
        scope: {
          locale: "en-GB",
          audience: "customer",
          market: "default",
          currency: undefined,
        },
        parameters: expect.objectContaining({
          draft: expect.any(Object),
          departureSlotId: "slot_1",
          departure_id: "slot_1",
          slotId: "slot_1",
          paxCount: 2,
          roomTypeId: "HOTEL:DZL1",
          ratePlanId: "HOTEL:DZL1:BB",
          board: "BB",
        }),
        adapterContext: {
          connection_id: "conn_demo",
          correlation_id: "req_1",
          credentials: { token: "secret" },
        },
      }),
    )
  })

  it("batch quotes bounded selections with shared criteria", async () => {
    vi.mocked(quoteEntitiesBatch).mockResolvedValue([
      {
        selectionId: "0",
        result: {
          quoteId: "quote_room_1_bar",
          quotedAt: new Date("2026-05-05T10:00:00.000Z"),
          expiresAt: new Date("2026-05-05T10:10:00.000Z"),
          available: true,
          pricing,
        },
      },
      {
        selectionId: "1",
        result: {
          quoteId: "quote_room_1_nr",
          quotedAt: new Date("2026-05-05T10:00:00.000Z"),
          expiresAt: new Date("2026-05-05T10:10:00.000Z"),
          available: false,
          invalidReason: "rates_missing",
        },
      },
    ])
    const resolveEntityProvenance = vi.fn(async () => ({ sourceKind: "owned" }))
    const transformQuoteResult = vi.fn(async ({ result }) => result)
    const { app, ownedHandlers } = createTestApp({
      resolveCorrelationId: () => "req_batch",
      resolveEntityProvenance,
      transformQuoteResult,
      transformBatchQuoteResults: async ({ results }) => results,
    })

    const response = await app.request("/v1/public/catalog/quotes/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        criteria: {
          checkIn: "2026-09-01",
          checkOut: "2026-09-03",
          occupancy: { adult: 2 },
          roomCount: 2,
        },
        selections: [
          { entityModule: "accommodations", entityId: "room_1", ratePlanId: "rate_bar" },
          { entityModule: "accommodations", entityId: "room_1", ratePlanId: "rate_nr" },
        ],
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      results: [
        {
          selection: { entityModule: "accommodations", entityId: "room_1", ratePlanId: "rate_bar" },
          quoteId: "quote_room_1_bar",
          available: true,
          pricing: { total: 12150 },
        },
        {
          selection: { entityModule: "accommodations", entityId: "room_1", ratePlanId: "rate_nr" },
          quoteId: "quote_room_1_nr",
          available: false,
          invalidReason: "rates_missing",
        },
      ],
    })
    expect(resolveEntityProvenance).toHaveBeenCalledTimes(2)
    expect(transformQuoteResult).toHaveBeenCalledTimes(2)
    expect(quoteEntitiesBatch).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ registry, ownedHandlers }),
      [
        expect.objectContaining({
          selectionId: "0",
          entityModule: "accommodations",
          entityId: "room_1",
          sourceKind: "owned",
          parameters: expect.objectContaining({
            draft: expect.objectContaining({
              configure: expect.objectContaining({
                dateRange: { checkIn: "2026-09-01", checkOut: "2026-09-03" },
                pax: { adult: 2 },
              }),
              accommodation: {
                rooms: [
                  { optionUnitId: "room_1", quantity: 1, adults: 2, ratePlanId: "rate_bar" },
                  { optionUnitId: "room_1", quantity: 1, adults: 2, ratePlanId: "rate_bar" },
                ],
              },
            }),
            ratePlanId: "rate_bar",
          }),
          adapterContext: { connection_id: "owned", correlation_id: "req_batch" },
        }),
        expect.objectContaining({
          selectionId: "1",
          parameters: expect.objectContaining({
            ratePlanId: "rate_nr",
          }),
        }),
      ],
    )
  })

  it("creates drafts with actor identity and explicit source provenance", async () => {
    vi.mocked(getBookingDraft).mockResolvedValue(null)
    vi.mocked(createBookingDraft).mockResolvedValue({
      id: "draft_1",
      entity_module: "products",
      entity_id: "prod_1",
      source_kind: "owned",
      source_connection_id: null,
      source_ref: null,
      draft_payload: { entity: { id: "prod_1" } },
      current_step: "configure",
      current_quote_id: null,
      hold_expires_at: null,
      consumed_booking_id: null,
      consumed_at: null,
      created_by: "user_1",
      expires_at: new Date("2026-05-06T10:00:00.000Z"),
      created_at: new Date("2026-05-05T10:00:00.000Z"),
      updated_at: new Date("2026-05-05T10:00:00.000Z"),
    } as never)
    const { app } = createTestApp({ resolveActorId: () => "user_1" })

    const response = await app.request(
      "/v1/public/catalog/drafts/draft_1",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityModule: "products",
          entityId: "prod_1",
          sourceKind: "owned",
          draftPayload: { entity: { id: "prod_1" } },
          currentStep: "configure",
        }),
      },
      DRAFT_CAPABILITY_ENV,
    )

    expect(response.status).toBe(201)
    expect(createBookingDraft).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        id: "draft_1",
        entityModule: "products",
        entityId: "prod_1",
        sourceKind: "owned",
        createdBy: "user_1",
      }),
    )
  })

  it("serializes draft GET timestamps as ISO strings (contract §17)", async () => {
    vi.mocked(getBookingDraft).mockResolvedValue({
      id: "draft_1",
      entity_module: "products",
      entity_id: "prod_1",
      source_kind: "owned",
      source_connection_id: null,
      source_ref: null,
      draft_payload: { entity: { id: "prod_1" } },
      current_step: "configure",
      current_quote_id: null,
      hold_expires_at: null,
      consumed_booking_id: null,
      consumed_at: null,
      created_by: "user_1",
      expires_at: new Date("2026-05-06T10:00:00.000Z"),
      created_at: new Date("2026-05-05T10:00:00.000Z"),
      updated_at: new Date("2026-05-05T10:00:00.000Z"),
    } as never)
    const { app } = createTestApp()

    const response = await app.request(
      "/v1/public/catalog/drafts/draft_1",
      { headers: await draftHeaders("draft_1") },
      DRAFT_CAPABILITY_ENV,
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      id: "draft_1",
      entity_module: "products",
      entity_id: "prod_1",
      source_connection_id: null,
      created_at: "2026-05-05T10:00:00.000Z",
      updated_at: "2026-05-05T10:00:00.000Z",
      expires_at: "2026-05-06T10:00:00.000Z",
    })
    // §17: Date-origin columns are strings over the wire, never Date.
    expect(typeof body.created_at).toBe("string")
    expect(typeof body.expires_at).toBe("string")
  })

  it("returns 404 for a missing draft", async () => {
    vi.mocked(getBookingDraft).mockResolvedValue(null)
    const { app } = createTestApp()

    const response = await app.request(
      "/v1/public/catalog/drafts/missing",
      { headers: await draftHeaders("missing") },
      DRAFT_CAPABILITY_ENV,
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: "draft not found" })
  })

  it("places and releases holds through the owned handler registry", async () => {
    const placeHold = vi.fn(async () => ({
      holdToken: "hold_1",
      expiresAt: new Date("2026-05-05T10:30:00.000Z"),
    }))
    const releaseHold = vi.fn(async () => undefined)
    const handler: OwnedBookingHandler = {
      entityModule: "products",
      computeQuote: async () => ({ available: true }),
      placeHold,
      releaseHold,
    }
    const { app, ownedHandlers } = createTestApp({
      resolveCorrelationId: () => "req_3",
      resolveHoldTtlMs: async () => 15 * 60 * 1000,
    })
    ownedHandlers.register(handler)

    const placeResponse = await app.request("/v1/public/catalog/holds/place", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entityModule: "products", entityId: "prod_1", draftId: "draft_1" }),
    })
    expect(placeResponse.status).toBe(200)
    await expect(placeResponse.json()).resolves.toEqual({
      holdToken: "hold_1",
      expiresAt: "2026-05-05T10:30:00.000Z",
    })
    expect(placeHold).toHaveBeenCalledWith(
      { db, adapterContext: { connection_id: "engine", correlation_id: "req_3" } },
      expect.objectContaining({ ttlMs: 15 * 60 * 1000 }),
    )

    const releaseResponse = await app.request("/v1/public/catalog/holds/release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entityModule: "products", holdToken: "hold_1" }),
    })
    expect(releaseResponse.status).toBe(204)
    expect(releaseHold).toHaveBeenCalledWith(
      { db, adapterContext: { connection_id: "engine", correlation_id: "req_3" } },
      "hold_1",
    )
  })
})
