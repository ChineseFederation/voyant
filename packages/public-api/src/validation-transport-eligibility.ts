import { z } from "zod"

const countryCodeSchema = z
  .string()
  .trim()
  .length(2)
  .transform((value) => value.toUpperCase())

export const publicApiTravelDocumentTypeSchema = z.enum([
  "passport",
  "id_card",
  "residence_permit",
  "visa",
  "minor_consent",
  "other",
])

export const publicApiRequiredDocumentTypeSchema = z.enum([
  "none",
  "passport",
  "id_card",
  "passport_or_id_card",
])

export const publicApiTransportEligibilitySeveritySchema = z.enum(["blocking", "warning"])

export const publicApiTransportEligibilityRuleSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    productId: z.string().trim().min(1).optional().nullable(),
    departureId: z.string().trim().min(1).optional().nullable(),
    destinationCountries: z.array(countryCodeSchema).min(1),
    nationalityCountries: z.array(countryCodeSchema).default([]),
    requiredDocumentType: publicApiRequiredDocumentTypeSchema.default("passport"),
    minValidityDaysAfterReturn: z.number().int().min(0).default(0),
    minAge: z.number().int().min(0).optional().nullable(),
    maxAge: z.number().int().min(0).optional().nullable(),
    visaRequired: z.boolean().default(false),
    minorConsentRequired: z.boolean().default(false),
    severity: publicApiTransportEligibilitySeveritySchema.default("blocking"),
    message: z.string().trim().min(1).optional().nullable(),
  })
  .refine((rule) => rule.minAge == null || rule.maxAge == null || rule.minAge <= rule.maxAge, {
    message: "minAge must be less than or equal to maxAge",
    path: ["maxAge"],
  })

export const publicApiTransportEligibilityDocumentInputSchema = z.object({
  type: publicApiTravelDocumentTypeSchema,
  issuingCountry: countryCodeSchema.optional().nullable(),
  expiresOn: z.string().date().optional().nullable(),
})

export const publicApiTransportEligibilityTravelerInputSchema = z.object({
  travelerRef: z.string().trim().min(1),
  nationalityCountry: countryCodeSchema.optional().nullable(),
  dateOfBirth: z.string().date().optional().nullable(),
  documents: z.array(publicApiTransportEligibilityDocumentInputSchema).default([]),
  hasVisa: z.boolean().default(false),
  travelingWithGuardian: z.boolean().default(false),
  hasMinorConsent: z.boolean().default(false),
})

export const publicApiTransportEligibilityInputSchema = z.object({
  travelStartsOn: z.string().date().optional().nullable(),
  travelEndsOn: z.string().date().optional().nullable(),
  travelers: z.array(publicApiTransportEligibilityTravelerInputSchema).min(1),
})

export const publicApiTransportEligibilityIssueCodeSchema = z.enum([
  "date_of_birth_required",
  "document_required",
  "document_expiry_required",
  "document_validity",
  "nationality_required",
  "visa_required",
  "minor_consent_required",
  "travel_dates_required",
])

export const publicApiTransportEligibilityIssueSchema = z.object({
  code: publicApiTransportEligibilityIssueCodeSchema,
  severity: publicApiTransportEligibilitySeveritySchema,
  message: z.string(),
  travelerRef: z.string(),
  ruleId: z.string(),
  destinationCountries: z.array(countryCodeSchema),
  requiredDocumentType: publicApiRequiredDocumentTypeSchema,
})

export const publicApiTransportEligibilityTravelerResultSchema = z.object({
  travelerRef: z.string(),
  eligible: z.boolean(),
  matchedRuleIds: z.array(z.string()),
  blockingIssues: z.array(publicApiTransportEligibilityIssueSchema),
  warnings: z.array(publicApiTransportEligibilityIssueSchema),
})

export const publicApiTransportEligibilityResultSchema = z.object({
  departureId: z.string(),
  productId: z.string().nullable(),
  travelStartsOn: z.string().nullable(),
  travelEndsOn: z.string().nullable(),
  eligible: z.boolean(),
  blockingIssues: z.array(publicApiTransportEligibilityIssueSchema),
  warnings: z.array(publicApiTransportEligibilityIssueSchema),
  travelers: z.array(publicApiTransportEligibilityTravelerResultSchema),
})

export type PublicApiTransportEligibilityInput = z.infer<
  typeof publicApiTransportEligibilityInputSchema
>
export type PublicApiTransportEligibilityRule = z.infer<
  typeof publicApiTransportEligibilityRuleSchema
>
export type PublicApiTransportEligibilityRuleInput = z.input<
  typeof publicApiTransportEligibilityRuleSchema
>
export type PublicApiTransportEligibilityIssue = z.infer<
  typeof publicApiTransportEligibilityIssueSchema
>
export type PublicApiTransportEligibilityResult = z.infer<
  typeof publicApiTransportEligibilityResultSchema
>
