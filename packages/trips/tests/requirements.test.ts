import type { AvailabilityCandidate } from "@voyant-travel/catalog-contracts"
import { describe, expect, it } from "vitest"

import { isCatalogBackedTripComponent } from "../src/catalog-component-adapter.js"
import type { TripCandidate, TripComponent, TripRequirement } from "../src/schema.js"
import {
  assertCandidateSelectable,
  assertRequiredRequirementsResolved,
  availabilityCandidateToRow,
  isTripCandidateExpired,
  pinnedComponentValuesFromCandidate,
  TripsInvariantError,
} from "../src/service.js"

function requirement(overrides: Partial<TripRequirement> = {}): TripRequirement {
  return {
    id: "trrq_1",
    envelopeId: "trip_1",
    sequence: 0,
    status: "open",
    title: null,
    description: null,
    vertical: "accommodations",
    criteria: {},
    criteriaVersion: "accommodations/v1",
    required: true,
    selectedCandidateId: null,
    resolvedComponentId: null,
    lastSourcedAt: null,
    metadata: {},
    createdAt: new Date("2026-06-22T00:00:00Z"),
    updatedAt: new Date("2026-06-22T00:00:00Z"),
    ...overrides,
  }
}

function candidate(overrides: Partial<TripCandidate> = {}): TripCandidate {
  return {
    id: "trcd_1",
    requirementId: "trrq_1",
    envelopeId: "trip_1",
    rank: 0,
    status: "ranked",
    candidateRef: "ref_1",
    entityModule: "accommodations",
    entityId: "acc_1",
    sourceKind: "direct:tui",
    sourceConnectionId: "conn_a",
    sourceModule: null,
    selection: { ratePlanId: "rate_1" },
    priceCurrency: "USD",
    priceAmount: "200.00",
    expiresAt: null,
    providerData: {
      _voyantSourceProvider: "direct:tui",
      _voyantSourceRef: "hotel_1",
    },
    createdAt: new Date("2026-06-22T00:00:00Z"),
    updatedAt: new Date("2026-06-22T00:00:00Z"),
    ...overrides,
  }
}

describe("assertRequiredRequirementsResolved (reserve gate)", () => {
  it("passes when all required requirements are selected", () => {
    expect(() =>
      assertRequiredRequirementsResolved([
        requirement({ required: true, status: "selected" }),
        requirement({ id: "trrq_2", required: false, status: "candidates_ready" }),
      ]),
    ).not.toThrow()
  })

  it("throws when a required requirement is unresolved", () => {
    expect(() =>
      assertRequiredRequirementsResolved([
        requirement({ id: "trrq_2", required: true, status: "candidates_ready" }),
      ]),
    ).toThrow(TripsInvariantError)
  })

  it("ignores unresolved optional requirements", () => {
    expect(() =>
      assertRequiredRequirementsResolved([requirement({ required: false, status: "open" })]),
    ).not.toThrow()
  })
})

describe("candidate selectability + expiry", () => {
  const now = new Date("2026-06-22T12:00:00Z")

  it("treats a candidate past its TTL as expired", () => {
    expect(isTripCandidateExpired({ expiresAt: new Date("2026-06-22T11:00:00Z") }, now)).toBe(true)
    expect(isTripCandidateExpired({ expiresAt: new Date("2026-06-22T13:00:00Z") }, now)).toBe(false)
    expect(isTripCandidateExpired({ expiresAt: null }, now)).toBe(false)
  })

  it("rejects an expired or discarded candidate", () => {
    expect(() => assertCandidateSelectable(candidate({ status: "expired" }), now)).toThrow(
      TripsInvariantError,
    )
    expect(() => assertCandidateSelectable(candidate({ status: "discarded" }), now)).toThrow(
      TripsInvariantError,
    )
    expect(() =>
      assertCandidateSelectable(candidate({ expiresAt: new Date("2026-06-22T11:00:00Z") }), now),
    ).toThrow(TripsInvariantError)
  })

  it("accepts a live ranked candidate", () => {
    expect(() =>
      assertCandidateSelectable(candidate({ expiresAt: new Date("2026-06-22T18:00:00Z") }), now),
    ).not.toThrow()
  })
})

describe("availabilityCandidateToRow", () => {
  const base: AvailabilityCandidate = {
    candidateRef: "ref_42",
    entity_module: "accommodations",
    entity_id: "acc_42",
    selection: { roomTypeId: "rt", ratePlanId: "rp" },
    price: { amount: "349.95", currency: "EUR" },
  }

  it("maps a sourced candidate, carrying connection origin + exact price", () => {
    const row = availabilityCandidateToRow({
      requirementId: "trrq_9",
      envelopeId: "trip_9",
      candidate: {
        ...base,
        source: {
          kind: "sourced",
          connectionId: "conn_x",
          sourceKind: "voyant-connect",
          sourceProvider: "tui",
          sourceRef: "hotel_42",
        },
        expiresAt: new Date("2026-06-22T13:00:00Z"),
      },
      rank: 3,
    })
    expect(row).toMatchObject({
      requirementId: "trrq_9",
      envelopeId: "trip_9",
      rank: 3,
      status: "ranked",
      candidateRef: "ref_42",
      entityModule: "accommodations",
      entityId: "acc_42",
      sourceKind: "voyant-connect",
      sourceConnectionId: "conn_x",
      sourceModule: null,
      priceCurrency: "EUR",
      priceAmount: "349.95",
      providerData: {
        _voyantSourceProvider: "tui",
        _voyantSourceRef: "hotel_42",
      },
    })
  })

  it("maps an owned candidate to module origin", () => {
    const row = availabilityCandidateToRow({
      requirementId: "trrq_9",
      envelopeId: "trip_9",
      candidate: { ...base, source: { kind: "owned", module: "accommodations" } },
      rank: 0,
    })
    expect(row.sourceKind).toBe("owned")
    expect(row.sourceModule).toBe("accommodations")
    expect(row.sourceConnectionId).toBeNull()
  })
})

describe("pinnedComponentValuesFromCandidate", () => {
  it("pins an unpriced draft catalog component carrying selection + origin", () => {
    const values = pinnedComponentValuesFromCandidate(candidate(), 2)
    expect(values).toMatchObject({
      envelopeId: "trip_1",
      sequence: 2,
      kind: "catalog_booking",
      status: "draft",
      entityModule: "accommodations",
      entityId: "acc_1",
      sourceKind: "direct:tui",
      sourceConnectionId: "conn_a",
      sourceRef: "hotel_1",
      componentCurrency: "USD",
    })
    expect(values.metadata).toMatchObject({
      resolvedFromCandidateId: "trcd_1",
      candidateRef: "ref_1",
      selection: { ratePlanId: "rate_1" },
      sourceProvider: "direct:tui",
    })
  })

  it("sets sourceKind so the pinned component is catalog-backed (priced, not placeholder)", () => {
    // Regression: a pinned component without sourceKind falls through to
    // placeholder pricing → `unavailable`. It must be routed via the catalog path.
    const sourced = pinnedComponentValuesFromCandidate(candidate(), 0)
    expect(isCatalogBackedTripComponent(sourced as TripComponent)).toBe(true)

    const owned = pinnedComponentValuesFromCandidate(
      candidate({ sourceKind: "owned", sourceConnectionId: null, sourceModule: "accommodations" }),
      0,
    )
    expect(owned.sourceKind).toBe("owned") // routes to the owned handler
    expect(isCatalogBackedTripComponent(owned as TripComponent)).toBe(true)
  })
})
