import { describe, expect, it } from "vitest"

import type { AllocationManifestTraveler } from "../../src/availability/service-allocation.js"
import {
  type AllocationConflictResource,
  evaluateAllocationConflicts,
} from "../../src/availability/service-allocation-conflicts.js"

const SLOT_ID = "avsl_conflicts"

function traveler(
  id: string,
  overrides: Partial<AllocationManifestTraveler> = {},
): AllocationManifestTraveler {
  return {
    id,
    bookingId: overrides.bookingId ?? `bk_${id}`,
    bookingNumber: overrides.bookingNumber ?? `BK-${id}`,
    bookingStatus: overrides.bookingStatus ?? "confirmed",
    bookingSequence: overrides.bookingSequence ?? 1,
    paymentStatus: overrides.paymentStatus ?? "unpaid",
    firstName: overrides.firstName ?? "Test",
    lastName: overrides.lastName ?? id,
    fullName: overrides.fullName ?? `Test ${id}`,
    email: null,
    phone: null,
    isLeadTraveler: overrides.isLeadTraveler ?? false,
    isPrimary: overrides.isPrimary ?? false,
    sharingGroupId: overrides.sharingGroupId ?? null,
    optionId: overrides.optionId ?? null,
    optionUnitId: overrides.optionUnitId ?? null,
    optionUnitCode: overrides.optionUnitCode ?? null,
    roomTypeId: null,
    bedPreference: null,
    allocations: overrides.allocations ?? {},
    travelerCategory: null,
    participantType: overrides.participantType ?? "traveler",
    hasAccessibilityNeeds: overrides.hasAccessibilityNeeds ?? false,
    hasDietaryRequirements: overrides.hasDietaryRequirements ?? false,
  }
}

function resource(
  id: string,
  overrides: Partial<AllocationConflictResource> = {},
): AllocationConflictResource {
  return {
    id,
    kind: overrides.kind ?? "room",
    capacity: overrides.capacity ?? 2,
    label: overrides.label ?? id,
    refType: overrides.refType ?? null,
    refId: overrides.refId ?? null,
    parentId: overrides.parentId ?? null,
    flags: overrides.flags ?? {},
  }
}

function codes(conflicts: ReturnType<typeof evaluateAllocationConflicts>) {
  return conflicts.map((conflict) => conflict.code)
}

describe("evaluateAllocationConflicts", () => {
  it("reports a traveler holding no resource of this kind", () => {
    const conflicts = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "room",
      travelers: [traveler("t1")],
      resources: [resource("r1")],
    })
    expect(codes(conflicts)).toEqual(["traveler_unassigned"])
    expect(conflicts[0]?.subjectId).toBe("t1")
  })

  it("treats an allocation pointing at a resource that is not on the slot as unassigned", () => {
    const conflicts = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "room",
      travelers: [traveler("t1", { allocations: { room: "r_missing" } })],
      resources: [resource("r1")],
    })
    expect(codes(conflicts)).toEqual(["traveler_unassigned"])
  })

  it("separates over-capacity from a duplicated capacity-1 seat", () => {
    const roomConflicts = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "room",
      travelers: [
        traveler("t1", { allocations: { room: "r1" } }),
        traveler("t2", { allocations: { room: "r1" } }),
        traveler("t3", { allocations: { room: "r1" } }),
      ],
      resources: [resource("r1", { capacity: 2 })],
    })
    expect(codes(roomConflicts)).toEqual(["resource_over_capacity"])
    expect(roomConflicts[0]?.count).toBe(1)

    const seatConflicts = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "vehicle_seat",
      travelers: [
        traveler("t1", { allocations: { vehicle_seat: "s1" } }),
        traveler("t2", { allocations: { vehicle_seat: "s1" } }),
      ],
      resources: [resource("s1", { kind: "vehicle_seat", capacity: 1 })],
    })
    expect(codes(seatConflicts)).toEqual(["duplicate_assignment"])
  })

  it("flags an accessibility-needing traveler placed in a resource that is not marked accessible", () => {
    const conflicts = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "room",
      travelers: [
        traveler("t1", { allocations: { room: "r1" }, hasAccessibilityNeeds: true }),
        traveler("t2", { allocations: { room: "r2" }, hasAccessibilityNeeds: true }),
      ],
      resources: [resource("r1"), resource("r2", { flags: { accessibilityNeeded: true } })],
    })
    expect(codes(conflicts)).toEqual(["inaccessible_assignment"])
    expect(conflicts[0]?.subjectId).toBe("t1")
  })

  it("flags a traveler placed in a unit or option they did not buy", () => {
    const conflicts = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "room",
      travelers: [
        traveler("t1", {
          allocations: { room: "r1" },
          optionUnitId: "ou_double",
        }),
        traveler("t2", { allocations: { room: "r2" }, optionId: "opt_a" }),
      ],
      resources: [
        resource("r1", { refType: "option_unit", refId: "ou_single" }),
        resource("r2", { flags: { templateOptionId: "opt_a" } }),
      ],
    })
    expect(codes(conflicts)).toEqual(["incompatible_assignment"])
    expect(conflicts[0]?.subjectId).toBe("t1")
  })

  it("reports a sharing group larger than the resource it sits in", () => {
    const conflicts = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "room",
      travelers: [
        traveler("t1", { sharingGroupId: "sg1", allocations: { room: "r1" } }),
        traveler("t2", { sharingGroupId: "sg1", allocations: { room: "r1" } }),
        traveler("t3", { sharingGroupId: "sg1", allocations: { room: "r1" } }),
      ],
      resources: [resource("r1", { capacity: 2 })],
    })
    expect(codes(conflicts)).toEqual(["oversubscribed_sharing_group", "resource_over_capacity"])
  })

  it("reports an unplaced sharing group that cannot fit anywhere on the departure", () => {
    const conflicts = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "room",
      travelers: [
        traveler("t1", { sharingGroupId: "sg1" }),
        traveler("t2", { sharingGroupId: "sg1" }),
        traveler("t3", { sharingGroupId: "sg1" }),
      ],
      resources: [resource("r1", { capacity: 2 })],
    })
    expect(codes(conflicts)).toContain("oversubscribed_sharing_group")
  })

  it("reports a split sharing group, but not one that is merely unplaced", () => {
    const split = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "room",
      travelers: [
        traveler("t1", { sharingGroupId: "sg1", allocations: { room: "r1" } }),
        traveler("t2", { sharingGroupId: "sg1", allocations: { room: "r2" } }),
      ],
      resources: [resource("r1"), resource("r2")],
    })
    expect(codes(split)).toContain("split_sharing_group")

    const unplaced = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "room",
      travelers: [
        traveler("t1", { sharingGroupId: "sg1" }),
        traveler("t2", { sharingGroupId: "sg1" }),
      ],
      resources: [resource("r1")],
    })
    expect(codes(unplaced)).not.toContain("split_sharing_group")
  })

  it("counts a half-placed family as split", () => {
    const conflicts = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "room",
      travelers: [
        traveler("t1", { sharingGroupId: "sg1", allocations: { room: "r1" } }),
        traveler("t2", { sharingGroupId: "sg1" }),
      ],
      resources: [resource("r1")],
    })
    expect(codes(conflicts)).toContain("split_sharing_group")
  })

  it("returns critical conflicts before warnings", () => {
    const conflicts = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "room",
      travelers: [
        traveler("t1", { allocations: { room: "r1" } }),
        traveler("t2", { allocations: { room: "r1" } }),
        traveler("t3", { allocations: { room: "r1" } }),
        traveler("t4"),
      ],
      resources: [resource("r1", { capacity: 2 })],
    })
    expect(conflicts.map((conflict) => conflict.severity)).toEqual(["critical", "warning"])
  })

  it("rolls up beyond the per-code sample cap so the body stays bounded", () => {
    const travelers = Array.from({ length: 130 }, (_, index) => traveler(`t${index}`))
    const conflicts = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "room",
      travelers,
      resources: [resource("r1")],
    })
    expect(conflicts).toHaveLength(101)
    const rollup = conflicts.find((conflict) => conflict.subjectType === "departure")
    expect(rollup?.subjectId).toBe(SLOT_ID)
    expect(rollup?.count).toBe(30)
  })

  it("evaluates only the requested kind", () => {
    const conflicts = evaluateAllocationConflicts({
      slotId: SLOT_ID,
      kind: "vehicle_seat",
      travelers: [traveler("t1", { allocations: { room: "r1", vehicle_seat: "s1" } })],
      resources: [resource("r1"), resource("s1", { kind: "vehicle_seat", capacity: 1 })],
    })
    expect(conflicts).toEqual([])
  })
})
