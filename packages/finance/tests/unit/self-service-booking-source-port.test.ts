import { describe, expect, it } from "vitest"

import { financeSelfServiceBookingSourceRuntimePort } from "../../src/runtime-port.js"

/**
 * The port is what gates self-service creation on: a deployment that selects a
 * provider missing either half would otherwise advertise the capability and
 * then fail at request time.
 */
describe("finance.self-service-booking-source.runtime port", () => {
  it("accepts a provider implementing both halves of the contract", () => {
    expect(() =>
      financeSelfServiceBookingSourceRuntimePort.test?.({
        async resolveBookingSource() {
          return { status: "rejected", reason: "draft_not_found" }
        },
        async consumeBookingSource() {},
      }),
    ).not.toThrow()
  })

  it.each([
    ["resolveBookingSource", { async consumeBookingSource() {} }],
    [
      "consumeBookingSource",
      {
        async resolveBookingSource() {
          return { status: "rejected", reason: "draft_not_found" }
        },
      },
    ],
  ])("rejects a provider missing %s", (method, provider) => {
    expect(() => financeSelfServiceBookingSourceRuntimePort.test?.(provider as never)).toThrow(
      new RegExp(`must implement ${method}`),
    )
  })

  it.each([
    ["null", null],
    ["a non-object", "provider"],
  ])("rejects %s", (_label, provider) => {
    expect(() => financeSelfServiceBookingSourceRuntimePort.test?.(provider as never)).toThrow(
      /must be an object/,
    )
  })
})
