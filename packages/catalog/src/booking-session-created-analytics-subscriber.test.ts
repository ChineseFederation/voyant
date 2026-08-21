import { describe, expect, it, vi } from "vitest"

import { createCatalogBookingSessionCreatedAnalyticsSubscriber } from "./booking-session-created-analytics-subscriber.js"

describe("Catalog Booking Session created analytics subscriber", () => {
  it("emits exactly one owner creation signal for one committed event", async () => {
    const track = vi.fn()
    let handler: ((event: { data: unknown }) => unknown) | undefined
    const descriptor = createCatalogBookingSessionCreatedAnalyticsSubscriber({ track } as never)
    descriptor.register({
      eventBus: {
        subscribe: vi.fn((_name, registered) => {
          handler = registered as typeof handler
        }),
      },
    } as never)

    await handler?.({
      data: {
        bookingSessionId: "bses_1",
        scope: "en",
        market: "default",
        channel: "operator",
      },
    })

    expect(track).toHaveBeenCalledOnce()
    expect(track).toHaveBeenCalledWith("engine.session.created", {
      booking_session_id: "bses_1",
      scope: "en",
      market: "default",
      channel: "operator",
    })
  })
})
