import type {
  AllocationManifestTraveler,
  AllocationResource,
} from "@voyant-travel/operations-react/availability"
import { describe, expect, it } from "vitest"

import { allocationUiEn } from "../i18n/index.js"
import { commonSharingGroupId } from "./slot-allocation-bulk-bar.js"
import { isSeatingExportKind } from "./slot-allocation-export-menu.js"
import {
  allocationErrorReason,
  canAttachFleetResource,
  collectVehicleOccupants,
  defaultCapacityFor,
  deriveAllocationKinds,
  describeFleetAttachError,
  fleetResourcesForKind,
  groupResourcesBySubType,
  isTravelerAllocatableKind,
  summarizeResourceCapacity,
  validateVehicleSeatDesignation,
} from "./slot-allocation-model.js"

function resource(overrides: Partial<AllocationResource> & { id: string }): AllocationResource {
  return {
    id: overrides.id,
    slotId: overrides.slotId ?? "slot_1",
    kind: overrides.kind ?? "room",
    refType: overrides.refType ?? null,
    refId: overrides.refId ?? null,
    label: overrides.label ?? null,
    capacity: overrides.capacity ?? 1,
    occupancyMin: null,
    roomTypeId: null,
    bedConfiguration: null,
    accessible: false,
    minAge: null,
    maxAge: null,
    flags: overrides.flags ?? {},
    parentId: overrides.parentId ?? null,
    sortOrder: overrides.sortOrder ?? 0,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00Z",
  }
}

function traveler(id: string, seatId?: string): AllocationManifestTraveler {
  return {
    id,
    bookingId: `booking_${id}`,
    bookingNumber: `BK-${id}`,
    bookingStatus: "confirmed",
    bookingSequence: 1,
    paymentStatus: "paid",
    firstName: id,
    lastName: "Traveler",
    fullName: `${id} Traveler`,
    email: null,
    phone: null,
    isLeadTraveler: true,
    isPrimary: true,
    sharingGroupId: null,
    roomTypeId: null,
    bedPreference: null,
    allocations: seatId ? { vehicle_seat: seatId } : {},
    travelerCategory: null,
    participantType: "traveler",
    hasAccessibilityNeeds: false,
    hasDietaryRequirements: false,
  }
}

describe("deriveAllocationKinds", () => {
  const standardKinds = ["room", "vehicle", "vehicle_seat"]

  it("exposes the standard operated-departure logistics kinds without templates", () => {
    expect(deriveAllocationKinds({ resources: [], templateOptions: [] })).toEqual(standardKinds)
  })

  it("keeps standard kinds stable when resources or templates repeat them", () => {
    expect(
      deriveAllocationKinds({
        resources: [resource({ id: "room_1", kind: "room" })],
        templateOptions: [],
      }),
    ).toEqual(standardKinds)

    expect(
      deriveAllocationKinds({
        resources: [],
        templateOptions: [
          {
            templates: [{ kind: "room" }],
          },
        ],
      }),
    ).toEqual(standardKinds)
  })

  it("deduplicates standard kinds and appends extension kinds", () => {
    expect(
      deriveAllocationKinds({
        resources: [
          resource({ id: "vehicle_1", kind: "vehicle" }),
          resource({ id: "seat_1", kind: "vehicle_seat" }),
        ],
        templateOptions: [
          {
            templates: [{ kind: "vehicle" }, { kind: "vehicle_seat" }, { kind: "cabin" }],
          },
        ],
      }),
    ).toEqual([...standardKinds, "cabin"])
  })
})

describe("standard operated-departure kinds", () => {
  it("treats vehicles as parent resources rather than traveler positions", () => {
    expect(isTravelerAllocatableKind("vehicle")).toBe(false)
    expect(isTravelerAllocatableKind("room")).toBe(true)
    expect(isTravelerAllocatableKind("vehicle_seat")).toBe(true)
  })

  it("starts a manually-created vehicle with editable coach-scale capacity", () => {
    expect(defaultCapacityFor("vehicle")).toBe(50)
  })
})

describe("vehicle occupancy", () => {
  it("rolls child-seat traveler assignments up to their parent vehicle", () => {
    const vehicles = [
      resource({ id: "vehicle_1", kind: "vehicle", capacity: 50 }),
      resource({ id: "vehicle_2", kind: "vehicle", capacity: 20 }),
    ]
    const seats = [
      resource({ id: "seat_1", kind: "vehicle_seat", parentId: "vehicle_1" }),
      resource({ id: "seat_2", kind: "vehicle_seat", parentId: "vehicle_2" }),
    ]

    const occupants = collectVehicleOccupants(
      [traveler("one", "seat_1"), traveler("two", "seat_2"), traveler("three")],
      vehicles,
      seats,
    )

    expect(occupants.byResource.get("vehicle_1")?.map((entry) => entry.id)).toEqual(["one"])
    expect(occupants.byResource.get("vehicle_2")?.map((entry) => entry.id)).toEqual(["two"])
    expect(occupants.unallocated.map((entry) => entry.id)).toEqual(["three"])
  })
})

describe("manual vehicle-seat designations", () => {
  const seats = [
    resource({ id: "seat_1", kind: "vehicle_seat", parentId: "vehicle_1", label: "12A" }),
    resource({
      id: "seat_2",
      kind: "vehicle_seat",
      parentId: "vehicle_2",
      flags: { row: 12, column: "A" },
    }),
  ]

  it("requires a nonblank designation", () => {
    expect(validateVehicleSeatDesignation({ label: "  ", parentId: "vehicle_1", seats })).toBe(
      "required",
    )
  })

  it("rejects duplicates within the same vehicle, case-insensitively", () => {
    expect(validateVehicleSeatDesignation({ label: "12a", parentId: "vehicle_1", seats })).toBe(
      "duplicate",
    )
    expect(validateVehicleSeatDesignation({ label: "12a", parentId: "vehicle_2", seats })).toBe(
      "duplicate",
    )
  })

  it("allows the same designation in a different vehicle", () => {
    expect(
      validateVehicleSeatDesignation({ label: "12A", parentId: "vehicle_3", seats }),
    ).toBeNull()
  })
})

describe("groupResourcesBySubType", () => {
  it("groups by alphabetic label prefix so DBLs and SGLs stay together", () => {
    const groups = groupResourcesBySubType([
      resource({ id: "1", label: "DBL 1", capacity: 2 }),
      resource({ id: "2", label: "SGL 1", capacity: 1 }),
      resource({ id: "3", label: "DBL 2", capacity: 2 }),
      resource({ id: "4", label: "SGL 2", capacity: 1 }),
      resource({ id: "5", label: "DBL 3", capacity: 2 }),
    ])
    expect(groups.map((g) => g.label)).toEqual(["DBL", "SGL"])
    expect(groups[0]?.count).toBe(3)
    expect(groups[0]?.capacity).toBe(6)
    expect(groups[1]?.count).toBe(2)
    expect(groups[1]?.capacity).toBe(2)
  })

  it("prefers refId over label prefix when present", () => {
    const groups = groupResourcesBySubType([
      resource({ id: "1", label: "Room 1", refId: "supplier-dbl", capacity: 2 }),
      resource({ id: "2", label: "Room 2", refId: "supplier-dbl", capacity: 2 }),
      resource({ id: "3", label: "Room 3", refId: "supplier-sgl", capacity: 1 }),
    ])
    const refKeys = groups.map((g) => g.key)
    expect(refKeys).toContain("ref:supplier-dbl")
    expect(refKeys).toContain("ref:supplier-sgl")
  })

  it("returns null label for the catch-all bucket so callers can localize 'Other'", () => {
    const groups = groupResourcesBySubType([
      resource({ id: "1", label: null, capacity: 2 }),
      resource({ id: "2", label: "  ", capacity: 1 }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.key).toBe("other")
    expect(groups[0]?.label).toBeNull()
    expect(groups[0]?.count).toBe(2)
  })
})

describe("summarizeResourceCapacity", () => {
  it("flags 'fits' when total resource capacity is under slot pax", () => {
    const summary = summarizeResourceCapacity({
      resources: [resource({ id: "a", capacity: 2 }), resource({ id: "b", capacity: 1 })],
      slotInitialPax: 10,
      slotRemainingPax: 10,
      unlimited: false,
    })
    expect(summary.status).toBe("fits")
    expect(summary.resourceCapacity).toBe(3)
    expect(summary.delta).toBe(-7)
  })

  it("flags 'exact' when resource sum equals slot pax", () => {
    const summary = summarizeResourceCapacity({
      resources: [resource({ id: "a", capacity: 2 }), resource({ id: "b", capacity: 1 })],
      slotInitialPax: 3,
      slotRemainingPax: 3,
      unlimited: false,
    })
    expect(summary.status).toBe("exact")
    expect(summary.delta).toBe(0)
  })

  it("flags 'over' when resource sum exceeds slot pax", () => {
    const summary = summarizeResourceCapacity({
      resources: [resource({ id: "a", capacity: 3 }), resource({ id: "b", capacity: 2 })],
      slotInitialPax: 4,
      slotRemainingPax: 4,
      unlimited: false,
    })
    expect(summary.status).toBe("over")
    expect(summary.delta).toBe(1)
  })

  it("returns 'unbounded' when the slot is unlimited", () => {
    const summary = summarizeResourceCapacity({
      resources: [resource({ id: "a", capacity: 2 })],
      slotInitialPax: 100,
      slotRemainingPax: 100,
      unlimited: true,
    })
    expect(summary.status).toBe("unbounded")
    expect(summary.slotPax).toBeNull()
    expect(summary.delta).toBeNull()
  })

  it("returns 'unbounded' when slot has no initialPax", () => {
    const summary = summarizeResourceCapacity({
      resources: [resource({ id: "a", capacity: 2 })],
      slotInitialPax: null,
      slotRemainingPax: null,
      unlimited: false,
    })
    expect(summary.status).toBe("unbounded")
  })
})

describe("fleet resource attachment", () => {
  it("offers a fleet source only for kinds a fleet record can be", () => {
    expect(canAttachFleetResource("room")).toBe(true)
    expect(canAttachFleetResource("vehicle")).toBe(true)
    // A seat is a child row of a vehicle, never a `resources` record.
    expect(canAttachFleetResource("vehicle_seat")).toBe(false)
    expect(canAttachFleetResource("cabin")).toBe(false)
  })

  it("filters the registry to the fleet kinds that back the active kind", () => {
    const registry = [
      { id: "res_1", kind: "vehicle" },
      { id: "res_2", kind: "boat" },
      { id: "res_3", kind: "room" },
      { id: "res_4", kind: "guide" },
    ]

    expect(fleetResourcesForKind(registry, "vehicle").map((entry) => entry.id)).toEqual([
      "res_1",
      "res_2",
    ])
    expect(fleetResourcesForKind(registry, "room").map((entry) => entry.id)).toEqual(["res_3"])
    expect(fleetResourcesForKind(registry, "vehicle_seat")).toEqual([])
  })

  it("reads the allocation error reason off the parsed error body", () => {
    expect(
      allocationErrorReason({
        body: {
          error: "Resource is already committed",
          detail: { reason: "resource_double_booked" },
        },
      }),
    ).toBe("resource_double_booked")
    expect(allocationErrorReason(new Error("boom"))).toBeNull()
    expect(allocationErrorReason(null)).toBeNull()
    expect(allocationErrorReason({ body: { error: "nope" } })).toBeNull()
  })

  it("turns a double-booking rejection into copy that says what to do", () => {
    const doubleBooked = Object.assign(
      new Error("Resource is already committed to an overlapping departure"),
      {
        body: {
          error: "Resource is already committed to an overlapping departure",
          detail: { reason: "resource_double_booked", conflictingSlotId: "slot_9" },
        },
      },
    )

    expect(describeFleetAttachError(doubleBooked, allocationUiEn)).toBe(
      allocationUiEn.fleet.doubleBooked,
    )
    // Anything else keeps the server's own sentence, then the localized fallback.
    expect(describeFleetAttachError(new Error("Resource not found"), allocationUiEn)).toBe(
      "Resource not found",
    )
    expect(describeFleetAttachError({}, allocationUiEn)).toBe(allocationUiEn.fleet.attachFailed)
  })
})

describe("commonSharingGroupId", () => {
  function traveler(id: string, sharingGroupId: string | null): AllocationManifestTraveler {
    return {
      id,
      bookingId: "book_1",
      bookingNumber: "BK-001",
      bookingStatus: "confirmed",
      bookingSequence: 1,
      paymentStatus: "paid",
      firstName: id,
      lastName: id,
      fullName: id,
      email: null,
      phone: null,
      isLeadTraveler: false,
      isPrimary: false,
      sharingGroupId,
      roomTypeId: null,
      bedPreference: null,
      allocations: {},
      travelerCategory: null,
      participantType: "traveler",
      hasAccessibilityNeeds: false,
      hasDietaryRequirements: false,
    }
  }

  it("names the group only when the whole selection shares it", () => {
    expect(commonSharingGroupId([traveler("a", "grp_1"), traveler("b", "grp_1")])).toBe("grp_1")
    expect(commonSharingGroupId([traveler("a", "grp_1"), traveler("b", "grp_2")])).toBeNull()
    expect(commonSharingGroupId([traveler("a", "grp_1"), traveler("b", null)])).toBeNull()
    expect(commonSharingGroupId([traveler("a", null)])).toBeNull()
    expect(commonSharingGroupId([])).toBeNull()
  })
})

describe("isSeatingExportKind", () => {
  it("mirrors the server's allocationExportPrefixForKind split", () => {
    expect(isSeatingExportKind("vehicle_seat")).toBe(true)
    expect(isSeatingExportKind("flight_seat")).toBe(true)
    expect(isSeatingExportKind("room")).toBe(false)
    expect(isSeatingExportKind("cabin")).toBe(false)
  })
})
