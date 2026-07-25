import { z } from "zod"

import type { ExternalPassengerComposition, SourceRef } from "./adapters/index.js"
import { encodeSourceRef } from "./lib/key.js"
import type {
  CreateCruiseBookingInput,
  CreateCruisePartyBookingInput,
} from "./service-booking-types.js"

export const createBookingPayloadSchema = z.object({
  sailingId: z.string(),
  cabinCategoryId: z.string(),
  cabinCategoryRef: z.record(z.string(), z.unknown()).optional().nullable(),
  cabinId: z.string().optional().nullable(),
  occupancy: z.number().int().min(1).max(8),
  passengerComposition: passengerCompositionSchema().optional().nullable(),
  fareCode: z.string().optional().nullable(),
  fareVariant: z.enum(["cruise_only", "air_inclusive"]).optional().nullable(),
  mode: z.enum(["inquiry", "reserve"]).optional(),
  personId: z.string().optional().nullable(),
  organizationId: z.string().optional().nullable(),
  contact: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    language: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    region: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    postalCode: z.string().optional().nullable(),
  }),
  passengers: z
    .array(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email().optional().nullable(),
        phone: z.string().optional().nullable(),
        travelerCategory: z
          .enum(["adult", "child", "infant", "senior", "other"])
          .optional()
          .nullable(),
        preferredLanguage: z.string().optional().nullable(),
        specialRequests: z.string().optional().nullable(),
        personId: z.string().optional().nullable(),
        isPrimary: z.boolean().optional(),
        notes: z.string().optional().nullable(),
      }),
    )
    .min(1),
  notes: z.string().optional().nullable(),
}) satisfies z.ZodType<CreateCruiseBookingInput>

export const createPartyBookingPayloadSchema = z.object({
  sailingId: z.string(),
  cabins: z
    .array(
      z.object({
        cabinCategoryId: z.string(),
        cabinId: z.string().optional().nullable(),
        occupancy: z.number().int().min(1).max(8),
        fareCode: z.string().optional().nullable(),
        fareVariant: z.enum(["cruise_only", "air_inclusive"]).optional().nullable(),
        passengers: z
          .array(
            z.object({
              firstName: z.string().min(1),
              lastName: z.string().min(1),
              email: z.string().email().optional().nullable(),
              phone: z.string().optional().nullable(),
              travelerCategory: z
                .enum(["adult", "child", "infant", "senior", "other"])
                .optional()
                .nullable(),
              preferredLanguage: z.string().optional().nullable(),
              specialRequests: z.string().optional().nullable(),
              personId: z.string().optional().nullable(),
              isPrimary: z.boolean().optional(),
              notes: z.string().optional().nullable(),
            }),
          )
          .min(1),
        notes: z.string().optional().nullable(),
      }),
    )
    .min(2)
    .max(20),
  leadPersonId: z.string().optional().nullable(),
  organizationId: z.string().optional().nullable(),
  contact: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    language: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    region: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    postalCode: z.string().optional().nullable(),
  }),
  mode: z.enum(["inquiry", "reserve"]).optional(),
  label: z.string().optional(),
  notes: z.string().optional().nullable(),
}) satisfies z.ZodType<CreateCruisePartyBookingInput>

export const quotePayloadSchema = z.object({
  cabinCategoryId: z.string(),
  cabinCategoryRef: z.record(z.string(), z.unknown()).optional().nullable(),
  occupancy: z.number().int().min(1).max(8),
  guestCount: z.number().int().min(1).max(8).optional(),
  passengerComposition: passengerCompositionSchema().optional().nullable(),
  fareCode: z.string().optional().nullable(),
  fareVariant: z.enum(["cruise_only", "air_inclusive"]).optional().nullable(),
})

function passengerCompositionSchema() {
  return z
    .object({
      adults: z.number().int().min(0),
      children: z.number().int().min(0).optional(),
      childAges: z.array(z.number().int().min(0).max(17)).optional(),
      infants: z.number().int().min(0).optional(),
      seniors: z.number().int().min(0).optional(),
    })
    .catchall(z.unknown())
    .refine(
      (value) =>
        value.adults + (value.children ?? 0) + (value.infants ?? 0) + (value.seniors ?? 0) > 0,
      "passengerComposition must include at least one passenger",
    )
}

export function passengerCountFromComposition(
  composition: ExternalPassengerComposition | null | undefined,
): number | null {
  if (!composition) return null
  return (
    composition.adults +
    (composition.children ?? 0) +
    (composition.infants ?? 0) +
    (composition.seniors ?? 0)
  )
}

export function sourceRefFromPayload(
  maybeRef: Record<string, unknown> | null | undefined,
  externalId: string,
): SourceRef {
  if (maybeRef && typeof maybeRef.externalId === "string") return maybeRef as SourceRef
  return { externalId }
}

export function sourceRefMatches(candidate: SourceRef, requested: SourceRef): boolean {
  if (encodeSourceRef(candidate) === encodeSourceRef(requested)) return true
  const candidateIsLegacy = Object.keys(candidate).length === 1
  const requestedIsLegacy = Object.keys(requested).length === 1
  return (candidateIsLegacy || requestedIsLegacy) && candidate.externalId === requested.externalId
}

export function passengerCompositionMatches(
  candidate: ExternalPassengerComposition | null | undefined,
  requested: ExternalPassengerComposition | null | undefined,
): boolean {
  if (!requested || !candidate) return true
  return (
    encodeSourceRef({
      externalId: "composition",
      ...candidate,
    }) === encodeSourceRef({ externalId: "composition", ...requested })
  )
}
