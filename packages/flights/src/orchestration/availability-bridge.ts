/**
 * Flights → AvailabilityCandidate bridge.
 *
 * Maps the flights-native `MergedFlightOffer` (produced by `fanOutFlightSearch`)
 * onto the vertical-agnostic `AvailabilityCandidate` the dynamic-packaging
 * composer ranks. This is a mapping, NOT proof that flights already satisfy the
 * generic source-adapter contract — flights keep their own connector contract
 * and fan-out; this only normalizes the result shape.
 *
 * See `docs/architecture/dynamic-packaging-rfc.md` §2 (Gap 1) and §4.
 */

import type { AvailabilityCandidate } from "@voyant-travel/catalog-contracts"
import type { MergedFlightOffer } from "./fan-out.js"

/** Vertical key flights candidates carry. */
export const FLIGHTS_ENTITY_MODULE = "flights" as const

/**
 * Convert one merged flight offer into a normalized availability candidate.
 *
 * The candidate's `selection` carries what the flights booking path needs to
 * re-resolve and price the exact offer at reserve time (offer id + source +
 * its exact owning connection). The per-search `offerId` is not
 * replay-safe, so callers re-price before booking — same rule as the generic
 * `AvailabilityCandidate.candidateRef`.
 */
export function mergedFlightOfferToCandidate(merged: MergedFlightOffer): AvailabilityCandidate {
  const offer = merged.cheapest
  return {
    candidateRef: merged.itineraryFingerprint,
    entity_module: FLIGHTS_ENTITY_MODULE,
    entity_id: offer.offerId,
    selection: {
      offerId: offer.offerId,
      source: offer.source,
      itineraryFingerprint: merged.itineraryFingerprint,
      connectionId: merged.cheapestSourceConnectionId,
    },
    price: { amount: offer.totalPrice.amount, currency: offer.totalPrice.currency },
    expiresAt: offer.expiresAt ? new Date(offer.expiresAt) : undefined,
    providerData: {
      sourceConnectionIds: merged.sourceConnectionIds,
      alternateCount: merged.alternates.length,
      ...offer.providerData,
    },
  }
}

/** Convenience: map a whole fan-out result set to candidates, preserving rank. */
export function mergedFlightOffersToCandidates(
  merged: ReadonlyArray<MergedFlightOffer>,
): AvailabilityCandidate[] {
  return merged.map(mergedFlightOfferToCandidate)
}
