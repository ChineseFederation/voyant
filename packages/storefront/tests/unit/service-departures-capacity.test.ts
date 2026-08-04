import { describe, expect, it } from "vitest"

import {
  buildAvailabilityState,
  resolveDepartureCapacity,
  type SlotRow,
} from "../../src/service-departures-core.js"

type CapacityInput = Pick<SlotRow, "unlimited" | "initialPax" | "remainingPax">

function slot(data: Partial<CapacityInput> = {}): CapacityInput {
  return {
    unlimited: data.unlimited ?? false,
    initialPax: data.initialPax ?? null,
    remainingPax: data.remainingPax ?? null,
  }
}

describe("resolveDepartureCapacity", () => {
  it("reports the maintained remaining_pax projection", () => {
    expect(resolveDepartureCapacity(slot({ initialPax: 24, remainingPax: 12 }))).toEqual({
      capacity: 24,
      remaining: 12,
    })
  })

  it("reports unknown remaining when remaining_pax is unset (#4161)", () => {
    // `remaining_resources` used to be the fallback here. It has no writer, so
    // it can only ever overstate availability; an unset `remaining_pax` must
    // surface as unknown instead.
    expect(resolveDepartureCapacity(slot({ initialPax: 24, remainingPax: null }))).toEqual({
      capacity: 24,
      remaining: null,
    })
  })

  it("keeps unlimited departures uncapped and without a remaining count", () => {
    expect(
      resolveDepartureCapacity(slot({ unlimited: true, initialPax: 24, remainingPax: null })),
    ).toEqual({ capacity: null, remaining: null })
  })

  it("ignores any extra slot fields it is handed", () => {
    // Guards against the fix being undone by widening the input again: passing
    // a stale `remainingResources` through must not change the result.
    const stale = { ...slot({ initialPax: 10 }), remainingResources: 6 }
    expect(resolveDepartureCapacity(stale)).toEqual({ capacity: 10, remaining: null })
  })
})

describe("buildAvailabilityState with unknown remaining", () => {
  it("does not render unknown remaining as sold out", () => {
    expect(
      buildAvailabilityState({
        status: "open",
        remaining: null,
        capacity: 24,
        pastCutoff: false,
        tooEarly: false,
      }),
    ).toBe("available")
  })

  it("still derives sold_out from an explicit zero remaining", () => {
    expect(
      buildAvailabilityState({
        status: "open",
        remaining: 0,
        capacity: 24,
        pastCutoff: false,
        tooEarly: false,
      }),
    ).toBe("sold_out")
  })

  it("keeps a persisted sold_out status authoritative when remaining is unknown", () => {
    expect(
      buildAvailabilityState({
        status: "sold_out",
        remaining: null,
        capacity: 24,
        pastCutoff: false,
        tooEarly: false,
      }),
    ).toBe("sold_out")
  })
})
