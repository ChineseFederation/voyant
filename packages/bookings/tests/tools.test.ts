import {
  createToolRegistry,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

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

function bookingDetail(id: string, status: "draft" | "cancelled") {
  return {
    id,
    bookingNumber: "B-1001",
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
    holdExpiresAt: null,
    confirmedAt: null,
    expiredAt: null,
    cancelledAt: status === "cancelled" ? "2026-07-15T11:00:00.000Z" : null,
    completedAt: null,
    awaitingPaymentAt: null,
    paidAt: null,
    redeemedAt: null,
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z",
    items: [],
    travelers: [],
  }
}

describe("bookings tools", () => {
  it("registers read tools and the approval-gated cancellation", () => {
    const registry = createToolRegistry()
    registry.registerAll(bookingsTools)
    const list = registry.list()
    expect(list.map((t) => t.name).sort()).toEqual([
      "cancel_booking",
      "confirm_booking",
      "get_booking",
      "list_bookings",
    ])
    for (const t of list.filter(
      (tool) => tool.name !== "cancel_booking" && tool.name !== "confirm_booking",
    )) {
      expect(t.tier).toBe("read")
      expect(t.requiredScopes).toEqual(["bookings:read"])
    }
    expect(list.find((tool) => tool.name === "cancel_booking")).toMatchObject({
      tier: "destructive",
      requiredScopes: ["bookings:write"],
      riskPolicy: { destructive: true, reversible: false, confirmationRequired: true },
    })
    expect(list.find((tool) => tool.name === "confirm_booking")).toMatchObject({
      tier: "destructive",
      requiredScopes: ["bookings:write"],
      riskPolicy: { destructive: true, reversible: false, confirmationRequired: true },
    })
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
          requiredFields: ["confirmed", "idempotencyKey"],
          optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
        },
      },
    })
    const result = await registry.dispatch(
      "cancel_booking",
      { id: "bk_1", note: "operator request", idempotencyKey: "cancel-bk-1" },
      ctx(
        {
          async cancelBooking(_input, admitted) {
            expect(admitted.invocation.idempotencyKey).toBe("cancel-bk-1")
            return {
              status: "cancelled",
              booking: bookingDetail("bk_1", "cancelled"),
              replayed: false,
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
              requiredFields: ["confirmed", "idempotencyKey"],
              optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
            },
          },
          invocation: { confirmed: true, idempotencyKey: "cancel-bk-1" },
        },
      ),
    )
    expect(result).toMatchObject({ status: "cancelled", booking: { id: "bk_1" } })
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
          return bookingDetail(id, "draft")
        },
      }),
    )
    expect(result).toMatchObject({ id: "bk_1" })
  })

  it("throws MISSING_SERVICE when unwired", async () => {
    const registry = createToolRegistry()
    registry.registerAll(bookingsTools)
    await expect(registry.dispatch("list_bookings", {}, ctx(undefined))).rejects.toMatchObject({
      code: "MISSING_SERVICE",
    })
  })
})
