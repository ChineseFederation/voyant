/**
 * Project a `AccommodationContent` payload into a `BookingRequirementsV1`.
 *
 * Hotel / room-type bookings need:
 *   - Configure: date-range (check-in → check-out) + occupancy.
 *   - Accommodation: room selection — the journey's
 *     `accommodation.subSteps` rooms variant, populated from
 *     `content.room_types[]`.
 *   - Add-ons: meal plans + amenities surfaced as upsells (when the
 *     supplier prices them as add-ons; otherwise they're informational).
 *
 * Pricing flows through liveResolve at quote time per night /
 * occupancy / rate-plan.
 */

import {
  type BookingRequirementsV1,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
  type PaxBandSpecV1,
  paxBandsAllowedTotalFrom,
  type RatePlanOptionV1,
  type RoomOptionV1,
} from "@voyant-travel/catalog/booking-engine"

import type { AccommodationContent } from "./content-shape.js"

export const DEFAULT_ACCOMMODATION_PAX_BANDS: PaxBandSpecV1[] = [
  { code: "adult", label: "Adult", minCount: 1, maxCount: 6 },
  { code: "child", label: "Child", minAge: 0, maxAge: 17, minCount: 0, maxCount: 4 },
]

export interface BuildAccommodationRequirementsOptions {
  locale?: string
  paxBands?: PaxBandSpecV1[]
  paxBandsAllowedTotal?: { min: number; max: number }
  /**
   * Default minimum-nights window. Most bedbanks accept 1–30 nights;
   * templates override per supplier when known.
   */
  minNights?: number
  maxNights?: number
  /** When true, the wizard allows multiple guests sharing one room. */
  sharedRoomAllowed?: boolean
}

export function buildAccommodationRequirements(
  content: AccommodationContent,
  options: BuildAccommodationRequirementsOptions = {},
): BookingRequirementsV1 {
  const paxBands = options.paxBands ?? DEFAULT_ACCOMMODATION_PAX_BANDS
  const total = options.paxBandsAllowedTotal ?? paxBandsAllowedTotalFrom(paxBands)
  const minNights = options.minNights ?? 1
  const maxNights = options.maxNights ?? 30
  const sharedRoomAllowed = options.sharedRoomAllowed ?? true

  // Project each rate plan once. The journey filters per-room based
  // on `applies_to_room_type_ids` (empty = applies to all rooms).
  const planByRoom = new Map<string, RatePlanOptionV1[]>()
  for (const rt of content.room_types) {
    planByRoom.set(rt.id, [])
  }
  for (const plan of content.rate_plans) {
    const rooms =
      plan.applies_to_room_type_ids.length === 0
        ? content.room_types.map((r) => r.id)
        : plan.applies_to_room_type_ids
    const planOption: RatePlanOptionV1 = {
      id: plan.id,
      name: plan.name,
      description: plan.description ?? null,
      chargeFrequency: plan.charge_frequency,
      cancellationPolicy: plan.cancellation_policy ?? null,
      inclusions: plan.inclusions,
    }
    for (const roomId of rooms) {
      const list = planByRoom.get(roomId)
      if (list) list.push(planOption)
    }
  }

  const roomOptions: RoomOptionV1[] = content.room_types.map((rt) => ({
    id: rt.id,
    name: rt.name,
    description: rt.description ?? null,
    capacity: rt.max_occupancy ?? rt.max_adults ?? null,
    baseRateHint: null,
    ratePlans: planByRoom.get(rt.id) ?? [],
  }))

  return {
    ...defaultRequirementsFlags(),
    showsAccommodation: roomOptions.length > 0,
    paxBands,
    paxBandsAllowedTotal: total,
    travelerFields: defaultTravelerFields(),
    bookingFields: defaultBookingFields(),
    configureSubSteps: [
      { kind: "date-range", minNights, maxNights },
      { kind: "occupancy", bands: paxBands },
    ],
    accommodation:
      roomOptions.length > 0
        ? {
            roomOptions,
            sharedRoomAllowed,
            subSteps: [
              {
                kind: "rooms",
                options: roomOptions,
                sharedRoomAllowed,
              },
            ],
          }
        : undefined,
    paymentIntents: ["hold", "card"],
  }
}
