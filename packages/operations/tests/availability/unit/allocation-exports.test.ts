import { describe, expect, it } from "vitest"
import type { SlotAllocationManifest } from "../../../src/availability/service-allocation.js"
import {
  buildAllocationPassengersCsv,
  buildAllocationRoomingCsv,
} from "../../../src/availability/service-allocation-exports.js"

function manifest(): SlotAllocationManifest {
  return {
    slot: {
      id: "avsl_123",
      productId: "prod_abcdef",
      startsAt: "2026-05-12T10:00:00.000Z",
      endsAt: null,
    },
    bookings: [
      {
        id: "book_1",
        bookingNumber: "B-001",
        status: "confirmed",
        bookingSequence: 1,
        paymentStatus: "paid",
        sellAmountCents: 20000,
        paidAmountCents: 20000,
        contactFirstName: "Ana",
        contactLastName: "Pop",
        contactEmail: "ana@example.com",
        contactPhone: "+40",
        sellCurrency: "EUR",
        pax: 2,
        travelers: [
          {
            id: "trav_1",
            bookingId: "book_1",
            bookingNumber: "B-001",
            bookingStatus: "confirmed",
            bookingSequence: 1,
            paymentStatus: "paid",
            optionId: null,
            optionUnitId: null,
            optionUnitCode: null,
            firstName: "Ana",
            lastName: "Pop",
            fullName: "Ana Pop",
            email: "ana@example.com",
            phone: "+40",
            isLeadTraveler: true,
            isPrimary: true,
            sharingGroupId: "sg_1",
            roomTypeId: null,
            bedPreference: null,
            allocations: { room: "room_1" },
            travelerCategory: null,
            participantType: "adult",
            hasAccessibilityNeeds: false,
            hasDietaryRequirements: true,
          },
          {
            id: "trav_2",
            bookingId: "book_1",
            bookingNumber: "B-001",
            bookingStatus: "confirmed",
            bookingSequence: 1,
            paymentStatus: "paid",
            optionId: null,
            optionUnitId: null,
            optionUnitCode: null,
            firstName: "Bo",
            lastName: "Pop",
            fullName: "Bo Pop",
            email: null,
            phone: null,
            isLeadTraveler: false,
            isPrimary: false,
            sharingGroupId: null,
            roomTypeId: null,
            bedPreference: null,
            allocations: {},
            travelerCategory: "child",
            participantType: "child",
            hasAccessibilityNeeds: false,
            hasDietaryRequirements: false,
          },
        ],
      },
    ],
    resources: [
      {
        id: "room_1",
        slotId: "avsl_123",
        kind: "room",
        refType: null,
        refId: null,
        label: "Room 1",
        capacity: 2,
        occupancyMin: 2,
        roomTypeId: "hrmt_dbl",
        bedConfiguration: "1 double",
        accessible: false,
        minAge: null,
        maxAge: null,
        flags: {},
        parentId: null,
        sortOrder: 1,
        createdAt: new Date("2026-05-12T09:00:00.000Z"),
        updatedAt: new Date("2026-05-12T09:00:00.000Z"),
      },
    ],
    sharingGroupLabels: {
      sg_1: "Friends",
    },
    pagination: { limit: null, offset: 0, total: 1 },
    summary: {
      bookingCount: 1,
      travelerCount: 2,
      leadTravelerCount: 1,
      bookingsByStatus: { confirmed: 1 },
    },
  }
}

describe("allocation CSV exports", () => {
  it("builds a passenger manifest with sharing group labels and flags", () => {
    const csv = buildAllocationPassengersCsv(manifest())

    expect(csv).toContain("Booking,Booking status,Traveler")
    expect(csv).toContain(
      "B-001,confirmed,Ana Pop,yes,yes,ana@example.com,+40,adult,,Friends,no,yes",
    )
    expect(csv).toContain("B-001,confirmed,Bo Pop,no,no,,,child,child,,no,no")
  })

  it("builds a supplier rooming list with one row per occupant", () => {
    const csv = buildAllocationRoomingCsv(manifest())

    // Room facts first, then the traveler facts a hotel needs per key card.
    // Ana holds Room 1; the room is let at a minimum occupancy of 2 and holds
    // one, which the operator sees here and as an `under_occupied_resource`
    // conflict on the screen.
    expect(csv).toContain(
      "Room,Room type,Bed configuration,Occupancy,Capacity,Minimum occupancy,Accessible room," +
        "Traveler,Booking,Sharing group,Bed preference,Accessibility flagged",
    )
    expect(csv).toContain("Room 1,hrmt_dbl,1 double,1,2,2,no,Ana Pop,B-001,Friends,,no")
    expect(csv).toContain("Unallocated,,,,,,,Bo Pop,B-001,,,no")
    expect(csv).toContain("Total,,,2,")
  })

  it("carries each traveler's bed preference and accessibility flag", () => {
    const data = manifest()
    const lead = data.bookings[0]?.travelers[0]
    if (lead) {
      lead.bedPreference = "twin"
      lead.hasAccessibilityNeeds = true
    }
    const csv = buildAllocationRoomingCsv(data)

    expect(csv).toContain("Ana Pop,B-001,Friends,twin,yes")
  })

  it("emits a row for a room nobody holds so an empty bed is visible", () => {
    const data = manifest()
    const lead = data.bookings[0]?.travelers[0]
    if (lead) lead.allocations = {}
    const csv = buildAllocationRoomingCsv(data)

    expect(csv).toContain("Room 1,hrmt_dbl,1 double,0,2,2,no,,,,,")
  })

  it("omits expired bookings from the rooming list", () => {
    const data = manifest()
    data.bookings[0]!.status = "expired"
    const csv = buildAllocationRoomingCsv(data)

    expect(csv).not.toContain("Ana Pop")
    expect(csv).not.toContain("Bo Pop")
    expect(csv).toContain("Total,,,0,")
  })

  it("omits draft bookings from the rooming list", () => {
    const data = manifest()
    data.bookings[0]!.status = "draft"
    const csv = buildAllocationRoomingCsv(data)

    expect(csv).not.toContain("Ana Pop")
    expect(csv).not.toContain("Bo Pop")
    expect(csv).toContain("Total,,,0,")
  })
})
