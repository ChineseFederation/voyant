import { z } from "zod"

const countryCodeSchema = z
  .string()
  .trim()
  .length(2)
  .transform((value) => value.toUpperCase())

export const travelDocumentTypeSchema = z.enum([
  "passport",
  "id_card",
  "residence_permit",
  "visa",
  "minor_consent",
  "other",
])

export const requiredDocumentTypeSchema = z.enum([
  "none",
  "passport",
  "id_card",
  "passport_or_id_card",
])

export const transportEligibilitySeveritySchema = z.enum(["blocking", "warning"])

export const transportEligibilityRuleSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    productId: z.string().trim().min(1).optional().nullable(),
    departureId: z.string().trim().min(1).optional().nullable(),
    destinationCountries: z.array(countryCodeSchema).min(1),
    nationalityCountries: z.array(countryCodeSchema).default([]),
    requiredDocumentType: requiredDocumentTypeSchema.default("passport"),
    minValidityDaysAfterReturn: z.number().int().min(0).default(0),
    minAge: z.number().int().min(0).optional().nullable(),
    maxAge: z.number().int().min(0).optional().nullable(),
    visaRequired: z.boolean().default(false),
    minorConsentRequired: z.boolean().default(false),
    severity: transportEligibilitySeveritySchema.default("blocking"),
    message: z.string().trim().min(1).optional().nullable(),
  })
  .refine((rule) => rule.minAge == null || rule.maxAge == null || rule.minAge <= rule.maxAge, {
    message: "minAge must be less than or equal to maxAge",
    path: ["maxAge"],
  })

export const transportEligibilityDocumentInputSchema = z.object({
  type: travelDocumentTypeSchema,
  issuingCountry: countryCodeSchema.optional().nullable(),
  expiresOn: z.string().date().optional().nullable(),
})

export const transportEligibilityTravelerInputSchema = z.object({
  travelerRef: z.string().trim().min(1),
  nationalityCountry: countryCodeSchema.optional().nullable(),
  dateOfBirth: z.string().date().optional().nullable(),
  documents: z.array(transportEligibilityDocumentInputSchema).default([]),
  hasVisa: z.boolean().default(false),
  travelingWithGuardian: z.boolean().default(false),
  hasMinorConsent: z.boolean().default(false),
})

export const transportEligibilityInputSchema = z.object({
  travelStartsOn: z.string().date().optional().nullable(),
  travelEndsOn: z.string().date().optional().nullable(),
  travelers: z.array(transportEligibilityTravelerInputSchema).min(1),
})

export const transportEligibilityIssueCodeSchema = z.enum([
  "date_of_birth_required",
  "document_required",
  "document_expiry_required",
  "document_validity",
  "nationality_required",
  "visa_required",
  "minor_consent_required",
  "travel_dates_required",
])

export const transportEligibilityIssueSchema = z.object({
  code: transportEligibilityIssueCodeSchema,
  severity: transportEligibilitySeveritySchema,
  message: z.string(),
  travelerRef: z.string(),
  ruleId: z.string(),
  destinationCountries: z.array(countryCodeSchema),
  requiredDocumentType: requiredDocumentTypeSchema,
})

export const transportEligibilityTravelerResultSchema = z.object({
  travelerRef: z.string(),
  eligible: z.boolean(),
  matchedRuleIds: z.array(z.string()),
  blockingIssues: z.array(transportEligibilityIssueSchema),
  warnings: z.array(transportEligibilityIssueSchema),
})

export const transportEligibilityResultSchema = z.object({
  departureId: z.string(),
  productId: z.string().nullable(),
  travelStartsOn: z.string().nullable(),
  travelEndsOn: z.string().nullable(),
  eligible: z.boolean(),
  blockingIssues: z.array(transportEligibilityIssueSchema),
  warnings: z.array(transportEligibilityIssueSchema),
  travelers: z.array(transportEligibilityTravelerResultSchema),
})

export type TransportEligibilityInput = z.infer<typeof transportEligibilityInputSchema>
export type TransportEligibilityRule = z.infer<typeof transportEligibilityRuleSchema>
export type TransportEligibilityRuleInput = z.input<typeof transportEligibilityRuleSchema>
export type TransportEligibilityIssue = z.infer<typeof transportEligibilityIssueSchema>
export type TransportEligibilityResult = z.infer<typeof transportEligibilityResultSchema>
