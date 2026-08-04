// @vitest-environment jsdom

import {
  type AllocationManifestTraveler,
  type AllocationResource,
  VoyantApiError,
} from "@voyant-travel/operations-react/availability"
import type * as ReactTypes from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { allocationUiEn, allocationUiRo } from "../i18n/index.js"
import type { AllocationOccupants } from "./slot-allocation-model.js"
import { AllocationPrintView } from "./slot-allocation-print-view.js"
import { parseConstraintViolations } from "./slot-allocation-rooming-dialogs.js"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@voyant-travel/ui/components", () => ({}))

function room(overrides: Partial<AllocationResource> = {}): AllocationResource {
  return {
    id: "alrs_1",
    slotId: "avsl_1",
    kind: "room",
    refType: null,
    refId: null,
    label: "Room 101",
    capacity: 2,
    occupancyMin: 2,
    roomTypeId: "hrmt_double",
    bedConfiguration: "1 double",
    accessible: false,
    minAge: null,
    maxAge: null,
    flags: {},
    parentId: null,
    sortOrder: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  }
}

function traveler(
  overrides: Partial<AllocationManifestTraveler> & { id: string },
): AllocationManifestTraveler {
  return {
    bookingId: "book_1",
    bookingNumber: "B-001",
    bookingStatus: "confirmed",
    bookingSequence: 1,
    paymentStatus: "paid",
    firstName: "Ana",
    lastName: "Pop",
    fullName: "Ana Pop",
    email: null,
    phone: null,
    isLeadTraveler: true,
    isPrimary: true,
    sharingGroupId: null,
    roomTypeId: null,
    bedPreference: null,
    allocations: {},
    travelerCategory: "adult",
    participantType: "traveler",
    hasAccessibilityNeeds: false,
    hasDietaryRequirements: false,
    ...overrides,
  }
}

function occupants(
  byResource: Record<string, AllocationManifestTraveler[]>,
  unallocated: AllocationManifestTraveler[] = [],
): AllocationOccupants {
  return {
    byResource: new Map(Object.entries(byResource)),
    byTravelerId: new Map(),
    unallocated,
  }
}

describe("AllocationPrintView", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  function render(node: ReactTypes.ReactNode) {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root?.render(node)
    })
    return container
  }

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    container = null
    root = null
  })

  it("prints a supplier rooming list with one row per occupant", () => {
    const ana = traveler({ id: "t1", bedPreference: "twin", sharingGroupId: "sg1" })
    const bo = traveler({ id: "t2", fullName: "Bo Pop", hasAccessibilityNeeds: true })
    const element = render(
      <AllocationPrintView
        kind="room"
        departureLabel="Danube Delta — 1 Sep"
        resources={[room()]}
        occupants={occupants({ alrs_1: [ana, bo] })}
        travelers={[ana, bo]}
        conflicts={[]}
        printedAt="1 Sep 2026"
        sharingGroupLabels={{ sg1: "Popescu party" }}
        messages={allocationUiEn}
      />,
    )

    const text = element.textContent ?? ""
    // The room's own facts — what a hotel needs to make the room up.
    expect(text).toContain("Room 101")
    expect(text).toContain("hrmt_double")
    expect(text).toContain("1 double")
    // And the per-traveler facts, which a per-room summary could not carry.
    expect(text).toContain("Ana Pop")
    expect(text).toContain("Bo Pop")
    expect(text).toContain("Popescu party")
    expect(text).toContain(allocationUiEn.roomingPreferences.bedPreferences.twin)
    expect(text).toContain(allocationUiEn.print.accessibilityNote)
    // One row per occupant, not one blob per room.
    expect(element.querySelectorAll("tbody tr")).toHaveLength(3)
  })

  it("prints a row for a room nobody holds, so a paid-for empty bed is visible", () => {
    const element = render(
      <AllocationPrintView
        kind="room"
        departureLabel={null}
        resources={[room()]}
        occupants={occupants({})}
        travelers={[]}
        conflicts={[]}
        printedAt="1 Sep 2026"
        messages={allocationUiEn}
      />,
    )

    expect(element.textContent).toContain("Room 101")
    expect(element.querySelectorAll("tbody tr")).toHaveLength(2)
  })

  it("keeps the compact per-seat manifest for seat-shaped kinds", () => {
    const rider = traveler({ id: "t1" })
    const element = render(
      <AllocationPrintView
        kind="vehicle_seat"
        departureLabel={null}
        resources={[room({ id: "seat_1", kind: "vehicle_seat", label: "1A", capacity: 1 })]}
        occupants={occupants({ seat_1: [rider] })}
        travelers={[rider]}
        conflicts={[]}
        printedAt="1 Sep 2026"
        messages={allocationUiEn}
      />,
    )

    // Three columns, not ten: a coach sheet wants one line per seat.
    expect(element.querySelectorAll("thead th")).toHaveLength(3)
  })

  it("localizes the sheet", () => {
    const element = render(
      <AllocationPrintView
        kind="room"
        departureLabel={null}
        resources={[]}
        occupants={occupants({})}
        travelers={[]}
        conflicts={[]}
        printedAt="1 sep. 2026"
        messages={allocationUiRo}
      />,
    )

    expect(element.textContent).toContain(allocationUiRo.print.heading)
  })
})

describe("parseConstraintViolations", () => {
  const blocking = { code: "room_type_mismatch", severity: "blocking", message: "…" }

  it("reads the structured payload off a 409", () => {
    const error = new VoyantApiError("Assignment violates a room constraint", 409, {
      error: "Assignment violates a room constraint",
      detail: { violations: [blocking] },
    })

    expect(parseConstraintViolations(error)).toEqual([blocking])
  })

  it("offers no override when nothing blocking was returned", () => {
    const error = new VoyantApiError("x", 409, {
      detail: {
        violations: [{ code: "bed_preference_unmet", severity: "advisory", message: "…" }],
      },
    })

    expect(parseConstraintViolations(error)).toBeNull()
  })

  it("offers no override for a failure an override cannot fix", () => {
    expect(
      parseConstraintViolations(new VoyantApiError("Resource not found", 404, { error: "x" })),
    ).toBeNull()
    expect(parseConstraintViolations(new Error("network"))).toBeNull()
    // A capacity 409 carries no `violations` payload and is not overridable.
    expect(
      parseConstraintViolations(
        new VoyantApiError("Resource over capacity", 409, { detail: { capacity: 2, current: 2 } }),
      ),
    ).toBeNull()
  })
})
