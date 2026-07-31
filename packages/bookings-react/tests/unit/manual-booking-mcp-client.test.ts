import { describe, expect, it, vi } from "vitest"

import {
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
  it("fails closed unless the create_booking tool is visible", async () => {
    // generate_booking_number was retired (voyant#3933): create_booking resolves
    // the reference server-side, so it is the only capability the dialog needs.
    const fetcher = vi.fn(async () =>
      json({
        tools: [{ name: "list_invoices" }],
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

  it("reports create availability when create_booking is present", async () => {
    const fetcher = vi.fn(async () => json({ tools: [{ name: "create_booking" }] }))
    await expect(
      getManualBookingToolAvailability({ baseUrl: "https://operator.test", fetcher }),
    ).resolves.toEqual({ canCreate: true, missingTools: [] })
  })

  it("delegates create with confirmation and a server-resolved reference", async () => {
    const calls: Array<Record<string, unknown>> = []
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        params: { name: string; arguments: Record<string, unknown> }
      }
      calls.push(request)
      return json({
        jsonrpc: "2.0",
        id: "1",
        result: {
          structuredContent: { status: "created", bookingId: "book_1", replayed: false },
        },
      })
    })
    const client = { baseUrl: "", fetcher }
    const result = await createManualBookingThroughTool(client, {
      // No bookingNumber — the server allocates the reference.
      booking: { productId: "prod_1" },
      idempotencyKey: "manual-booking:stable-1",
    })

    expect(result).toEqual({ status: "created", bookingId: "book_1", replayed: false })
    expect(calls.map((call) => (call.params as { name: string }).name)).toEqual(["create_booking"])
    expect((calls[0]?.params as { arguments: Record<string, unknown> }).arguments).toEqual({
      booking: { productId: "prod_1" },
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
      booking: { productId: "prod_1" },
      idempotencyKey: "manual-booking:stable-1",
    }
    await createManualBookingThroughTool({ baseUrl: "", fetcher }, input)
    await createManualBookingThroughTool({ baseUrl: "", fetcher }, input)
    expect(argumentsSeen[0]).toEqual(argumentsSeen[1])
  })
})
