import { describe, expect, it } from "vitest"

import {
  type AllocatorResource,
  type AllocatorTraveler,
  planRoomAllocation,
  planVehicleSeatAllocation,
} from "../../../src/availability/auto-allocator.js"

function traveler(
  overrides: Partial<AllocatorTraveler> & { id: string; bookingId: string },
): AllocatorTraveler {
  return {
    bookingStatus: "confirmed",
    isLeadTraveler: false,
    sharingGroupId: null,
    hasAccessibilityNeeds: false,
    existingAllocationId: null,
    ...overrides,
  }
}

function room(
  overrides: Partial<AllocatorResource> & { id: string; capacity: number },
): AllocatorResource {
  return {
    kind: "room",
    flags: {},
    parentId: null,
    ...overrides,
  }
}

function seat(
  overrides: Partial<AllocatorResource> & { id: string; row: number; column: string },
): AllocatorResource {
  return {
    kind: "vehicle_seat",
    capacity: 1,
    flags: {},
    parentId: "vehicle-1",
    position: "window",
    ...overrides,
  }
}

describe("planRoomAllocation", () => {
  it("skips bookings outside the slot-active status set", () => {
    const plan = planRoomAllocation(
      [
        traveler({ id: "t1", bookingId: "b1", bookingStatus: "draft" }),
        traveler({ id: "t2", bookingId: "b2", bookingStatus: "expired" }),
        traveler({ id: "t3", bookingId: "b3", bookingStatus: "cancelled" }),
      ],
      [room({ id: "r1", capacity: 2 })],
    )

    expect(plan.assignments).toEqual([])
    expect(plan.skipped).toBe(0)
  })

  it("keeps a booking party together when capacity allows", () => {
    const plan = planRoomAllocation(
      [
        traveler({ id: "t1", bookingId: "b1", isLeadTraveler: true }),
        traveler({ id: "t2", bookingId: "b1" }),
      ],
      [room({ id: "r-double", capacity: 2 }), room({ id: "r-single", capacity: 1 })],
    )

    expect(plan.assignments.find((row) => row.travelerId === "t1")?.resourceId).toBe("r-double")
    expect(plan.assignments.find((row) => row.travelerId === "t2")?.resourceId).toBe("r-double")
    expect(plan.skipped).toBe(0)
  })

  it("prefers exact-fit rooms before larger rooms", () => {
    const plan = planRoomAllocation(
      [traveler({ id: "t1", bookingId: "b1", isLeadTraveler: true })],
      [room({ id: "r-double", capacity: 2 }), room({ id: "r-single", capacity: 1 })],
    )

    expect(plan.assignments).toEqual([{ travelerId: "t1", resourceId: "r-single" }])
  })

  it("prefers rooms with a matching template option before capacity tie-breakers", () => {
    const plan = planRoomAllocation(
      [
        traveler({ id: "t1", bookingId: "b1", optionId: "option-dbl" }),
        traveler({ id: "t2", bookingId: "b1", optionId: "option-dbl" }),
      ],
      [
        room({ id: "r-twn", capacity: 2, flags: { templateOptionId: "option-twn" } }),
        room({ id: "r-dbl", capacity: 2, flags: { templateOptionId: "option-dbl" } }),
      ],
    )

    expect(plan.assignments.find((row) => row.travelerId === "t1")?.resourceId).toBe("r-dbl")
    expect(plan.assignments.find((row) => row.travelerId === "t2")?.resourceId).toBe("r-dbl")
  })

  it("prefers rooms linked to the selected option unit", () => {
    const plan = planRoomAllocation(
      [
        traveler({ id: "t1", bookingId: "b1", optionUnitId: "unit-dbl" }),
        traveler({ id: "t2", bookingId: "b1", optionUnitId: "unit-dbl" }),
      ],
      [
        room({ id: "r-twn", capacity: 2, refType: "option_unit", refId: "unit-twn" }),
        room({ id: "r-dbl", capacity: 2, refType: "option_unit", refId: "unit-dbl" }),
      ],
    )

    expect(plan.assignments.find((row) => row.travelerId === "t1")?.resourceId).toBe("r-dbl")
    expect(plan.assignments.find((row) => row.travelerId === "t2")?.resourceId).toBe("r-dbl")
  })

  it("falls back to the resource label prefix for hand-materialized room types", () => {
    const plan = planRoomAllocation(
      [
        traveler({ id: "t1", bookingId: "b1", optionUnitCode: "dbl_room" }),
        traveler({ id: "t2", bookingId: "b1", optionUnitCode: "dbl_room" }),
      ],
      [
        room({ id: "r-twn", capacity: 2, label: "TWN #1" }),
        room({ id: "r-dbl", capacity: 2, label: "DBL #1" }),
      ],
    )

    expect(plan.assignments.find((row) => row.travelerId === "t1")?.resourceId).toBe("r-dbl")
    expect(plan.assignments.find((row) => row.travelerId === "t2")?.resourceId).toBe("r-dbl")
  })

  /**
   * #4036 turned the option/unit and accessibility *sort keys* into filters, so
   * this case had to be decided deliberately rather than inherited.
   *
   * The decision: a **label prefix** is not a constraint. "DBL #1" is a name an
   * operator typed, not something a customer bought or a supplier contracted,
   * so it may steer the choice but must never block it — and falling through to
   * another room is therefore not a compromise worth reporting. The assertion
   * that the party lands in `r-twn` stands unchanged; what is new is the
   * assertion that nothing was given up to get there.
   *
   * The unit-ref case immediately below is the opposite: that IS a constraint,
   * and the same fall-through is now reported.
   */
  it("uses another room type when the preferred label-matched room is full, and reports no compromise", () => {
    const plan = planRoomAllocation(
      [
        traveler({
          id: "existing",
          bookingId: "b0",
          existingAllocationId: "r-dbl",
          optionUnitCode: "dbl_room",
        }),
        traveler({ id: "t1", bookingId: "b1", optionUnitCode: "dbl_room" }),
        traveler({ id: "t2", bookingId: "b1", optionUnitCode: "dbl_room" }),
      ],
      [room({ id: "r-dbl", capacity: 1, label: "DBL #1" }), room({ id: "r-twn", capacity: 2 })],
    )

    expect(plan.assignments.find((row) => row.travelerId === "existing")).toBeUndefined()
    expect(plan.assignments.find((row) => row.travelerId === "t1")?.resourceId).toBe("r-twn")
    expect(plan.assignments.find((row) => row.travelerId === "t2")?.resourceId).toBe("r-twn")
    expect(plan.skipped).toBe(0)
    expect(plan.compromises).toEqual([])
  })

  it("reports the relaxation when it has to put a party in a unit they did not buy", () => {
    const plan = planRoomAllocation(
      [
        traveler({ id: "t1", bookingId: "b1", optionUnitId: "unit-dbl" }),
        traveler({ id: "t2", bookingId: "b1", optionUnitId: "unit-dbl" }),
      ],
      [
        room({ id: "r-dbl", capacity: 1, refType: "option_unit", refId: "unit-dbl" }),
        room({ id: "r-twn", capacity: 2, refType: "option_unit", refId: "unit-twn" }),
      ],
    )

    expect(plan.assignments.find((row) => row.travelerId === "t1")?.resourceId).toBe("r-twn")
    expect(plan.compromises).toEqual([
      {
        groupKey: "b:b1",
        sharingGroupId: null,
        travelerIds: ["t1", "t2"],
        resourceId: "r-twn",
        relaxed: ["bed_preference", "room_type", "option", "option_unit"],
      },
    ])
  })

  it("keeps a party out of the wrong room type when a compatible one is free", () => {
    const plan = planRoomAllocation(
      [
        traveler({ id: "t1", bookingId: "b1", roomTypeId: "hrmt_twin" }),
        traveler({ id: "t2", bookingId: "b1", roomTypeId: "hrmt_twin" }),
      ],
      [
        room({ id: "r-dbl", capacity: 2, roomTypeId: "hrmt_double" }),
        room({ id: "r-twn", capacity: 2, roomTypeId: "hrmt_twin" }),
      ],
    )

    expect(plan.assignments.find((row) => row.travelerId === "t1")?.resourceId).toBe("r-twn")
    expect(plan.compromises).toEqual([])
  })

  it("gives accessibility up last, and says so when it has to", () => {
    const plan = planRoomAllocation(
      [traveler({ id: "t1", bookingId: "b1", hasAccessibilityNeeds: true })],
      [room({ id: "r-plain", capacity: 1 })],
    )

    expect(plan.assignments).toEqual([{ travelerId: "t1", resourceId: "r-plain" }])
    expect(plan.compromises[0]?.relaxed).toEqual([
      "bed_preference",
      "room_type",
      "option",
      "option_unit",
      "age_band",
      "accessibility",
    ])
  })

  it("filters on accessibility rather than merely preferring it", () => {
    // The accessible room is the *only* one with space, so a filter finds it
    // where the old sort key would have been overruled by the exact-fit
    // tie-breaker below it.
    const plan = planRoomAllocation(
      [
        traveler({ id: "t1", bookingId: "b1", hasAccessibilityNeeds: true }),
        traveler({ id: "t2", bookingId: "b1" }),
      ],
      [
        room({ id: "r-plain", capacity: 2 }),
        room({ id: "r-accessible", capacity: 2, accessible: true }),
      ],
    )

    expect(plan.assignments.every((row) => row.resourceId === "r-accessible")).toBe(true)
    expect(plan.compromises).toEqual([])
  })

  it("names the group and the reason behind a skipped traveler count", () => {
    const plan = planRoomAllocation(
      [
        traveler({ id: "t1", bookingId: "b1", sharingGroupId: "sg-popescu" }),
        traveler({ id: "t2", bookingId: "b2", sharingGroupId: "sg-popescu" }),
        traveler({ id: "t3", bookingId: "b3", sharingGroupId: "sg-popescu" }),
      ],
      [room({ id: "r-double", capacity: 2 })],
    )

    expect(plan.skipped).toBe(3)
    expect(plan.unplaced).toEqual([
      {
        groupKey: "sg:sg-popescu",
        sharingGroupId: "sg-popescu",
        travelerIds: ["t1", "t2", "t3"],
        reason: "no_capacity",
        largestFreeCapacity: 2,
      },
    ])
  })

  it("distinguishes a departure with no rooms at all from one that is full", () => {
    const plan = planRoomAllocation([traveler({ id: "t1", bookingId: "b1" })], [])

    expect(plan.unplaced[0]?.reason).toBe("no_resources")
  })

  it("preserves existing assignments as no-op plan rows", () => {
    const plan = planRoomAllocation(
      [
        traveler({ id: "t1", bookingId: "b1", existingAllocationId: "r-pinned" }),
        traveler({ id: "t2", bookingId: "b2" }),
      ],
      [room({ id: "r-pinned", capacity: 1 }), room({ id: "r-free", capacity: 1 })],
    )

    expect(plan.assignments.find((row) => row.travelerId === "t1")).toBeUndefined()
    expect(plan.assignments.find((row) => row.travelerId === "t2")?.resourceId).toBe("r-free")
  })

  it("keeps sharing groups together across bookings", () => {
    const plan = planRoomAllocation(
      [
        traveler({ id: "alice", bookingId: "bA", sharingGroupId: "sg1", isLeadTraveler: true }),
        traveler({ id: "bob", bookingId: "bB", sharingGroupId: "sg1" }),
      ],
      [room({ id: "r-double", capacity: 2 }), room({ id: "r-single", capacity: 1 })],
    )

    expect(plan.assignments.find((row) => row.travelerId === "alice")?.resourceId).toBe("r-double")
    expect(plan.assignments.find((row) => row.travelerId === "bob")?.resourceId).toBe("r-double")
  })

  it("prefers accessibility rooms only for travelers who need them", () => {
    const accessible = room({
      id: "r-accessible",
      capacity: 1,
      flags: { accessibilityNeeded: true },
    })
    const plain = room({ id: "r-plain", capacity: 1 })

    expect(
      planRoomAllocation(
        [traveler({ id: "t1", bookingId: "b1", hasAccessibilityNeeds: true })],
        [plain, accessible],
      ).assignments,
    ).toEqual([{ travelerId: "t1", resourceId: "r-accessible" }])

    expect(
      planRoomAllocation([traveler({ id: "t2", bookingId: "b2" })], [plain, accessible])
        .assignments,
    ).toEqual([{ travelerId: "t2", resourceId: "r-plain" }])
  })

  it("reports skipped travelers when no room fits the group", () => {
    const plan = planRoomAllocation(
      [
        traveler({ id: "t1", bookingId: "b1" }),
        traveler({ id: "t2", bookingId: "b1" }),
        traveler({ id: "t3", bookingId: "b1" }),
      ],
      [room({ id: "r-double", capacity: 2 })],
    )

    expect(plan.assignments).toEqual([])
    expect(plan.skipped).toBe(3)
  })
})

describe("planVehicleSeatAllocation", () => {
  it("places solo lead travelers in window seats first", () => {
    const plan = planVehicleSeatAllocation(
      [traveler({ id: "t1", bookingId: "b1", isLeadTraveler: true })],
      [
        seat({ id: "s-aisle", row: 1, column: "B", position: "aisle" }),
        seat({ id: "s-window", row: 1, column: "A", position: "window" }),
      ],
    )

    expect(plan.assignments).toEqual([{ travelerId: "t1", resourceId: "s-window" }])
  })

  it("seats sharing groups in contiguous same-row seats", () => {
    const plan = planVehicleSeatAllocation(
      [
        traveler({ id: "alice", bookingId: "bA", sharingGroupId: "sg1", isLeadTraveler: true }),
        traveler({ id: "bob", bookingId: "bB", sharingGroupId: "sg1" }),
      ],
      [
        seat({ id: "s-1A", row: 1, column: "A", position: "window" }),
        seat({ id: "s-2A", row: 2, column: "A", position: "window" }),
        seat({ id: "s-2B", row: 2, column: "B", position: "aisle" }),
      ],
    )

    expect(plan.assignments.find((row) => row.travelerId === "alice")?.resourceId).toBe("s-2A")
    expect(plan.assignments.find((row) => row.travelerId === "bob")?.resourceId).toBe("s-2B")
  })

  it("reports skipped travelers when not enough free seats exist", () => {
    const plan = planVehicleSeatAllocation(
      [
        traveler({ id: "t1", bookingId: "b1" }),
        traveler({ id: "t2", bookingId: "b1" }),
        traveler({ id: "t3", bookingId: "b1" }),
      ],
      [seat({ id: "s1", row: 1, column: "A" }), seat({ id: "s2", row: 1, column: "B" })],
    )

    expect(plan.assignments).toEqual([])
    expect(plan.skipped).toBe(3)
  })
})
