import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  type AccommodationsToolServices,
  accommodationsTools,
  REVERSE_ROOM_BLOCK_PICKUP_HANDLER_POLICY,
  reverseRoomBlockPickupTool,
} from "../../src/tools.js"

function ctx(
  overrides: Partial<AccommodationsToolServices> = {},
): ToolContext & { accommodations: AccommodationsToolServices } {
  const unavailable = async () => {
    throw new Error("Unexpected Accommodations tool service call")
  }
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: "staff", market: "GB", actor: "staff" },
    accommodations: {
      searchOwned: unavailable,
      quoteOwned: unavailable,
      getContent: unavailable,
      getRoomBlock: unavailable,
      createRoomBlock: unavailable,
      setRoomBlockNights: unavailable,
      pickupRoomBlock: unavailable,
      reverseRoomBlockPickup: unavailable,
      ...overrides,
    },
  }
}

function registry() {
  const registry = createToolRegistry()
  for (const tool of accommodationsTools) {
    if (tool === reverseRoomBlockPickupTool) {
      registry.register(tool, {
        actionPolicy: REVERSE_ROOM_BLOCK_PICKUP_HANDLER_POLICY.actionPolicy,
      })
    } else {
      registry.register(tool)
    }
  }
  return registry
}

const timestamp = new Date("2026-07-15T08:00:00.000Z")
const roomBlock = {
  id: "hrbl_1",
  programId: null,
  supplierId: "supp_1",
  propertyId: "prop_1",
  roomTypeId: "room_1",
  name: "Summer allocation",
  status: "inquiry",
  currency: "EUR",
  netRateCents: 8_000,
  sellRateCents: 10_000,
  optionDate: null,
  cutoffDate: "2026-08-01",
  attritionTerms: null,
  depositTerms: null,
  notes: null,
  metadata: null,
  createdAt: timestamp,
  updatedAt: timestamp,
}
const summary = {
  blockId: "hrbl_1",
  status: "inquiry",
  totalHeld: 20,
  totalPickedUp: 3,
  totalReleased: 0,
  totalRemaining: 17,
  pickupProgress: "partial",
}

describe("accommodations tools", () => {
  it("registers eight stable, typed provider-neutral capabilities", () => {
    const manifest = registry().list()
    expect(manifest.map((tool) => tool.name).sort()).toEqual([
      "create_room_block",
      "get_accommodation_content",
      "get_room_block",
      "pickup_room_block",
      "quote_owned_accommodation_stay",
      "reverse_room_block_pickup",
      "search_owned_accommodations",
      "set_room_block_nights",
    ])
    for (const tool of manifest) {
      expect(tool.capabilityId).toBe(
        `@voyant-travel/accommodations#tool.${tool.name.replaceAll("_", "-")}`,
      )
      expect(tool.owner).toBe(
        tool.name === "get_accommodation_content"
          ? "@voyant-travel/accommodations#content-extension"
          : "@voyant-travel/accommodations",
      )
      expect(tool.capabilityVersion).toBe("v1")
      expect(tool.outputSchema).not.toHaveProperty("x-voyant-schema-quality")
    }
    expect(manifest.find((tool) => tool.name === "search_owned_accommodations")?.audience).toEqual({
      source: "grant",
      allowed: ["staff", "customer"],
    })
    expect(manifest.find((tool) => tool.name === "pickup_room_block")).toMatchObject({
      tier: "write",
      requiredScopes: ["accommodations:write"],
      riskPolicy: expect.objectContaining({ confirmationRequired: true }),
    })
    expect(reverseRoomBlockPickupTool.actionPolicyEnforcement).toBe("handler")
  })

  it("returns public-safe search matches without provider economics", async () => {
    const result = await registry().dispatch<{ matches: Array<Record<string, unknown>> }>(
      "search_owned_accommodations",
      {
        destination: { city: "Bucharest" },
        checkIn: "2026-09-01",
        checkOut: "2026-09-03",
        rooms: [{ adults: 2 }],
      },
      ctx({
        async searchOwned() {
          return {
            matches: [
              {
                accommodationId: "room_1",
                roomTypeId: "room_1",
                ratePlanId: "rate_1",
                occupancy: { adults: 2 },
                price: { amount: "200.00", currency: "EUR" },
                providerData: { costAmountCents: 12_000 },
              },
            ],
          }
        },
      }),
    )
    expect(result.matches[0]).toMatchObject({ roomTypeId: "room_1", price: { amount: "200.00" } })
    expect(result.matches[0]).not.toHaveProperty("providerData")
  })

  it("returns public sell-price quotes without cost fields", async () => {
    const result = await registry().dispatch<{ nightlyRates: Array<Record<string, unknown>> }>(
      "quote_owned_accommodation_stay",
      {
        roomTypeId: "room_1",
        ratePlanId: "rate_1",
        checkIn: "2026-09-01",
        checkOut: "2026-09-02",
      },
      ctx({
        async quoteOwned() {
          return {
            status: "ok",
            available: true,
            propertyId: "prop_1",
            roomTypeId: "room_1",
            ratePlanId: "rate_1",
            mealPlanId: null,
            roomCount: 1,
            nights: 1,
            currency: "EUR",
            nightlyRates: [
              {
                date: "2026-09-01",
                sellCurrency: "EUR",
                sellAmountCents: 10_000,
                costCurrency: "EUR",
                costAmountCents: 8_000,
                taxAmountCents: null,
                feeAmountCents: null,
                occupancyBasis: "room",
                includedAdults: 2,
                includedChildren: 0,
                includedInfants: 0,
                quantity: 1,
                totalAmountCents: 10_000,
              },
            ],
            totalAmountCents: 10_000,
            availability: {
              requestedRooms: 1,
              minimumRemainingRooms: 4,
              nights: [{ date: "2026-09-01", capacity: 5, booked: 0, remaining: 5, closed: false }],
            },
          }
        },
      }),
    )
    expect(result.nightlyRates[0]).toMatchObject({ sellAmountCents: 10_000 })
    expect(result.nightlyRates[0]).not.toHaveProperty("costAmountCents")
  })

  it("normalizes room-block reads and routes lifecycle writes", async () => {
    const calls: string[] = []
    const services = ctx({
      async getRoomBlock(blockId) {
        calls.push(`get:${blockId}`)
        return { block: roomBlock, summary }
      },
      async setRoomBlockNights(input) {
        calls.push(`nights:${input.blockId}:${input.nights.length}`)
        return summary
      },
      async pickupRoomBlock(input) {
        calls.push(`pickup:${input.blockId}`)
        return { status: "block_not_active" }
      },
      async reverseRoomBlockPickup(input) {
        calls.push(`reverse:${input.blockId}`)
        return { status: "pickup_not_found" }
      },
    })
    const read = await registry().dispatch<{ block: Record<string, unknown> }>(
      "get_room_block",
      { blockId: "hrbl_1" },
      services,
    )
    expect(read.block.createdAt).toBe(timestamp.toISOString())
    await registry().dispatch(
      "set_room_block_nights",
      { blockId: "hrbl_1", nights: [{ date: "2026-09-01", roomsHeld: 10 }] },
      services,
    )
    await registry().dispatch(
      "pickup_room_block",
      { blockId: "hrbl_1", checkIn: "2026-09-01", checkOut: "2026-09-02" },
      services,
    )
    expect(calls).toEqual(["get:hrbl_1", "nights:hrbl_1:1", "pickup:hrbl_1"])
  })

  it("does not expose cutoff release or table-backed list operations", () => {
    const names = registry()
      .list()
      .map((tool) => tool.name)
    expect(names).not.toContain("release_room_block")
    expect(names).not.toContain("list_room_blocks")
  })
})
