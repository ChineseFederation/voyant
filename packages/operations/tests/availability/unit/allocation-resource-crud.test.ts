import { describe, expect, it } from "vitest"

import { AllocationServiceError } from "../../../src/availability/service-allocation.js"
import {
  assertVehicleChildCapacity,
  assertVehicleSeatDesignationAvailable,
} from "../../../src/availability/service-allocation-resource-invariants.js"

describe("vehicle child-seat capacity", () => {
  it("accepts child seats up to the vehicle capacity", () => {
    expect(() =>
      assertVehicleChildCapacity({ capacity: 50, existingSeatCount: 49, seatsToAdd: 1 }),
    ).not.toThrow()
  })

  it("rejects another seat once the vehicle is full", () => {
    expect(() =>
      assertVehicleChildCapacity({ capacity: 2, existingSeatCount: 2, seatsToAdd: 1 }),
    ).toThrowError(AllocationServiceError)
  })

  it("rejects lowering vehicle capacity below its existing seat count", () => {
    try {
      assertVehicleChildCapacity({ capacity: 19, existingSeatCount: 20, seatsToAdd: 0 })
      throw new Error("Expected capacity conflict")
    } catch (error) {
      expect(error).toBeInstanceOf(AllocationServiceError)
      expect(error).toMatchObject({
        status: 409,
        detail: { capacity: 19, existingSeatCount: 20, requestedSeatCount: 0 },
      })
    }
  })
})

describe("vehicle seat designation", () => {
  it("requires a nonblank seat designation", () => {
    expect(() =>
      assertVehicleSeatDesignationAvailable({ label: "  ", flags: {}, existingSeats: [] }),
    ).toThrowError(AllocationServiceError)
  })

  it("rejects a duplicate label or generated row-column designation", () => {
    expect(() =>
      assertVehicleSeatDesignationAvailable({
        label: "12a",
        flags: {},
        existingSeats: [{ label: null, flags: { row: 12, column: "A" } }],
      }),
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        detail: { designation: "12a" },
      }),
    )
  })

  it("rejects a duplicate generated designation supplied by a flags-only update", () => {
    expect(() =>
      assertVehicleSeatDesignationAvailable({
        label: null,
        flags: { row: 12, column: "A" },
        existingSeats: [{ label: "12a", flags: {} }],
      }),
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        detail: { designation: "12a" },
      }),
    )
  })

  it("rejects flags that remove the only generated seat designation", () => {
    expect(() =>
      assertVehicleSeatDesignationAvailable({
        label: null,
        flags: {},
        existingSeats: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        status: 400,
      }),
    )
  })
})
