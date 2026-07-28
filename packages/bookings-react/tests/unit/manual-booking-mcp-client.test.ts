import { describe, expect, it, vi } from "vitest"

import {
  allocateManualBookingNumber,
  createManualBookingThroughTool,
  getManualBookingToolAvailability,
} from "../../src/manual-booking-mcp-client.js"

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  })
}

describe("manual booking MCP client", () => {
  it("fails closed unless both authorized Finance booking tools are visible", async () => {
    const fetcher = vi.fn(async () =>
      json({
        tools: [{ name: "generate_booking_number" }],
      }),
    )
    await expect(
      getManualBookingToolAvailability({ baseUrl: "https://operator.test", fetcher }),
    ).resolves.toEqual({
      canCreate: false,
      missingTools: ["create_booking"],
    })
    expect(fetcher).toHaveBeenCalledWith(
      "https://operator.test/v1/admin/mcp/manifest",
      expect.objectContaining({ credentials: "include" }),
    )
  })

  it("allocates the authoritative reference and delegates create with confirmation", async () => {
    const calls: Array<Record<string, unknown>> = []
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        params: { name: string; arguments: Record<string, unknown> }
      }
      calls.push(request)
      return request.params.name === "generate_booking_number"
        ? json({
            jsonrpc: "2.0",
            id: "1",
            result: { structuredContent: { bookingNumber: "BK-000123" } },
          })
        : json({
            jsonrpc: "2.0",
            id: "2",
            result: {
              structuredContent: { status: "created", bookingId: "book_1", replayed: false },
            },
          })
    })
    const client = { baseUrl: "", fetcher }
    const bookingNumber = await allocateManualBookingNumber(client)
    const result = await createManualBookingThroughTool(client, {
      booking: { productId: "prod_1", bookingNumber },
      idempotencyKey: "manual-booking:stable-1",
    })

    expect(bookingNumber).toBe("BK-000123")
    expect(result).toEqual({ status: "created", bookingId: "book_1", replayed: false })
    expect(calls.map((call) => (call.params as { name: string }).name)).toEqual([
      "generate_booking_number",
      "create_booking",
    ])
    expect((calls[1]?.params as { arguments: Record<string, unknown> }).arguments).toEqual({
      booking: { productId: "prod_1", bookingNumber: "BK-000123" },
      _voyant: {
        confirmed: true,
        idempotencyKey: "manual-booking:stable-1",
        reasonCode: "operator-manual-booking",
      },
    })
  })

  it("passes the same idempotency key unchanged on an exact retry", async () => {
    const argumentsSeen: unknown[] = []
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        params: { arguments: Record<string, unknown> }
      }
      argumentsSeen.push(request.params.arguments)
      return json({
        result: {
          structuredContent: { status: "created", bookingId: "book_1", replayed: true },
        },
      })
    })
    const input = {
      booking: { productId: "prod_1", bookingNumber: "BK-000123" },
      idempotencyKey: "manual-booking:stable-1",
    }
    await createManualBookingThroughTool({ baseUrl: "", fetcher }, input)
    await createManualBookingThroughTool({ baseUrl: "", fetcher }, input)
    expect(argumentsSeen[0]).toEqual(argumentsSeen[1])
  })
})
