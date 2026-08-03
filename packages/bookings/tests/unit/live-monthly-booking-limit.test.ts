import { describe, expect, it } from "vitest"

import { selectMonthlyBookingLimit } from "../../src/booking-plan-limit.js"
import { buildBookingRouteRuntime } from "../../src/route-runtime.js"

describe("selectMonthlyBookingLimit", () => {
  it("keeps the configured value when no host resolver is installed", () => {
    expect(selectMonthlyBookingLimit(undefined, 100)).toBe(100)
    expect(selectMonthlyBookingLimit(undefined, null)).toBeNull()
  })

  it("keeps the configured value when the resolver has no live answer", () => {
    expect(selectMonthlyBookingLimit(() => undefined, 100)).toBe(100)
  })

  it("takes a live numeric allowance over the configured one", () => {
    expect(selectMonthlyBookingLimit(() => 5, 100)).toBe(5)
    expect(selectMonthlyBookingLimit(() => 5, null)).toBe(5)
  })

  it("treats a live null as an explicit unlimited, overriding the configured cap", () => {
    expect(selectMonthlyBookingLimit(() => null, 100)).toBeNull()
  })
})

describe("buildBookingRouteRuntime monthly booking limit", () => {
  it("resolves from bindings once when no host resolver is installed", () => {
    const runtime = buildBookingRouteRuntime({ VOYANT_BOOKINGS_MONTHLY_LIMIT: "100" })
    expect(runtime.monthlyBookingLimit).toBe(100)
    expect(runtime.monthlyBookingLimit).toBe(100)
  })

  it("stays unlimited when neither bindings nor a resolver supply a limit", () => {
    expect(buildBookingRouteRuntime({}).monthlyBookingLimit).toBeNull()
  })

  it("consults the host resolver on every read, not once at composition", () => {
    // Mirrors a managed host whose tenant is upgraded while the composed API
    // graph — built once per process — keeps serving requests.
    let live: number | null | undefined = 10
    const runtime = buildBookingRouteRuntime(
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

  it("falls back to the configured value for a resolver that never answers", () => {
    const runtime = buildBookingRouteRuntime(
      { VOYANT_BOOKINGS_MONTHLY_LIMIT: "100" },
      { resolveMonthlyBookingLimit: () => undefined },
    )
    expect(runtime.monthlyBookingLimit).toBe(100)
  })

  it("leaves every other runtime member untouched", () => {
    const runtime = buildBookingRouteRuntime({}, { resolveMonthlyBookingLimit: () => 7 })
    expect(typeof runtime.getKmsProvider).toBe("function")
    expect(runtime.resolveTravelSnapshot).toBeUndefined()
  })
})
