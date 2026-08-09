import { describe, expect, it, vi } from "vitest"

import { voyantToolContextContribution } from "./mcp-runtime.js"
import { flightsRuntimePort } from "./runtime-port.js"

describe("Flights MCP runtime", () => {
  it("resolves the async package runtime port before contributing context", async () => {
    const legacyTicketOrder = vi.fn()
    const legacyCancelOrder = vi.fn()
    const resolveAdapter = vi.fn(() => ({
      searchFlights: vi.fn(),
      priceOffer: vi.fn(),
      getOrder: vi.fn(),
      ticketOrder: legacyTicketOrder,
      cancelOrder: legacyCancelOrder,
    }))
    const runtime = {
      resolveAdapter,
      listAdmittedShoppingSources: vi.fn(async () => []),
      startCardPayment: vi.fn(),
    }
    const request = {
      req: { header: vi.fn(() => undefined) },
    }

    const contribution = await voyantToolContextContribution.contribute({
      request,
      context: {} as never,
      resources: {
        [flightsRuntimePort.id]: Promise.resolve(runtime),
      },
    })

    expect(resolveAdapter).not.toHaveBeenCalled()
    expect(contribution.flights).toBeDefined()
    await (
      contribution.flights as { searchFlights(input: object): Promise<unknown> }
    ).searchFlights({})
    expect(resolveAdapter).toHaveBeenCalledWith(request)

    await expect(
      (
        contribution.flights as {
          ticketOrder(orderId: string, admitted: unknown): Promise<unknown>
        }
      ).ticketOrder("ord_1", {}),
    ).rejects.toMatchObject({ code: "MISSING_SERVICE" })
    expect(legacyTicketOrder).not.toHaveBeenCalled()
    expect(legacyCancelOrder).not.toHaveBeenCalled()
  })
})
