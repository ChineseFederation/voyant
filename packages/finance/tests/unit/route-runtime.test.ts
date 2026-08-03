import type { EventBus } from "@voyant-travel/core"
import { describe, expect, it } from "vitest"
import {
  buildFinanceRouteRuntime,
  FINANCE_ROUTE_RUNTIME_CONTAINER_KEY,
} from "../../src/route-runtime.js"
import { getFinanceRouteRuntime } from "../../src/routes-runtime.js"

describe("buildFinanceRouteRuntime", () => {
  it("resolves the monthly booking limit from bindings when no host resolver is installed", () => {
    expect(
      buildFinanceRouteRuntime({ VOYANT_BOOKINGS_MONTHLY_LIMIT: "100" }).monthlyBookingLimit,
    ).toBe(100)
    expect(buildFinanceRouteRuntime({}).monthlyBookingLimit).toBeNull()
  })

  it("consults the host monthly-booking-limit resolver on every read", () => {
    let live: number | null | undefined = 10
    const runtime = buildFinanceRouteRuntime(
      { VOYANT_BOOKINGS_MONTHLY_LIMIT: "100" },
      { resolveMonthlyBookingLimit: () => live },
    )

    expect(runtime.monthlyBookingLimit).toBe(10)
    live = 250
    expect(runtime.monthlyBookingLimit).toBe(250)
    live = null
    expect(runtime.monthlyBookingLimit).toBeNull()
    live = undefined
    expect(runtime.monthlyBookingLimit).toBe(100)
  })

  it("exposes invoice-from-booking resolver options", async () => {
    const descriptionResolver = () => "Custom legal line"
    const invoiceDueDateResolver = () => "2026-05-23"
    const resolveCustomFields = async () => ({ loyalty_tier: "gold" })
    const runtime = buildFinanceRouteRuntime(
      {},
      {
        descriptionResolver,
        invoiceDueDateResolver,
        resolveCustomFields,
        paymentScheduleLineDescriptionFormat: "product_only",
      },
    )

    expect(runtime.paymentScheduleLineDescriptionFormat).toBe("product_only")
    expect(runtime.resolveCustomFields).toBe(resolveCustomFields)
    expect(
      runtime.invoiceDueDateResolver?.({
        issueDate: "2026-05-23",
        dueDate: "2026-05-01",
        invoiceType: "invoice",
        booking: {
          id: "book_123",
          bookingNumber: "BK-123",
          personId: null,
          organizationId: null,
          sellCurrency: "RON",
          baseCurrency: null,
          fxRateSetId: null,
          sellAmountCents: 12_000,
          baseSellAmountCents: null,
        },
        bookingPaymentSchedule: {
          id: "bps_123",
          bookingId: "book_123",
          bookingItemId: null,
          scheduleType: "balance",
          dueDate: "2026-05-01",
          currency: "RON",
          amountCents: 12_000,
        },
      }),
    ).toBe("2026-05-23")
    expect(
      runtime.descriptionResolver?.({
        booking: {
          id: "book_123",
          bookingNumber: "BK-123",
          personId: null,
          organizationId: null,
          sellCurrency: "RON",
          baseCurrency: null,
          fxRateSetId: null,
          sellAmountCents: 12_000,
          baseSellAmountCents: null,
        },
        line: {
          bookingItemId: null,
          bookingPaymentScheduleId: null,
          description: "Fallback line",
          quantity: 1,
          unitPriceCents: 12_000,
          totalCents: 12_000,
          taxAmountCents: 0,
          taxRate: null,
          sortOrder: 0,
        },
      }),
    ).toBe("Custom legal line")
  })

  it("prefers the request-scoped event bus over the bootstrap runtime bus", () => {
    const bootstrapBus = {} as EventBus
    const requestBus = {} as EventBus
    const runtime = buildFinanceRouteRuntime({}, { eventBus: bootstrapBus })

    const resolved = getFinanceRouteRuntime({
      var: {
        container: {
          resolve: (key) => {
            expect(key).toBe(FINANCE_ROUTE_RUNTIME_CONTAINER_KEY)
            return runtime
          },
        },
      },
      get: () => requestBus,
    })

    expect(resolved?.eventBus).toBe(requestBus)
    expect(runtime.eventBus).toBe(bootstrapBus)
  })
})
