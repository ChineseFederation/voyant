import { describe, expect, it } from "vitest"

import {
  bedPreferenceSatisfied,
  type ConstraintResource,
  type ConstraintTraveler,
  evaluateAssignmentConstraints,
  evaluateOccupancyConstraints,
  isAccessibleResource,
} from "../../../src/availability/room-constraints.js"

function room(overrides: Partial<ConstraintResource> = {}): ConstraintResource {
  return {
    id: "room-1",
    kind: "room",
    capacity: 2,
    occupancyMin: null,
    roomTypeId: null,
    bedConfiguration: null,
    accessible: false,
    minAge: null,
    maxAge: null,
    refType: null,
    refId: null,
    flags: {},
    ...overrides,
  }
}

function traveler(overrides: Partial<ConstraintTraveler> & { id: string }): ConstraintTraveler {
  return {
    bookingId: "b1",
    sharingGroupId: null,
    travelerCategory: "adult",
    optionId: null,
    optionUnitId: null,
    roomTypeId: null,
    bedPreference: null,
    hasAccessibilityNeeds: false,
    ...overrides,
  }
}

const codes = (violations: Array<{ code: string }>) => violations.map((entry) => entry.code)

describe("evaluateAssignmentConstraints", () => {
  it("passes a plain adult into a plain room", () => {
    expect(
      evaluateAssignmentConstraints({
        traveler: traveler({ id: "t1" }),
        resource: room(),
        otherOccupants: [],
      }),
    ).toEqual([])
  })

  it("blocks a room type the traveler did not book", () => {
    const violations = evaluateAssignmentConstraints({
      traveler: traveler({ id: "t1", roomTypeId: "hrmt_twin" }),
      resource: room({ roomTypeId: "hrmt_double" }),
      otherOccupants: [],
    })

    expect(codes(violations)).toContain("room_type_mismatch")
    expect(violations[0]?.severity).toBe("blocking")
  })

  it("leaves a room that declares no room type open to anyone", () => {
    expect(
      evaluateAssignmentConstraints({
        traveler: traveler({ id: "t1", roomTypeId: "hrmt_twin" }),
        resource: room(),
        otherOccupants: [],
      }),
    ).toEqual([])
  })

  it("blocks an option unit the traveler did not buy", () => {
    const violations = evaluateAssignmentConstraints({
      traveler: traveler({ id: "t1", optionUnitId: "unit-single" }),
      resource: room({ refType: "option_unit", refId: "unit-double" }),
      otherOccupants: [],
    })

    expect(codes(violations)).toContain("unit_mismatch")
  })

  it("reports an unmet bed preference as advisory, never blocking", () => {
    const violations = evaluateAssignmentConstraints({
      traveler: traveler({ id: "t1", bedPreference: "twin" }),
      resource: room({ bedConfiguration: "1 king" }),
      otherOccupants: [],
    })

    expect(codes(violations)).toContain("bed_preference_unmet")
    expect(violations.every((entry) => entry.severity === "advisory")).toBe(true)
  })

  it("reports accessibility as advisory: the flag means 'has a note', not 'uses a wheelchair'", () => {
    const violations = evaluateAssignmentConstraints({
      traveler: traveler({ id: "t1", hasAccessibilityNeeds: true }),
      resource: room(),
      otherOccupants: [],
    })

    expect(codes(violations)).toContain("accessibility_unmet")
    expect(violations.find((entry) => entry.code === "accessibility_unmet")?.severity).toBe(
      "advisory",
    )
  })

  it("honours the legacy accessibility flag keys", () => {
    expect(isAccessibleResource(room({ flags: { wheelchairAccessible: true } }))).toBe(true)
    expect(
      evaluateAssignmentConstraints({
        traveler: traveler({ id: "t1", hasAccessibilityNeeds: true }),
        resource: room({ flags: { accessibilityNeeded: true } }),
        otherOccupants: [],
      }),
    ).toEqual([])
  })

  it("keeps an adult out of a child-only position and a child out of an adult-only one", () => {
    expect(
      codes(
        evaluateAssignmentConstraints({
          traveler: traveler({ id: "t1", travelerCategory: "adult" }),
          resource: room({ maxAge: 12 }),
          otherOccupants: [],
        }),
      ),
    ).toContain("age_band_excluded")

    expect(
      codes(
        evaluateAssignmentConstraints({
          traveler: traveler({ id: "t2", travelerCategory: "child" }),
          resource: room({ minAge: 18 }),
          otherOccupants: [],
        }),
      ),
    ).toContain("age_band_excluded")
  })

  it("blocks a child left alone in a room", () => {
    const violations = evaluateAssignmentConstraints({
      traveler: traveler({ id: "kid", travelerCategory: "child" }),
      resource: room(),
      otherOccupants: [],
    })

    expect(codes(violations)).toContain("unaccompanied_minor")
  })

  it("allows a child with an adult from the same booking", () => {
    expect(
      codes(
        evaluateAssignmentConstraints({
          traveler: traveler({ id: "kid", travelerCategory: "child", bookingId: "b1" }),
          resource: room({ capacity: 3 }),
          otherOccupants: [traveler({ id: "parent", bookingId: "b1" })],
        }),
      ),
    ).toEqual([])
  })

  it("allows a child with an adult in the same sharing group", () => {
    expect(
      codes(
        evaluateAssignmentConstraints({
          traveler: traveler({
            id: "kid",
            travelerCategory: "child",
            bookingId: "b1",
            sharingGroupId: "sg1",
          }),
          resource: room({ capacity: 3 }),
          otherOccupants: [traveler({ id: "aunt", bookingId: "b2", sharingGroupId: "sg1" })],
        }),
      ),
    ).toEqual([])
  })

  it("blocks a child sharing with adults from another booking and no sharing group", () => {
    expect(
      codes(
        evaluateAssignmentConstraints({
          traveler: traveler({ id: "kid", travelerCategory: "child", bookingId: "b1" }),
          resource: room({ capacity: 3 }),
          otherOccupants: [traveler({ id: "stranger", bookingId: "b9" })],
        }),
      ),
    ).toContain("adult_child_mixing")
  })

  it("skips the room rules for seat-shaped kinds", () => {
    expect(
      evaluateAssignmentConstraints({
        traveler: traveler({ id: "kid", travelerCategory: "child" }),
        resource: room({ kind: "vehicle_seat", capacity: 1, bedConfiguration: null }),
        otherOccupants: [],
      }),
    ).toEqual([])
  })

  it("still enforces capacity", () => {
    expect(
      codes(
        evaluateAssignmentConstraints({
          traveler: traveler({ id: "t3" }),
          resource: room({ capacity: 2 }),
          otherOccupants: [traveler({ id: "t1" }), traveler({ id: "t2" })],
        }),
      ),
    ).toContain("capacity_exceeded")
  })
})

describe("evaluateOccupancyConstraints", () => {
  it("reports a room let at a minimum occupancy it does not reach", () => {
    const violations = evaluateOccupancyConstraints(room({ capacity: 3, occupancyMin: 3 }), [
      traveler({ id: "t1" }),
      traveler({ id: "t2" }),
    ])

    expect(codes(violations)).toEqual(["occupancy_below_minimum"])
    expect(violations[0]?.expected).toBe(3)
    expect(violations[0]?.actual).toBe(2)
  })

  it("says nothing about an empty room — nobody has under-occupied it yet", () => {
    expect(evaluateOccupancyConstraints(room({ occupancyMin: 2 }), [])).toEqual([])
  })
})

describe("bedPreferenceSatisfied", () => {
  it("treats an unknown bed configuration as satisfiable", () => {
    expect(bedPreferenceSatisfied("double", null, 2)).toBe(true)
    expect(bedPreferenceSatisfied("twin", "", 2)).toBe(true)
  })

  it("decides a single by capacity, not by bed wording", () => {
    expect(bedPreferenceSatisfied("single", null, 1)).toBe(true)
    // "2 single beds" is a twin. A sole-occupancy request is not met by it.
    expect(bedPreferenceSatisfied("single", "2 single beds", 2)).toBe(false)
  })

  it("recognises common supplier bed wording", () => {
    expect(bedPreferenceSatisfied("double", "1 Queensize bed", 2)).toBe(true)
    expect(bedPreferenceSatisfied("twin", "2 single beds", 2)).toBe(true)
    expect(bedPreferenceSatisfied("twin", "1 king", 2)).toBe(false)
  })

  it("always satisfies no-preference and an absent preference", () => {
    expect(bedPreferenceSatisfied("no-preference", "1 king", 2)).toBe(true)
    expect(bedPreferenceSatisfied(null, "1 king", 2)).toBe(true)
  })
})
