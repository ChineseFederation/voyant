import { z } from "zod"

import {
  bookingTravelerBedPreferenceSchema,
  travelerAllocationMapSchema,
} from "./traveler-schemas.js"
import { bookingParticipantTypeSchema, bookingTravelerCategorySchema } from "./validation-shared.js"

// ---------- traveler records ----------

const travelerRecordCoreSchema = z.object({
  personId: z.string().optional().nullable(),
  participantType: bookingParticipantTypeSchema.default("traveler"),
  travelerCategory: bookingTravelerCategorySchema.optional().nullable(),
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  preferredLanguage: z.string().max(35).optional().nullable(),
  specialRequests: z.string().optional().nullable(),
  isPrimary: z.boolean().default(false),
  notes: z.string().optional().nullable(),
})

// ---------- travelers ----------

const travelerCoreSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  preferredLanguage: z.string().max(35).optional().nullable(),
  specialRequests: z.string().optional().nullable(),
  travelerCategory: bookingTravelerCategorySchema.optional().nullable(),
  isPrimary: z.boolean().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const insertTravelerSchema = travelerCoreSchema
export const updateTravelerSchema = travelerCoreSchema.partial()
export const insertTravelerRecordSchema = travelerRecordCoreSchema
export const updateTravelerRecordSchema = travelerRecordCoreSchema.partial().extend({
  participantType: bookingParticipantTypeSchema.optional(),
  isPrimary: z.boolean().optional(),
})

// ---------- traveler travel details ----------

export const upsertTravelerTravelDetailsSchema = z.object({
  nationality: z.string().max(100).optional().nullable(),
  documentType: z
    .enum(["passport", "id_card", "driver_license", "visa", "other"])
    .optional()
    .nullable(),
  documentNumber: z.string().max(255).optional().nullable(),
  documentExpiry: z.string().optional().nullable(),
  documentIssuingCountry: z.string().max(255).optional().nullable(),
  documentIssuingAuthority: z.string().max(255).optional().nullable(),
  /** Provenance pointer to the seeding `crm.person_documents` row. */
  documentPersonDocumentId: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  dietaryRequirements: z.string().optional().nullable(),
  accessibilityNeeds: z.string().optional().nullable(),
  isLeadTraveler: z.boolean().optional().nullable(),
  sharingGroupId: z.string().max(255).optional().nullable(),
  roomTypeId: z.string().max(255).optional().nullable(),
  bedPreference: bookingTravelerBedPreferenceSchema.optional().nullable(),
  allocations: travelerAllocationMapSchema.optional(),
})

// Flat shape combining plaintext traveler columns + encrypted travel-details
// fields, matching the pre-0.10 `createTravelerRecord` ergonomics. Migration
// boundary helper — see `bookingsService.createTravelerWithTravelDetails`.
export const createTravelerWithTravelDetailsSchema = travelerRecordCoreSchema.extend(
  upsertTravelerTravelDetailsSchema.shape,
)
export const updateTravelerWithTravelDetailsSchema = createTravelerWithTravelDetailsSchema
  .partial()
  .extend({
    participantType: bookingParticipantTypeSchema.optional(),
    isPrimary: z.boolean().optional(),
  })
