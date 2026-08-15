import { describe, expect, it } from "vitest"

import type { DepartureCapacityCounters } from "../../../src/availability/service-departure-capacity.js"
import { evaluateDepartureIssues } from "../../../src/availability/service-departure-issues.js"

/**
 * The rooming/seating issues, and the departure that has no rooming plan to be
 * short of.
 *
 * A day excursion has no rooms, no seat map and no resource templates, so every
 * seat-shaped counter on it is structurally zero. Before `resources.planned`,
 * the evaluator read that zero as a shortfall and every such departure carried
 * a permanent `allocation_resources_missing` warning — a detector that fires on
 * a state nobody can repair is how operators learn to ignore the whole list.
 *
 * Both halves matter here: the excursion stays quiet, and a departure whose
 * catalog DOES declare resources still gets told when they are missing.
 */

function counters(overrides: {
  travelersEntered?: number
  travelersAssigned?: number
  resourcesTotal?: number
  resourcesSeating?: number
  templated?: number
}): DepartureCapacityCounters {
  const entered = overrides.travelersEntered ?? 0
  const assigned = overrides.travelersAssigned ?? 0
  const total = overrides.resourcesTotal ?? 0
  const seating = overrides.resourcesSeating ?? total
  const templated = overrides.templated ?? 0

  return {
    slotId: "slot_1",
    unlimited: false,
    initialPax: null,
    effectivePax: null,
    remainingPax: null,
    derivedRemainingPax: null,
    derivedConsumedPax: 0,
    holds: { active: 0, activePax: 0, expired: 0, expiredPax: 0, released: 0, converted: 0 },
    allocations: {
      held: 0,
      confirmed: 0,
      fulfilled: 0,
      staleHeld: 0,
      released: 0,
      expired: 0,
      cancelled: 0,
      active: 0,
      inactive: 0,
    },
    bookings: {
      active: 1,
      cancelledWithLiveAllocation: 0,
      expectedPax: entered,
      byStatus: { confirmed: 1 },
    },
    travelers: {
      entered,
      lead: entered > 0 ? 1 : 0,
      assigned,
      unassigned: Math.max(0, entered - assigned),
      missing: 0,
    },
    resources: {
      total,
      templated,
      seating,
      capacity: seating * 2,
      assigned,
      available: Math.max(0, seating * 2 - assigned),
      overCapacity: 0,
      planned: total > 0 || templated > 0,
    },
    resourceBreakdown: [],
  }
}

const evaluate = (input: Parameters<typeof counters>[0]) =>
  evaluateDepartureIssues({
    slotId: "slot_1",
    productVersionId: "pver_1",
    counters: counters(input),
    staleHeldAllocationIds: [],
    cancelledBookingIds: [],
  }).map((issue) => issue.code)

describe("evaluateDepartureIssues — the rooming plan a departure does not have", () => {
  it("says nothing about rooms on a departure that allocates none", () => {
    // A day excursion: 13 names, no resources, no templates declaring any.
    const codes = evaluate({ travelersEntered: 13 })

    expect(codes).not.toContain("allocation_resources_missing")
    expect(codes).not.toContain("travelers_unassigned")
    expect(codes).toEqual([])
  })

  it("still reports missing resources when the catalog declares templates", () => {
    const codes = evaluate({ travelersEntered: 13, templated: 3 })

    expect(codes).toContain("allocation_resources_missing")
  })

  it("still reports missing resources once some are laid out but nothing seats", () => {
    // A parent-only layout (a vehicle with no seat children) seats nobody.
    const codes = evaluate({ travelersEntered: 4, resourcesTotal: 1, resourcesSeating: 0 })

    expect(codes).toContain("allocation_resources_missing")
  })

  it("reports unseated travelers once the departure has somewhere to seat them", () => {
    const codes = evaluate({ travelersEntered: 4, travelersAssigned: 1, resourcesTotal: 2 })

    expect(codes).toContain("travelers_unassigned")
    expect(codes).not.toContain("allocation_resources_missing")
  })

  it("clears once every traveler holds an assignment", () => {
    const codes = evaluate({ travelersEntered: 4, travelersAssigned: 4, resourcesTotal: 2 })

    expect(codes).toEqual([])
  })
})
