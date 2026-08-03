import { beforeEach, describe, expect, it, vi } from "vitest"

const executeCreate = vi.hoisted(() => vi.fn())

vi.mock("../../src/booking-create-command.js", () => ({
  executeFinanceSelfServiceBookingCreateCommand: executeCreate,
}))
vi.mock("../../src/booking-number.js", () => ({
  allocateBookingNumber: vi.fn(async () => "VY-TEST-1"),
}))

import { createSelfServiceCreateRuntime } from "../../src/self-service-create-runtime.js"

describe("Finance self-service create runtime storefront origin", () => {
  beforeEach(() => {
    executeCreate.mockReset()
    executeCreate.mockResolvedValue({ value: { bookingId: "book_1" } })
  })

  it.each([
    [
      "public",
      { storefront: { storefrontId: "sf_public", channelId: "chan_public" } },
      { storefrontOrigin: { storefrontId: "sf_public", channelId: "chan_public" } },
    ],
    ["staff", {}, {}],
  ])("persists origin only when the trusted %s caller supplies it", async (_label, extra, expected) => {
    const source = {
      resolveBookingSource: vi.fn(async () => ({ status: "ok" as const, command: {} })),
      consumeBookingSource: vi.fn(async () => undefined),
    }
    const runtime = createSelfServiceCreateRuntime({
      resolveSource: () => source as never,
      admit: () => ({}) as never,
    })

    await runtime.createFromSession({
      db: {} as never,
      sessionId: "bses_1",
      quoteId: "cquo_1",
      caller: { personId: "per_1" },
      idempotencyKey: "create_1",
      ...extra,
    })

    expect(executeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ commandInput: expect.objectContaining(expected) }),
    )
    if (!("storefront" in extra)) {
      expect(executeCreate.mock.calls[0]?.[0]?.commandInput).not.toHaveProperty("storefrontOrigin")
    }
  })
})
