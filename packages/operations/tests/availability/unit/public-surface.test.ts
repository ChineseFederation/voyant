import { describe, expect, it } from "vitest"
import {
  getSlotAllocationManifest,
  type SlotAllocationManifest,
} from "../../../src/availability/index.js"

describe("availability public surface", () => {
  it("exports the slot allocation manifest helper from the root entrypoint", () => {
    expect(getSlotAllocationManifest).toEqual(expect.any(Function))
  })

  it("exports the slot allocation manifest type from the root entrypoint", () => {
    const manifest = {
      slot: {
        id: "avsl_123",
        productId: "prod_123",
        startsAt: "2026-05-27T09:00:00.000Z",
        endsAt: null,
      },
      bookings: [],
      resources: [],
      sharingGroupLabels: {},
      pagination: {
        limit: null,
        offset: 0,
        total: 0,
      },
      summary: {
        bookingCount: 0,
        travelerCount: 0,
        leadTravelerCount: 0,
        bookingsByStatus: {},
      },
    } satisfies SlotAllocationManifest

    expect(manifest.summary.travelerCount).toBe(0)
  })
})
