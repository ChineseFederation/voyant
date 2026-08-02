import { describe, expect, it } from "vitest"

import {
  allocationResourceKindSchema,
  assignTravelerAllocationSchema,
  availabilityRuleListQuerySchema,
  availabilitySlotListQuerySchema,
  availabilitySlotStatusSchema,
  customPickupAreaListQuerySchema,
  insertAllocationResourceSchema,
  insertAvailabilityCloseoutSchema,
  insertAvailabilityPickupPointSchema,
  insertAvailabilityRuleSchema,
  insertAvailabilitySlotPickupSchema,
  insertAvailabilitySlotSchema,
  insertAvailabilityStartTimeSchema,
  insertCustomPickupAreaSchema,
  insertLocationPickupTimeSchema,
  insertPickupGroupSchema,
  insertPickupLocationSchema,
  insertProductMeetingConfigSchema,
  meetingModeSchema,
  operatedDepartureResourceKindSchema,
  pairSharingGroupSchema,
  pickupGroupKindSchema,
  pickupTimingModeSchema,
  updateAllocationResourceSchema,
  updateAvailabilitySlotSchema,
  updateTravelerSharingGroupSchema,
  upsertResourceTemplateSchema,
} from "../../../src/availability/validation.js"

describe("Enum schemas", () => {
  it("accepts valid slot statuses", () => {
    for (const s of ["open", "closed", "sold_out", "cancelled"]) {
      expect(availabilitySlotStatusSchema.parse(s)).toBe(s)
    }
  })

  it("rejects invalid slot status", () => {
    expect(() => availabilitySlotStatusSchema.parse("invalid")).toThrow()
  })

  it("accepts valid meeting modes", () => {
    for (const m of ["meeting_only", "pickup_only", "meet_or_pickup"]) {
      expect(meetingModeSchema.parse(m)).toBe(m)
    }
  })

  it("accepts valid pickup group kinds", () => {
    for (const k of ["pickup", "dropoff", "meeting"]) {
      expect(pickupGroupKindSchema.parse(k)).toBe(k)
    }
  })

  it("accepts valid pickup timing modes", () => {
    for (const m of ["fixed_time", "offset_from_start"]) {
      expect(pickupTimingModeSchema.parse(m)).toBe(m)
    }
  })

  it("accepts valid allocation resource kinds", () => {
    for (const kind of ["room", "vehicle", "guide", "equipment", "custom"]) {
      expect(allocationResourceKindSchema.parse(kind)).toBe(kind)
    }
  })

  it("defines the standard operated-departure resource kinds", () => {
    for (const kind of ["room", "vehicle", "vehicle_seat"]) {
      expect(operatedDepartureResourceKindSchema.parse(kind)).toBe(kind)
    }
    for (const unsupported of ["crew", "equipment"]) {
      expect(() => operatedDepartureResourceKindSchema.parse(unsupported)).toThrow()
    }
  })
})

describe("Allocation schema", () => {
  it("accepts an allocation resource with defaults", () => {
    const result = insertAllocationResourceSchema.parse({
      slotId: "slot_abc",
      kind: "room",
      label: "Room 101",
      capacity: 2,
    })

    expect(result.kind).toBe("room")
    expect(result.capacity).toBe(2)
    expect(result.sortOrder).toBe(0)
    expect(result.flags).toEqual({})
  })

  it("rejects non-positive capacity", () => {
    expect(() =>
      insertAllocationResourceSchema.parse({
        slotId: "slot_abc",
        kind: "room",
        label: "Invalid room",
        capacity: 0,
      }),
    ).toThrow()
  })

  it("requires vehicle seats to have one occupant and a vehicle parent", () => {
    expect(
      insertAllocationResourceSchema.parse({
        kind: "vehicle_seat",
        label: "12A",
        capacity: 1,
        parentId: "vehicle_abc",
      }),
    ).toMatchObject({ kind: "vehicle_seat", capacity: 1, parentId: "vehicle_abc" })

    expect(() =>
      insertAllocationResourceSchema.parse({
        kind: "vehicle_seat",
        label: "12A",
        capacity: 2,
      }),
    ).toThrow()

    expect(() =>
      insertAllocationResourceSchema.parse({
        kind: "vehicle_seat",
        label: "   ",
        capacity: 1,
        parentId: "vehicle_abc",
      }),
    ).toThrow()
  })

  it("does not allow changing a resource kind through patch input", () => {
    expect(() =>
      updateAllocationResourceSchema.parse({
        kind: "vehicle",
      }),
    ).toThrow()
  })

  it("accepts traveler allocation assignment and clearing", () => {
    expect(
      assignTravelerAllocationSchema.parse({
        kind: "room",
        resourceId: "resource_abc",
      }),
    ).toEqual({ kind: "room", resourceId: "resource_abc" })

    expect(assignTravelerAllocationSchema.parse({ kind: "room", resourceId: null })).toEqual({
      kind: "room",
      resourceId: null,
    })
  })

  it("keeps vehicles as parent resources rather than traveler positions", () => {
    expect(() =>
      assignTravelerAllocationSchema.parse({
        kind: "vehicle",
        resourceId: "vehicle_abc",
      }),
    ).toThrow()
    expect(assignTravelerAllocationSchema.parse({ kind: "vehicle", resourceId: null })).toEqual({
      kind: "vehicle",
      resourceId: null,
    })
  })

  it("accepts sharing-group updates and pairing requests", () => {
    expect(updateTravelerSharingGroupSchema.parse({ sharingGroupId: "share_abc" })).toEqual({
      sharingGroupId: "share_abc",
    })

    expect(
      pairSharingGroupSchema.parse({
        travelerIds: ["traveler_a", "traveler_b"],
      }),
    ).toEqual({ travelerIds: ["traveler_a", "traveler_b"] })
  })

  it("accepts resource templates with default_count for slot-publish auto-seed", () => {
    const result = upsertResourceTemplateSchema.parse({
      capacity: 2,
      namePattern: "DBL {sequence}",
      defaultCount: 20,
    })
    expect(result.defaultCount).toBe(20)
    expect(result.capacity).toBe(2)
  })

  it("treats omitted default_count as undefined (manual seeding only)", () => {
    const result = upsertResourceTemplateSchema.parse({
      capacity: 2,
      namePattern: "TPL {sequence}",
    })
    expect(result.defaultCount).toBeUndefined()
  })
})

describe("Availability rule schema", () => {
  const valid = {
    productId: "prod_abc",
    timezone: "Europe/London",
    recurrenceRule: "FREQ=DAILY",
    maxCapacity: 20,
  }

  it("accepts valid input with defaults", () => {
    const result = insertAvailabilityRuleSchema.parse(valid)
    expect(result.productId).toBe("prod_abc")
    expect(result.active).toBe(true)
  })

  it("rejects missing productId", () => {
    expect(() => insertAvailabilityRuleSchema.parse({ ...valid, productId: undefined })).toThrow()
  })

  it("rejects empty timezone", () => {
    expect(() => insertAvailabilityRuleSchema.parse({ ...valid, timezone: "" })).toThrow()
  })

  it("rejects empty recurrenceRule", () => {
    expect(() => insertAvailabilityRuleSchema.parse({ ...valid, recurrenceRule: "" })).toThrow()
  })

  it("rejects malformed recurrenceRule", () => {
    expect(() =>
      insertAvailabilityRuleSchema.parse({ ...valid, recurrenceRule: "NOT_A_RULE" }),
    ).toThrow()
  })

  it("rejects weekly recurrenceRule without weekdays", () => {
    expect(() =>
      insertAvailabilityRuleSchema.parse({
        ...valid,
        recurrenceRule: "FREQ=WEEKLY;INTERVAL=1",
      }),
    ).toThrow()
  })

  it("accepts weekly recurrenceRule with weekdays", () => {
    const result = insertAvailabilityRuleSchema.parse({
      ...valid,
      recurrenceRule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR",
    })
    expect(result.recurrenceRule).toBe("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR")
  })

  it("rejects negative maxCapacity", () => {
    expect(() => insertAvailabilityRuleSchema.parse({ ...valid, maxCapacity: -1 })).toThrow()
  })

  it("rejects negative cutoffMinutes", () => {
    expect(() => insertAvailabilityRuleSchema.parse({ ...valid, cutoffMinutes: -5 })).toThrow()
  })
})

describe("Availability start time schema", () => {
  const valid = { productId: "prod_abc", startTimeLocal: "09:00" }

  it("accepts valid input with defaults", () => {
    const result = insertAvailabilityStartTimeSchema.parse(valid)
    expect(result.sortOrder).toBe(0)
    expect(result.active).toBe(true)
  })

  it("rejects empty startTimeLocal", () => {
    expect(() =>
      insertAvailabilityStartTimeSchema.parse({ ...valid, startTimeLocal: "" }),
    ).toThrow()
  })
})

describe("Availability slot schema", () => {
  const valid = {
    productId: "prod_abc",
    dateLocal: "2025-06-15",
    startsAt: "2025-06-15T09:00:00Z",
    timezone: "Europe/London",
  }

  it("accepts valid input with defaults", () => {
    const result = insertAvailabilitySlotSchema.parse(valid)
    expect(result.status).toBe("open")
    expect(result.unlimited).toBe(false)
    expect(result.pastCutoff).toBe(false)
    expect(result.tooEarly).toBe(false)
  })

  it("accepts an exclusive upper bound for departure list windows", () => {
    expect(
      availabilitySlotListQuerySchema.parse({
        startsAtFrom: "2026-09-01T00:00:00.000Z",
        startsAtUntil: "2026-10-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      startsAtFrom: "2026-09-01T00:00:00.000Z",
      startsAtUntil: "2026-10-01T00:00:00.000Z",
    })
  })

  it("rejects invalid dateLocal format", () => {
    expect(() =>
      insertAvailabilitySlotSchema.parse({ ...valid, dateLocal: "not-a-date" }),
    ).toThrow()
  })

  it("rejects invalid startsAt format", () => {
    expect(() =>
      insertAvailabilitySlotSchema.parse({ ...valid, startsAt: "not-a-datetime" }),
    ).toThrow()
  })

  it("accepts valid endsAt datetime", () => {
    const result = insertAvailabilitySlotSchema.parse({
      ...valid,
      endsAt: "2025-06-15T17:00:00Z",
    })
    expect(result.endsAt).toBe("2025-06-15T17:00:00Z")
  })

  it("accepts null endsAt", () => {
    const result = insertAvailabilitySlotSchema.parse({ ...valid, endsAt: null })
    expect(result.endsAt).toBeNull()
  })

  it("rejects negative remainingPax", () => {
    expect(() => insertAvailabilitySlotSchema.parse({ ...valid, remainingPax: -1 })).toThrow()
  })

  it("rejects endsAt before startsAt", () => {
    expect(() =>
      insertAvailabilitySlotSchema.parse({
        ...valid,
        startsAt: "2025-06-15T17:00:00Z",
        endsAt: "2025-06-15T09:00:00Z",
      }),
    ).toThrow()
  })

  it("rejects remainingPax greater than initialPax for limited slots", () => {
    expect(() =>
      insertAvailabilitySlotSchema.parse({
        ...valid,
        initialPax: 5,
        remainingPax: 9,
      }),
    ).toThrow()
  })

  it("allows patch capacity reductions with stale remainingPax snapshots", () => {
    const result = updateAvailabilitySlotSchema.parse({
      initialPax: 10,
      remainingPax: 12,
    })
    expect(result.initialPax).toBe(10)
    expect(result.remainingPax).toBe(12)
  })

  it("rejects dateLocal that does not match startsAt in the slot timezone", () => {
    expect(() =>
      insertAvailabilitySlotSchema.parse({
        ...valid,
        dateLocal: "2025-06-16",
        startsAt: "2025-06-15T23:00:00Z",
        timezone: "UTC",
      }),
    ).toThrow()
  })

  it("accepts dateLocal derived from startsAt in the slot timezone", () => {
    const result = insertAvailabilitySlotSchema.parse({
      ...valid,
      dateLocal: "2025-06-16",
      startsAt: "2025-06-15T23:00:00Z",
      timezone: "Europe/London",
      endsAt: "2025-06-16T01:00:00Z",
      initialPax: 9,
      remainingPax: 5,
    })

    expect(result.dateLocal).toBe("2025-06-16")
  })
})

describe("Availability closeout schema", () => {
  it("requires productId and dateLocal", () => {
    const result = insertAvailabilityCloseoutSchema.parse({
      productId: "prod_abc",
      dateLocal: "2025-12-25",
    })
    expect(result.productId).toBe("prod_abc")
    expect(result.dateLocal).toBe("2025-12-25")
  })

  it("rejects invalid date format", () => {
    expect(() =>
      insertAvailabilityCloseoutSchema.parse({ productId: "prod_abc", dateLocal: "bad" }),
    ).toThrow()
  })
})

describe("Availability pickup point schema", () => {
  it("requires productId and name", () => {
    const result = insertAvailabilityPickupPointSchema.parse({
      productId: "prod_abc",
      name: "Hotel Lobby",
    })
    expect(result.name).toBe("Hotel Lobby")
    expect(result.active).toBe(true)
  })

  it("rejects empty name", () => {
    expect(() =>
      insertAvailabilityPickupPointSchema.parse({ productId: "prod_abc", name: "" }),
    ).toThrow()
  })
})

describe("Slot pickup schema", () => {
  it("requires slotId and pickupPointId", () => {
    const result = insertAvailabilitySlotPickupSchema.parse({
      slotId: "slot_abc",
      pickupPointId: "pp_abc",
    })
    expect(result.slotId).toBe("slot_abc")
    expect(result.pickupPointId).toBe("pp_abc")
  })

  it("rejects missing slotId", () => {
    expect(() => insertAvailabilitySlotPickupSchema.parse({ pickupPointId: "pp_abc" })).toThrow()
  })
})

describe("Product meeting config schema", () => {
  it("applies defaults", () => {
    const result = insertProductMeetingConfigSchema.parse({ productId: "prod_abc" })
    expect(result.mode).toBe("meeting_only")
    expect(result.allowCustomPickup).toBe(false)
    expect(result.allowCustomDropoff).toBe(false)
    expect(result.requiresPickupSelection).toBe(false)
    expect(result.requiresDropoffSelection).toBe(false)
    expect(result.usePickupAllotment).toBe(false)
    expect(result.active).toBe(true)
  })

  it("accepts valid mode", () => {
    const result = insertProductMeetingConfigSchema.parse({
      productId: "prod_abc",
      mode: "pickup_only",
    })
    expect(result.mode).toBe("pickup_only")
  })
})

describe("Pickup group schema", () => {
  it("requires meetingConfigId, kind, and name", () => {
    const result = insertPickupGroupSchema.parse({
      meetingConfigId: "mc_abc",
      kind: "pickup",
      name: "Hotel Pickups",
    })
    expect(result.kind).toBe("pickup")
    expect(result.active).toBe(true)
    expect(result.sortOrder).toBe(0)
  })

  it("rejects missing kind", () => {
    expect(() =>
      insertPickupGroupSchema.parse({ meetingConfigId: "mc_abc", name: "Group" }),
    ).toThrow()
  })

  it("rejects invalid kind", () => {
    expect(() =>
      insertPickupGroupSchema.parse({ meetingConfigId: "mc_abc", kind: "invalid", name: "Group" }),
    ).toThrow()
  })
})

describe("Pickup location schema", () => {
  it("requires groupId and name", () => {
    const result = insertPickupLocationSchema.parse({
      groupId: "pg_abc",
      name: "Hilton Entrance",
    })
    expect(result.name).toBe("Hilton Entrance")
    expect(result.active).toBe(true)
    expect(result.sortOrder).toBe(0)
  })

  it("rejects negative leadTimeMinutes", () => {
    expect(() =>
      insertPickupLocationSchema.parse({
        groupId: "pg_abc",
        name: "X",
        leadTimeMinutes: -10,
      }),
    ).toThrow()
  })
})

describe("Location pickup time schema", () => {
  it("requires pickupLocationId with defaults", () => {
    const result = insertLocationPickupTimeSchema.parse({ pickupLocationId: "pl_abc" })
    expect(result.timingMode).toBe("fixed_time")
    expect(result.active).toBe(true)
  })

  it("accepts offset mode", () => {
    const result = insertLocationPickupTimeSchema.parse({
      pickupLocationId: "pl_abc",
      timingMode: "offset_from_start",
      offsetMinutes: -30,
    })
    expect(result.timingMode).toBe("offset_from_start")
    expect(result.offsetMinutes).toBe(-30)
  })
})

describe("Custom pickup area schema", () => {
  it("requires meetingConfigId and name", () => {
    const result = insertCustomPickupAreaSchema.parse({
      meetingConfigId: "mc_abc",
      name: "North Shore",
    })
    expect(result.name).toBe("North Shore")
    expect(result.active).toBe(true)
  })

  it("rejects empty name", () => {
    expect(() =>
      insertCustomPickupAreaSchema.parse({ meetingConfigId: "mc_abc", name: "" }),
    ).toThrow()
  })
})

describe("Pagination and list query defaults", () => {
  it("applies default limit and offset", () => {
    const result = availabilityRuleListQuerySchema.parse({})
    expect(result.limit).toBe(50)
    expect(result.offset).toBe(0)
  })

  it("coerces string values", () => {
    const result = availabilityRuleListQuerySchema.parse({ limit: "25", offset: "10" })
    expect(result.limit).toBe(25)
    expect(result.offset).toBe(10)
  })

  it("coerces active boolean from string", () => {
    const result = availabilityRuleListQuerySchema.parse({ active: "true" })
    expect(result.active).toBe(true)
  })

  it("rejects limit over 200", () => {
    expect(() => availabilityRuleListQuerySchema.parse({ limit: 201 })).toThrow()
  })

  it("rejects negative offset", () => {
    expect(() => availabilityRuleListQuerySchema.parse({ offset: -1 })).toThrow()
  })

  it("passes through optional filters", () => {
    const result = customPickupAreaListQuerySchema.parse({ meetingConfigId: "mc_abc" })
    expect(result.meetingConfigId).toBe("mc_abc")
  })
})
