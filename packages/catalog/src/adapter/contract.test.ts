import { describe, expect, it } from "vitest"

import type {
  AdapterCapabilities,
  AvailabilityProjection,
  CancelRequest,
  CancelResult,
  GetContentRequest,
  GetContentResult,
  GetReservationRequest,
  GetReservationResult,
  ListReservationsPage,
  ProviderPromotion,
  ReservationStatus,
  ReserveRequest,
  SourceAdapter,
} from "./contract.js"
import {
  availabilityProjectionSchema,
  cancelRequestSchema,
  getReservationRequestSchema,
  getReservationResultSchema,
  listReservationsPageSchema,
  providerPromotionSchema,
  reservationStatusSchema,
  reserveRequestSchema,
} from "./schemas.js"

describe("AdapterCapabilities — content fetch declaration", () => {
  it("accepts adapters that omit supportsContentFetch (backward compatible)", () => {
    const cap: AdapterCapabilities = {
      verticals: ["products"],
      supportsLiveResolution: true,
      supportsDriftDetection: false,
      supportsBookingForwarding: false,
      postBookOperations: [],
    }
    expect(cap.supportsContentFetch).toBeUndefined()
    expect(cap.supportedContentLocales).toBeUndefined()
    expect(cap.ownsContentCache).toBeUndefined()
    expect(cap.ownsAvailabilityCache).toBeUndefined()
  })

  it("records content and availability cache ownership when declared", () => {
    const cap: AdapterCapabilities = {
      verticals: ["products"],
      supportsLiveResolution: true,
      supportsDriftDetection: false,
      supportsBookingForwarding: true,
      supportsReservationRetrieval: true,
      postBookOperations: ["cancel"],
      supportsContentFetch: true,
      supportedContentLocales: ["en-GB", "ro-RO", "de-DE"],
      ownsContentCache: true,
      ownsAvailabilityCache: true,
    }
    expect(cap.supportsContentFetch).toBe(true)
    expect(cap.supportedContentLocales).toEqual(["en-GB", "ro-RO", "de-DE"])
    expect(cap.ownsContentCache).toBe(true)
    expect(cap.ownsAvailabilityCache).toBe(true)
    expect(cap.supportsReservationRetrieval).toBe(true)
  })
})

describe("AdapterCapabilities — provider capability declarations", () => {
  it("can state supported and explicitly unsupported provider features", () => {
    const cap: AdapterCapabilities = {
      verticals: ["cruises"],
      supportsLiveResolution: true,
      supportsDriftDetection: true,
      supportsBookingForwarding: true,
      postBookOperations: ["cancel", "status"],
      providerCapabilities: [
        {
          capability: "category_availability_counts",
          support: "supported",
          applies_to: ["sailings", "cabin_categories"],
        },
        {
          capability: "physical_inventory_units",
          support: "unsupported",
          applies_to: ["cabins"],
          reason: "current feed exposes category inventory counts but not cabin numbers",
        },
        {
          capability: "offer_applicability_evaluation",
          support: "unknown",
          reason: "customer/session eligibility is provider-side",
        },
      ],
    }

    expect(cap.providerCapabilities?.map((item) => [item.capability, item.support])).toEqual([
      ["category_availability_counts", "supported"],
      ["physical_inventory_units", "unsupported"],
      ["offer_applicability_evaluation", "unknown"],
    ])
  })
})

describe("ProviderPromotion / AvailabilityProjection contract shape", () => {
  it("represents non-evaluable loyalty offers with normalized display media", () => {
    const promotion: ProviderPromotion = {
      source_offer_id: "UNI-PAST-GUEST",
      provider: "uniworld",
      display: {
        display_name: "Past Guest Savings",
        subtitle: "Exclusive loyalty pricing",
        media: [
          {
            kind: "primary",
            url: "https://example.com/offers/past-guest.jpg",
            alt_text: "River ship suite",
          },
        ],
        featured: true,
      },
      applicability: {
        evaluation: "not_evaluable_locally",
        price_effect: "price_affecting",
        constraints: [
          {
            kind: "loyalty",
            resolution: "customer_context_required",
            values: ["past_guest"],
            requires_customer_context: true,
          },
          {
            kind: "fare_code",
            resolution: "not_evaluable_locally",
            values: ["PG"],
          },
        ],
      },
      stacking: "unknown",
      raw_payload: { offerCode: "UNI-PAST-GUEST" },
    }

    expect(providerPromotionSchema.parse(promotion)).toEqual(promotion)
    expect(promotion.applicability.evaluation).toBe("not_evaluable_locally")
    expect(promotion.display?.media?.[0]?.kind).toBe("primary")
  })

  it("distinguishes category-count availability from exact physical units", () => {
    const projection: AvailabilityProjection = {
      row_kind: "category",
      row_id: "suite-deluxe",
      available_units: 3,
      precision: "category_count",
      status: "low",
      low_availability_threshold: 4,
      badge: { kind: "low_availability", label: "Only 3 left" },
      sort_priority: 20,
    }

    expect(availabilityProjectionSchema.parse(projection)).toEqual(projection)
    expect(projection.precision).toBe("category_count")
    expect(projection.status).toBe("low")
  })
})

describe("GetContentRequest / GetContentResult shape", () => {
  it("requires entity_module, entity_id, and locale", () => {
    const req: GetContentRequest = {
      entity_module: "products",
      entity_id: "prod_abc",
      locale: "ro-RO",
    }
    expect(req.locale).toBe("ro-RO")
    expect(req.market).toBeUndefined()
    expect(req.currency).toBeUndefined()
  })

  it("carries optional market + currency scope axes", () => {
    const req: GetContentRequest = {
      entity_module: "cruises",
      entity_id: "crus_xyz",
      locale: "de-DE",
      market: "DE",
      currency: "EUR",
    }
    expect(req.market).toBe("DE")
    expect(req.currency).toBe("EUR")
  })

  it("returned_locale may differ from request.locale (upstream fallback)", () => {
    const result: GetContentResult = {
      entity_module: "products",
      entity_id: "prod_abc",
      source_ref: "TUI-123",
      // Asked for ro-RO, upstream had no Romanian → served en-GB.
      returned_locale: "en-GB",
      content: { product: { name: "Sample" } },
      content_schema_version: "products/v1",
    }
    expect(result.returned_locale).toBe("en-GB")
    expect(result.machine_translated).toBeUndefined()
  })

  it("flags machine_translated when upstream marks the payload", () => {
    const result: GetContentResult = {
      entity_module: "products",
      entity_id: "prod_abc",
      source_ref: "TUI-123",
      returned_locale: "ro-RO",
      machine_translated: true,
      content: { product: { name: "Mostră" } },
      content_schema_version: "products/v1",
    }
    expect(result.machine_translated).toBe(true)
  })
})

describe("SourceAdapter — getContent capability gating", () => {
  it("typechecks without getContent (capability not declared)", () => {
    const adapter: SourceAdapter = {
      kind: "thin",
      capabilities: {
        verticals: ["products"],
        supportsLiveResolution: false,
        supportsDriftDetection: false,
        supportsBookingForwarding: false,
        postBookOperations: [],
        supportsContentFetch: false,
      },
      async connect() {},
      async pause() {},
      async disconnect() {},
      async getState() {
        return "active"
      },
      async discover() {
        return { projections: [], next_cursor: undefined }
      },
    }
    expect(adapter.getContent).toBeUndefined()
    expect(adapter.capabilities.supportsContentFetch).toBe(false)
  })

  it("typechecks with getContent implemented", async () => {
    const adapter: SourceAdapter = {
      kind: "rich",
      capabilities: {
        verticals: ["products"],
        supportsLiveResolution: false,
        supportsDriftDetection: false,
        supportsBookingForwarding: false,
        postBookOperations: [],
        supportsContentFetch: true,
        supportedContentLocales: ["en-GB"],
      },
      async connect() {},
      async pause() {},
      async disconnect() {},
      async getState() {
        return "active"
      },
      async discover() {
        return { projections: [], next_cursor: undefined }
      },
      async getContent(_ctx, request) {
        return {
          entity_module: request.entity_module,
          entity_id: request.entity_id,
          source_ref: "ref-1",
          returned_locale: "en-GB",
          content: { product: { name: "Test" } },
          content_schema_version: "products/v1",
        }
      },
    }
    expect(adapter.getContent).toBeDefined()
    const result = await adapter.getContent!(
      { connection_id: "conn_1" },
      { entity_module: "products", entity_id: "prod_abc", locale: "ro-RO" },
    )
    expect(result.returned_locale).toBe("en-GB")
    expect(result.content_schema_version).toBe("products/v1")
  })
})

describe("SourceAdapter — reservation retrieval capability gating", () => {
  it("typechecks without reservation read methods when capability is false", () => {
    const adapter: SourceAdapter = {
      kind: "booking-write-only",
      capabilities: {
        verticals: ["products"],
        supportsLiveResolution: false,
        supportsDriftDetection: false,
        supportsBookingForwarding: true,
        supportsReservationRetrieval: false,
        postBookOperations: ["cancel"],
      },
      async reserve() {
        return { upstream_ref: "booking_abc", status: "held" }
      },
      async cancel() {
        return { status: "cancelled" }
      },
    }

    expect(adapter.getReservation).toBeUndefined()
    expect(adapter.listReservations).toBeUndefined()
    expect(adapter.capabilities.supportsReservationRetrieval).toBe(false)
  })

  it("typechecks with getReservation and listReservations implemented", async () => {
    const reservation: GetReservationResult = {
      upstream_ref: "booking_abc",
      status: "confirmed",
      source_updated_at: new Date("2026-01-01T00:00:00Z"),
      upstream_payload: { travelers: 2 },
    }
    const page: ListReservationsPage = {
      reservations: [reservation],
      next_cursor: "cursor_2",
    }
    const adapter: SourceAdapter = {
      kind: "booking-readable",
      capabilities: {
        verticals: ["products"],
        supportsLiveResolution: false,
        supportsDriftDetection: true,
        supportsBookingForwarding: true,
        supportsReservationRetrieval: true,
        postBookOperations: ["cancel", "status"],
      },
      async getReservation(_ctx, request) {
        return request.upstream_ref === reservation.upstream_ref ? reservation : null
      },
      async listReservations() {
        return page
      },
    }

    const request: GetReservationRequest = {
      upstream_ref: "missing",
      scope: { locale: "en-GB", audience: "operator", market: "GB", currency: "GBP" },
    }
    expect(getReservationRequestSchema.parse(request)).toEqual(request)
    expect(
      getReservationRequestSchema.parse({ idempotency_key: "bses_1:commit_1:reserve" }),
    ).toEqual({ idempotency_key: "bses_1:commit_1:reserve" })
    await expect(adapter.getReservation!({ connection_id: "conn_1" }, request)).resolves.toBeNull()
    await expect(
      adapter.getReservation!({ connection_id: "conn_1" }, { upstream_ref: "booking_abc" }),
    ).resolves.toEqual(reservation)
    await expect(
      adapter.listReservations!({ connection_id: "conn_1" }, { status: ["confirmed"] }),
    ).resolves.toEqual(page)
    expect(getReservationResultSchema.parse(reservation)).toEqual(reservation)
    expect(listReservationsPageSchema.parse(page)).toEqual(page)
  })

  it("accepts every reservation status and rejects unknown statuses", () => {
    const statuses: ReservationStatus[] = [
      "held",
      "confirmed",
      "ticketed",
      "failed",
      "cancelled",
      "pending",
      "refused",
      "cancelling",
    ]

    expect(statuses.map((status) => reservationStatusSchema.parse(status))).toEqual(statuses)
    expect(reservationStatusSchema.safeParse("expired").success).toBe(false)
  })
})

describe("ReserveRequest / CancelRequest scoped write shape", () => {
  it("round-trips reserve requests with request scope and idempotency key", () => {
    const request: ReserveRequest = {
      entity_module: "products",
      entity_id: "prod_abc",
      parameters: { departureId: "dep_1" },
      party: { travelers: 2 },
      scope: {
        locale: "en-GB",
        audience: "customer",
        market: "GB",
        currency: "GBP",
      },
      idempotency_key: "reserve_abc",
    }

    expect(reserveRequestSchema.parse(request)).toEqual(request)
  })

  it("round-trips cancel requests with request scope and idempotency key", () => {
    const request: CancelRequest = {
      upstream_ref: "booking_abc",
      reason: "customer_request",
      scope: {
        locale: "en-GB",
        audience: "customer",
        market: "GB",
        currency: "GBP",
      },
      idempotency_key: "cancel_abc",
    }

    expect(cancelRequestSchema.parse(request)).toEqual(request)
  })
})

describe("SourceAdapter — cancellation capability declaration", () => {
  it("typechecks sync cancellation adapters that return terminal statuses", async () => {
    const adapter: SourceAdapter = {
      kind: "sync-cancel",
      capabilities: {
        verticals: ["products"],
        supportsLiveResolution: false,
        supportsDriftDetection: false,
        supportsBookingForwarding: true,
        supportsSyncCancellation: true,
        postBookOperations: ["cancel"],
      },
      async cancel(): Promise<CancelResult> {
        return { status: "cancelled", refund_amount: 100, refund_currency: "GBP" }
      },
    }

    await expect(
      adapter.cancel!({ connection_id: "conn_1" }, { upstream_ref: "up_1" }),
    ).resolves.toEqual({
      status: "cancelled",
      refund_amount: 100,
      refund_currency: "GBP",
    })
  })

  it("typechecks async cancellation adapters that return pending", async () => {
    const adapter: SourceAdapter = {
      kind: "async-cancel",
      capabilities: {
        verticals: ["products"],
        supportsLiveResolution: false,
        supportsDriftDetection: true,
        supportsBookingForwarding: true,
        supportsSyncCancellation: false,
        postBookOperations: ["cancel"],
      },
      async cancel(): Promise<CancelResult> {
        return { status: "pending", pending_channel: "partner portal" }
      },
    }

    await expect(
      adapter.cancel!({ connection_id: "conn_1" }, { upstream_ref: "up_1" }),
    ).resolves.toEqual({
      status: "pending",
      pending_channel: "partner portal",
    })
  })
})
