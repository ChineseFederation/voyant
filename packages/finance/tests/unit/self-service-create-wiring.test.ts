import { bookingsSelfServiceCreateRuntimePort } from "@voyant-travel/bookings/runtime-port"
import { describe, expect, it, vi } from "vitest"
import { createFinanceRuntimePortContribution } from "../../src/runtime-contributor.js"
import { financeSelfServiceBookingSourceRuntimePort } from "../../src/self-service-booking-source.js"

/**
 * The public create path was dead once already: Finance declared
 * `providePort(bookingsSelfServiceCreateRuntimePort)` in its manifest but
 * never contributed anything under that id, so the route answered 501 in every
 * deployment and no test noticed. This asserts the contribution exists, and
 * that it stays absent when no source provider is selected.
 */
describe("finance self-service create wiring", () => {
  it("contributes the create runtime when a booking-source provider is selected", () => {
    const contribution = createFinanceRuntimePortContribution(
      host({ [financeSelfServiceBookingSourceRuntimePort.id]: sourceStub() }),
    )

    const runtime = contribution[bookingsSelfServiceCreateRuntimePort.id] as
      | { createFromDraft?: unknown }
      | undefined
    expect(typeof runtime?.createFromDraft).toBe("function")
  })

  it("omits the create runtime when no booking-source provider is selected", () => {
    const contribution = createFinanceRuntimePortContribution(host({}))

    expect(contribution[bookingsSelfServiceCreateRuntimePort.id]).toBeUndefined()
  })
})

function sourceStub() {
  return {
    resolveBookingSource: vi.fn(async () => ({ status: "rejected", reason: "draft_not_found" })),
    consumeBookingSource: vi.fn(async () => {}),
  }
}

function host(ports: Record<string, unknown>) {
  return {
    primitives: {} as never,
    hasRuntimePort: (port: { id: string }) => port.id in ports,
    getRuntimePort: <T>(port: { id: string }) => ports[port.id] as T,
  }
}
