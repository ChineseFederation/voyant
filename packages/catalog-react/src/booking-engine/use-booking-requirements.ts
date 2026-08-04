"use client"

import { bookingRequirementsV1 } from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import type { BookingRequirementsV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-contracts"

import type { BookingJourneyApiOptions } from "./use-booking-journey-api.js"

export interface UseBookingRequirementsOptions extends BookingJourneyApiOptions {
  /**
   * Anything that publishes Booking Requirements: a Session record
   * (`useBookingSession().session`), a Quote (`useBookingQuote().data`), or an
   * Offer Preview result (`useOfferPreview().data`). All three carry
   * `requirements`; `shape` is the beta quote's spelling, still read so a
   * half-migrated host keeps rendering.
   */
  quote: { requirements?: BookingRequirementsV1; shape?: BookingRequirementsV1 } | null
  /** Fallback shape rendered before the first descriptor lands — the
   *  journey shell uses this so the wizard renders an empty Configure
   *  step on first paint. */
  fallback: BookingRequirementsV1
}

/**
 * Convenience accessor that returns the descriptor a Session, Quote or Offer
 * Preview carries — or a caller-supplied fallback while we wait for the first
 * one. Per booking-journey-architecture §3 + §8.1.
 */
export function useBookingRequirements(
  options: UseBookingRequirementsOptions,
): BookingRequirementsV1 {
  return normalizeBookingRequirements(
    options.quote?.requirements ?? options.quote?.shape,
    options.fallback,
  )
}

/**
 * Quote descriptors cross adapter and JSON boundaries. Validate against the
 * public contract before rendering so a missing/malformed descriptor degrades
 * to the fallback instead of crashing when journey code reads sub-step `kind`.
 */
export function normalizeBookingRequirements(
  shape: unknown,
  fallback: BookingRequirementsV1,
): BookingRequirementsV1 {
  const shapeRecord = asRecord(shape)
  if (!shapeRecord) return fallback

  const fallbackParsed = bookingRequirementsV1.safeParse(fallback)
  const safeFallback = fallbackParsed.success ? fallbackParsed.data : fallback
  const parsed = bookingRequirementsV1.safeParse({
    ...safeFallback,
    ...stripMalformedSubSteps(shapeRecord),
    showsReview: true,
  })
  return parsed.success ? parsed.data : safeFallback
}

function stripMalformedSubSteps(shape: Record<string, unknown>): Record<string, unknown> {
  const accommodation = asRecord(shape.accommodation)
  return {
    ...shape,
    ...(Array.isArray(shape.configureSubSteps)
      ? {
          configureSubSteps: shape.configureSubSteps.filter(isKindedRecord),
        }
      : {}),
    ...(accommodation && Array.isArray(accommodation.subSteps)
      ? {
          accommodation: {
            ...accommodation,
            subSteps: accommodation.subSteps.filter(isKindedRecord),
          },
        }
      : {}),
  }
}

function isKindedRecord(value: unknown): value is { kind: string } {
  const record = asRecord(value)
  return typeof record?.kind === "string"
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
