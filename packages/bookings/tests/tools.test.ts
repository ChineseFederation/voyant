import {
  createToolRegistry,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import { requiredBookingStatusReplayDetail } from "../src/mcp-booking-status-replay.js"
import {
  type BookingsToolServices,
  bookingsTools,
  CANCEL_BOOKING_HANDLER_POLICY,
} from "../src/tools.js"

function ctx(
  services?: Partial<BookingsToolServices>,
  handlerActionPolicy?: ToolHandlerActionPolicyContext,
): ToolContext & {
  bookings?: BookingsToolServices
} {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
    bookings: services as BookingsToolServices | undefined,
    ...(handlerActionPolicy ? { handlerActionPolicy } : {}),
  }
}

function bookingDetail(id: string, status: "confirmed" | "cancelled") {
  return {
    id,
    bookingNumber: "B-1001",
    revision: 1,
    status,
    personId: null,
    organizationId: null,
    sourceType: "manual" as const,
    externalBookingRef: null,
    communicationLanguage: null,
    contactFirstName: null,
    contactLastName: null,
    contactPartyType: null,
    contactTaxId: null,
    contactEmail: null,
    contactPhone: null,
    contactPreferredLanguage: null,
    contactCountry: null,
    contactRegion: null,
    contactCity: null,
    contactAddressLine1: null,
    contactAddressLine2: null,
    contactPostalCode: null,
    sellCurrency: "EUR",
    baseCurrency: null,
    fxRateSetId: null,
    sellAmountCents: null,
    baseSellAmountCents: null,
    costAmountCents: null,
    baseCostAmountCents: null,
    marginPercent: null,
    startDate: null,
    endDate: null,
    pax: null,
    internalNotes: null,
    notificationsSuppressed: false,
    customerPaymentPolicy: null,
    priceOverride: null,
    customFields: {},
    acceptedAt: "2026-07-15T10:00:00.000Z",
    confirmedAt: "2026-07-15T10:00:00.000Z",
    cancelledAt: status === "cancelled" ? "2026-07-15T11:00:00.000Z" : null,
    completedAt: null,
    redeemedAt: null,
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z",
    items: [],
    travelers: [],
  }
}

describe("bookings tools", () => {
  it("returns detail on cancellation replay", async () => {
    await expect(
      requiredBookingStatusReplayDetail({
        action: "cancel",
        input: { id: "bk_1" },
        loadBookingDetail: async (id) => bookingDetail(id, "cancelled"),
      }),
    ).resolves.toMatchObject({ id: "bk_1", status: "cancelled" })
  })

  it("rejects cancellation replay when status drifted", async () => {
    await expect(
      requiredBookingStatusReplayDetail({
        action: "cancel",
        input: { id: "bk_1" },
        loadBookingDetail: async (id) => bookingDetail(id, "confirmed"),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      meta: {
        bookingId: "bk_1",
        action: "cancel",
        reason: "replay_state_drift",
        expectedStatus: "cancelled",
        currentStatus: "confirmed",
      },
    })
  })

  it("registers read tools and the approval-gated cancellation", () => {
    const registry = createToolRegistry()
    registry.registerAll(bookingsTools)
    const list = registry.list()
    expect(list.map((t) => t.name).sort()).toEqual([
      "accept_booking_amendment",
      "apply_booking_amendment",
      "cancel_booking",
      "get_booking",
      "list_bookings",
      "preview_traveler_correction_amendment",
      "preview_traveler_roster_change_amendment",
      "reconcile_booking_amendment",
    ])
    for (const t of list.filter((tool) => ["get_booking", "list_bookings"].includes(tool.name))) {
      expect(t.tier).toBe("read")
      expect(t.requiredScopes).toEqual(["bookings:read"])
    }
    for (const name of [
      "accept_booking_amendment",
      "apply_booking_amendment",
      "preview_traveler_correction_amendment",
      "preview_traveler_roster_change_amendment",
      "reconcile_booking_amendment",
    ]) {
      expect(list.find((tool) => tool.name === name)).toMatchObject({
        tier: "write",
        requiredScopes: ["bookings:write"],
        riskPolicy: { destructive: false, reversible: false, sideEffects: ["data-write"] },
      })
    }
    expect(list.find((tool) => tool.name === "cancel_booking")).toMatchObject({
      tier: "destructive",
      requiredScopes: ["bookings:write"],
      riskPolicy: { destructive: true, reversible: false, confirmationRequired: true },
    })
    expect(bookingsTools.find((tool) => tool.name === "cancel_booking")).toMatchObject({
      resolvesIdempotencyKeyServerSide: true,
    })
    expect(
      bookingsTools
        .find((tool) => tool.name === "cancel_booking")
        ?.inputSchema.parse({
          id: "bk_1",
          approvalId: "dead-top-level-field",
        }),
    ).not.toHaveProperty("approvalId")
  })

  it("passes authentic cancellation policy admission to the injected service", async () => {
    const registry = createToolRegistry()
    const tool = bookingsTools.find((entry) => entry.name === "cancel_booking")
    if (!tool) throw new Error("cancel_booking is missing")
    registry.register(tool, {
      capabilityId: tool.capabilityId,
      owner: tool.owner,
      capabilityVersion: tool.capabilityVersion,
      name: tool.name,
      requiredScopes: tool.requiredScopes,
      deploymentRisk: "critical",
      actionPolicy: {
        ...CANCEL_BOOKING_HANDLER_POLICY.actionPolicy,
        enforcement: "handler",
        invocation: {
          requiredFields: ["confirmed"],
          optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
        },
      },
    })
    const result = await registry.dispatch(
      "cancel_booking",
      {
        id: "bk_1",
        note: "operator request",
        approvalId: "dead-top-level-field",
      },
      ctx(
        {
          async cancelBooking(_input, admitted) {
            expect(_input).not.toHaveProperty("approvalId")
            expect(admitted.invocation.idempotencyKey).toMatch(/^cancel-booking:v1:/)
            expect(_input.idempotencyKey).toBe(admitted.invocation.idempotencyKey)
            expect(admitted.invocation.approvalId).toBe("approval-reserved")
            expect(admitted.invocation.idempotencyFingerprint).toBe("sha256:reserved")
            return {
              status: "cancelled",
              bookingId: "bk_1",
              bookingNumber: "B-1001",
              replayed: false,
              committedChanges: ["booking_cancelled"],
              nextActions: [{ tool: "get_booking", input: { id: "bk_1" } }],
            }
          },
        },
        {
          capabilityId: CANCEL_BOOKING_HANDLER_POLICY.capabilityId,
          capabilityVersion: CANCEL_BOOKING_HANDLER_POLICY.capabilityVersion,
          canonicalName: CANCEL_BOOKING_HANDLER_POLICY.canonicalName,
          actionPolicy: {
            ...CANCEL_BOOKING_HANDLER_POLICY.actionPolicy,
            enforcement: "handler",
            invocation: {
              requiredFields: ["confirmed"],
              optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
            },
          },
          invocation: {
            confirmed: true,
            approvalId: "approval-reserved",
            idempotencyFingerprint: "sha256:reserved",
          },
        },
      ),
    )
    expect(result).toEqual({
      status: "cancelled",
      bookingId: "bk_1",
      bookingNumber: "B-1001",
      replayed: false,
      committedChanges: ["booking_cancelled"],
      nextActions: [{ tool: "get_booking", input: { id: "bk_1" } }],
    })
    expect(JSON.stringify(result).length).toBeLessThan(500)
  })

  it("dispatches through the injected service", async () => {
    const registry = createToolRegistry()
    registry.registerAll(bookingsTools)
    const result = await registry.dispatch(
      "get_booking",
      { id: "bk_1" },
      ctx({
        async listBookings() {
          return { data: [] }
        },
        async getBookingById(id) {
          return {
            ...bookingDetail(id, "confirmed"),
            items: [
              {
                id: "item_1",
                bookingId: id,
                title: "Coastal day cruise",
                description: null,
                itemType: "product",
                status: "confirmed",
                serviceDate: "2026-08-15",
                startsAt: null,
                endsAt: null,
                quantity: 2,
                sellCurrency: "EUR",
                unitSellAmountCents: 40_000,
                totalSellAmountCents: 80_000,
                productId: null,
                optionId: null,
                optionUnitId: null,
                availabilitySlotId: null,
                productNameSnapshot: "Coastal day cruise",
                optionNameSnapshot: null,
                unitNameSnapshot: null,
                departureLabelSnapshot: null,
                metadata: null,
                createdAt: "2026-07-15T10:00:00.000Z",
                updatedAt: "2026-07-15T10:00:00.000Z",
              },
            ],
          }
        },
      }),
    )
    expect(result).toMatchObject({
      id: "bk_1",
      updatedAt: "2026-07-15T10:00:00.000Z",
      items: [
        {
          title: "Coastal day cruise",
          quantity: 2,
          totalSellAmountCents: 80_000,
        },
      ],
    })
  })

  it("dispatches an idempotent traveler correction preview through the shared Amendment service", async () => {
    const registry = createToolRegistry()
    registry.registerAll(bookingsTools)
    const result = await registry.dispatch(
      "preview_traveler_correction_amendment",
      {
        bookingId: "bk_1",
        travelerId: "btr_1",
        expectedBookingRevision: 1,
        reason: "Correct the travel document spelling",
        patch: { firstName: "Ada" },
        idempotencyKey: "amendment-preview-bk-1",
      },
      ctx({
        async previewTravelerCorrectionAmendment(input) {
          expect(input.idempotencyKey).toBe("amendment-preview-bk-1")
          return {
            status: "no_op",
            bookingId: input.bookingId,
            travelerId: input.travelerId,
            bookingRevision: input.expectedBookingRevision,
          }
        },
      }),
    )
    expect(result).toEqual({
      status: "no_op",
      bookingId: "bk_1",
      travelerId: "btr_1",
      bookingRevision: 1,
    })
  })

  it("dispatches priced roster previews and supplier reconciliation through the shared Amendment service", async () => {
    const registry = createToolRegistry()
    registry.registerAll(bookingsTools)
    const preview = await registry.dispatch(
      "preview_traveler_roster_change_amendment",
      {
        bookingId: "bk_1",
        expectedBookingRevision: 3,
        reason: "Add another traveler",
        change: {
          type: "traveler_add",
          bookingItemIds: ["bitm_1"],
          traveler: { firstName: "Ada", lastName: "Lovelace" },
        },
        idempotencyKey: "roster-preview-bk-1",
      },
      ctx({
        async previewTravelerRosterChangeAmendment(input) {
          expect(input).toMatchObject({
            bookingId: "bk_1",
            expectedBookingRevision: 3,
            idempotencyKey: "roster-preview-bk-1",
            change: { type: "traveler_add", bookingItemIds: ["bitm_1"] },
          })
          return { status: "availability_changed", bookingItemId: "bitm_1" }
        },
      }),
    )
    expect(preview).toEqual({ status: "availability_changed", bookingItemId: "bitm_1" })

    const reconciled = await registry.dispatch(
      "reconcile_booking_amendment",
      { bookingId: "bk_1", amendmentId: "bamd_1", idempotencyKey: "test-key-1" },
      ctx({
        async reconcileBookingAmendment(input) {
          expect(input).toEqual({
            bookingId: "bk_1",
            amendmentId: "bamd_1",
            idempotencyKey: "test-key-1",
          })
          return { status: "not_found" }
        },
      }),
    )
    expect(reconciled).toEqual({ status: "not_found" })
  })

  it("resolves a booking by its human-readable booking number", async () => {
    const registry = createToolRegistry()
    registry.registerAll(bookingsTools)
    let resolvedNumber: string | undefined
    const result = await registry.dispatch(
      "get_booking",
      { bookingNumber: "B-1001" },
      ctx({
        async getBookingById() {
          throw new Error("getBookingById must not be called when a bookingNumber is supplied")
        },
        async getBookingByNumber(bookingNumber) {
          resolvedNumber = bookingNumber
          return bookingDetail("bk_1", "confirmed")
        },
      }),
    )
    expect(resolvedNumber).toBe("B-1001")
    expect(result).toMatchObject({ id: "bk_1", bookingNumber: "B-1001", status: "confirmed" })
  })

  it("rejects get_booking when neither id nor bookingNumber is supplied", async () => {
    const registry = createToolRegistry()
    registry.registerAll(bookingsTools)
    await expect(registry.dispatch("get_booking", {}, ctx({}))).rejects.toMatchObject({
      code: "INVALID_INPUT",
    })
  })

  it("throws MISSING_SERVICE when unwired", async () => {
    const registry = createToolRegistry()
    registry.registerAll(bookingsTools)
    await expect(registry.dispatch("list_bookings", {}, ctx(undefined))).rejects.toMatchObject({
      code: "MISSING_SERVICE",
    })
  })
})
