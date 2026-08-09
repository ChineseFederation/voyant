import { describe, expect, it } from "vitest"

import type { FlightOffer } from "../contract/types.js"
import {
  FLIGHTS_ENTITY_MODULE,
  mergedFlightOffersToCandidates,
  mergedFlightOfferToCandidate,
} from "./availability-bridge.js"
import type { MergedFlightOffer } from "./fan-out.js"

function offer(overrides: Partial<FlightOffer> = {}): FlightOffer {
  return {
    offerId: overrides.offerId ?? "ofr_1",
    source: overrides.source ?? "conn_amadeus",
    itineraries: [],
    fareBreakdowns: [],
    totalPrice: overrides.totalPrice ?? { amount: "600", currency: "USD" },
    ...overrides,
  }
}

function merged(overrides: Partial<MergedFlightOffer> = {}): MergedFlightOffer {
  return {
    itineraryFingerprint: overrides.itineraryFingerprint ?? "fp_lhr_jfk",
    cheapest: overrides.cheapest ?? offer(),
    cheapestSourceConnectionId:
      overrides.cheapestSourceConnectionId ?? overrides.sourceConnectionIds?.[0] ?? "conn_amadeus",
    alternates: overrides.alternates ?? [],
    alternateSourceConnectionIds: overrides.alternateSourceConnectionIds ?? [],
    sourceConnectionIds: overrides.sourceConnectionIds ?? ["conn_amadeus"],
  }
}

describe("mergedFlightOfferToCandidate", () => {
  it("maps a merged offer onto a normalized candidate", () => {
    const candidate = mergedFlightOfferToCandidate(
      merged({
        cheapest: offer({
          offerId: "ofr_99",
          expiresAt: "2026-10-15T10:00:00Z",
          providerData: { fareKey: "abc" },
        }),
        alternates: [offer({ offerId: "ofr_alt" })],
        cheapestSourceConnectionId: "conn_amadeus",
        alternateSourceConnectionIds: ["conn_sabre"],
        sourceConnectionIds: ["conn_amadeus", "conn_sabre"],
      }),
    )

    expect(candidate.entity_module).toBe(FLIGHTS_ENTITY_MODULE)
    expect(candidate.entity_id).toBe("ofr_99")
    expect(candidate.candidateRef).toBe("fp_lhr_jfk")
    expect(candidate.price).toEqual({ amount: "600", currency: "USD" })
    expect(candidate.selection).toMatchObject({
      offerId: "ofr_99",
      connectionId: "conn_amadeus",
    })
    expect(candidate.expiresAt).toEqual(new Date("2026-10-15T10:00:00Z"))
    expect(candidate.providerData).toMatchObject({ fareKey: "abc", alternateCount: 1 })
  })

  it("leaves expiresAt undefined when the offer has none", () => {
    expect(mergedFlightOfferToCandidate(merged()).expiresAt).toBeUndefined()
  })

  it("maps a list preserving rank order", () => {
    const candidates = mergedFlightOffersToCandidates([
      merged({ itineraryFingerprint: "fp_a", cheapest: offer({ offerId: "a" }) }),
      merged({ itineraryFingerprint: "fp_b", cheapest: offer({ offerId: "b" }) }),
    ])
    expect(candidates.map((c) => c.entity_id)).toEqual(["a", "b"])
  })
})
