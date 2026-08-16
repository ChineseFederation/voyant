import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  CANCEL_FLIGHT_ORDER_HANDLER_POLICY,
  type FlightsToolServices,
  flightsTools,
  TICKET_FLIGHT_ORDER_HANDLER_POLICY,
} from "./tools.js"

function ctx(
  services?: Partial<FlightsToolServices>,
): ToolContext & { flights?: FlightsToolServices } {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
    flights: services as FlightsToolServices | undefined,
  }
}

function registry() {
  const registry = createToolRegistry()
  registry.registerAll(flightsTools)
  return registry
}

describe("flight tools", () => {
  it("registers typed reads and confirmation-gated supplier writes", () => {
    const tools = registry().list()
    expect(tools.map(({ name }) => name).sort()).toEqual([
      "cancel_flight_order",
      "get_flight_order",
      "list_flight_orders",
      "price_flight_offer",
      "search_fare_calendar",
      "search_flights",
      "ticket_flight_order",
    ])
    for (const tool of tools.filter(
      ({ name }) => name.startsWith("ticket_") || name.startsWith("cancel_"),
    )) {
      expect(tool).toMatchObject({
        tier: "destructive",
        capabilityVersion: "v2",
        annotations: { idempotentHint: true },
        riskPolicy: { destructive: true, reversible: false, confirmationRequired: true },
      })
    }
    expect([TICKET_FLIGHT_ORDER_HANDLER_POLICY, CANCEL_FLIGHT_ORDER_HANDLER_POLICY]).toEqual([
      expect.objectContaining({
        actionPolicy: expect.objectContaining({
          targetType: "flight-order",
          commandTargetField: "orderId",
          existingTarget: { durability: "handler-command-result-v1" },
          ledger: "required",
          approval: "required",
        }),
      }),
      expect.objectContaining({
        actionPolicy: expect.objectContaining({
          targetType: "flight-order",
          commandTargetField: "orderId",
          existingTarget: { durability: "handler-command-result-v1" },
          ledger: "required",
          approval: "required",
        }),
      }),
    ])
  })

  it("routes flight search through the selected connector service", async () => {
    await expect(
      registry().dispatch(
        "search_flights",
        {
          slices: [{ origin: "OTP", destination: "LHR", departureDate: "2026-09-01" }],
          passengers: { adults: 1 },
        },
        ctx({
          async searchFlights() {
            return { offers: [], pagination: { total: 0, hasMore: false } }
          },
        }),
      ),
    ).resolves.toEqual({ offers: [], pagination: { total: 0, hasMore: false } })
  })

  it("quotes a fare calendar window through the connector", async () => {
    await expect(
      registry().dispatch(
        "search_fare_calendar",
        {
          origin: "OTP",
          destination: "FNC",
          from: "2026-09-01",
          to: "2026-09-30",
          passengers: { adults: 1 },
        },
        ctx({
          async searchFareCalendar() {
            return {
              days: [
                {
                  date: "2026-09-01",
                  available: true,
                  cheapestPrice: { amount: "199.00", currency: "EUR" },
                },
                { date: "2026-09-02", available: false },
              ],
            }
          },
        }),
      ),
    ).resolves.toMatchObject({ days: [{ date: "2026-09-01" }, { date: "2026-09-02" }] })
  })

  // A day that does not exist would be rolled forward by `Date`, so the agent
  // has to be told rather than handed quotes for another month.
  it("refuses a window bound that is not a real calendar day", async () => {
    await expect(
      registry().dispatch(
        "search_fare_calendar",
        {
          origin: "OTP",
          destination: "FNC",
          from: "2026-02-31",
          to: "2026-03-15",
          passengers: { adults: 1 },
        },
        ctx({
          async searchFareCalendar() {
            throw new Error("the connector must never be reached with an impossible date")
          },
        }),
      ),
    ).rejects.toThrow()
  })

  it("fails closed without connector wiring", async () => {
    await expect(
      registry().dispatch(
        "search_flights",
        {
          slices: [{ origin: "OTP", destination: "LHR", departureDate: "2026-09-01" }],
          passengers: { adults: 1 },
        },
        ctx(),
      ),
    ).rejects.toMatchObject({ code: "MISSING_SERVICE" })
  })
})
