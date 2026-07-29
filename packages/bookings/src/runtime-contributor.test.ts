import { describe, expect, it, vi } from "vitest"

import { createBookingsRuntimePortContribution } from "./runtime-contributor.js"
import { bookingsStaleHoldsJobRuntimePort } from "./stale-holds-job.js"

describe("createBookingsRuntimePortContribution", () => {
  it("defers dependent port resolution until every contributor is registered", async () => {
    let registered = false
    const staleHoldsRuntime = { closePaymentSchedulesForBooking: vi.fn() }
    const resolveRuntime = vi.fn(() => staleHoldsRuntime)
    const contribution = createBookingsRuntimePortContribution({
      primitives: { database: { resolve: vi.fn() } } as never,
      getRuntimePort: () => {
        if (!registered) throw new Error("finance runtime is not registered")
        return {
          createStaleBookingHoldsJobRuntime: () => ({ resolveRuntime }),
        } as never
      },
    })
    const runtime = contribution[bookingsStaleHoldsJobRuntimePort.id] as {
      resolveRuntime: (db: unknown, input: unknown) => Promise<unknown>
    }

    registered = true

    await expect(runtime.resolveRuntime({} as never, {} as never)).resolves.toBe(staleHoldsRuntime)
    expect(resolveRuntime).toHaveBeenCalledOnce()
  })
})
