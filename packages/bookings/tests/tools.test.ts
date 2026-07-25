import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import { type BookingsToolServices, bookingsTools } from "../src/tools.js"

function ctx(services?: Partial<BookingsToolServices>): ToolContext & {
  bookings?: BookingsToolServices
} {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
    bookings: services as BookingsToolServices | undefined,
  }
}

describe("bookings tools", () => {
  it("registers read tools and the approval-gated cancellation", () => {
    const registry = createToolRegistry()
    registry.registerAll(bookingsTools)
    const list = registry.list()
    expect(list.map((t) => t.name).sort()).toEqual([
      "cancel_booking",
      "get_booking",
      "list_bookings",
    ])
    for (const t of list.filter((tool) => tool.name !== "cancel_booking")) {
      expect(t.tier).toBe("read")
      expect(t.requiredScopes).toEqual(["bookings:read"])
    }
    expect(list.find((tool) => tool.name === "cancel_booking")).toMatchObject({
      tier: "destructive",
      requiredScopes: ["bookings:write"],
      riskPolicy: { destructive: true, reversible: false, confirmationRequired: true },
    })
  })

  it("returns a pending approval without executing cancellation", async () => {
    const registry = createToolRegistry()
    registry.registerAll(bookingsTools)
    const result = await registry.dispatch(
      "cancel_booking",
      { id: "bk_1", note: "operator request", idempotencyKey: "cancel-bk-1" },
      ctx({
        async cancelBooking() {
          return {
            status: "approval_required",
            requestedAction: {
              id: "act_1",
              status: "awaiting_approval",
              actionName: "booking.status.cancel",
              targetType: "booking",
              targetId: "bk_1",
            },
            approval: {
              id: "apr_1",
              status: "pending",
              requestedActionId: "act_1",
              policyName: "bookings-status-approval-v1",
              policyVersion: "v1",
              riskSnapshot: "critical",
              reasonCode: "cancel_requested_by_agent",
              expiresAt: null,
              createdAt: "2026-07-15T10:00:00.000Z",
            },
            replayed: false,
          }
        },
      }),
    )
    expect(result).toMatchObject({ status: "approval_required", approval: { id: "apr_1" } })
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
            id,
            bookingNumber: "B-1001",
            status: "draft",
            personId: null,
            organizationId: null,
            sourceType: "manual",
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
            customerPaymentPolicy: null,
            priceOverride: null,
            customFields: {},
            holdExpiresAt: null,
            confirmedAt: null,
            expiredAt: null,
            cancelledAt: null,
            completedAt: null,
            awaitingPaymentAt: null,
            paidAt: null,
            redeemedAt: null,
            createdAt: "2026-07-15T10:00:00.000Z",
            updatedAt: "2026-07-15T10:00:00.000Z",
          }
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
