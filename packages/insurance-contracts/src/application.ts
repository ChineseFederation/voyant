import { z } from "zod"
import { insuranceEligibilitySchema } from "./eligibility.js"
import {
  insuranceCountryCodeSchema,
  insuranceDateSchema,
  insuranceInstantSchema,
  insuranceMoneySchema,
} from "./money.js"

/**
 * A document that identifies a person to an insurer.
 *
 * There is no `nationalIdentityNumber` field here, and one must not be added.
 * Several markets have a number every citizen carries and every local system
 * has a named column for, but promoting one market's document to a named field
 * makes the contract wrong everywhere else and quietly encodes that market's
 * validation rules into a provider-neutral package. A national identity number
 * is a typed document with an issuing country, the same as a passport.
 */
export const INSURANCE_IDENTITY_DOCUMENT_TYPES = [
  "passport",
  "national_identity",
  "residence_permit",
  "driving_licence",
  "birth_certificate",
  "other",
] as const

export type InsuranceIdentityDocumentType = (typeof INSURANCE_IDENTITY_DOCUMENT_TYPES)[number]

export const insuranceIdentityDocumentSchema = z
  .object({
    type: z.enum(INSURANCE_IDENTITY_DOCUMENT_TYPES),
    number: z.string().min(1),
    issuingCountry: insuranceCountryCodeSchema,
    expiresAt: insuranceDateSchema.optional(),
  })
  .strict()

export type InsuranceIdentityDocument = z.infer<typeof insuranceIdentityDocumentSchema>

/**
 * Someone the policy covers.
 *
 * The insured set and the travelling set are not the same set. A parent may
 * insure a child who is not on the booking, and a traveller on the booking may
 * decline cover. `bookingTravelerRef` is a soft link for the cases where they do
 * coincide; it is never the identity.
 */
export const insuranceInsuredPersonSchema = z
  .object({
    ref: z.string().min(1),
    givenName: z.string().min(1),
    familyName: z.string().min(1),
    dateOfBirth: insuranceDateSchema,
    residencyCountry: insuranceCountryCodeSchema.optional(),
    identityDocuments: z.array(insuranceIdentityDocumentSchema).default([]),
    /** Ties this person to a traveller on the booking, when they are the same person. */
    bookingTravelerRef: z.string().optional(),
  })
  .strict()

export type InsuranceInsuredPerson = z.infer<typeof insuranceInsuredPersonSchema>

/**
 * Whoever is entering into the contract with the insurer, which is not
 * necessarily anyone the policy covers.
 */
export const insuranceContractingPartySchema = z
  .object({
    givenName: z.string().min(1),
    familyName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    dateOfBirth: insuranceDateSchema.optional(),
    address: z
      .object({
        line1: z.string().min(1),
        line2: z.string().optional(),
        city: z.string().min(1),
        postalCode: z.string().optional(),
        country: insuranceCountryCodeSchema,
      })
      .strict()
      .optional(),
  })
  .strict()

export type InsuranceContractingParty = z.infer<typeof insuranceContractingPartySchema>

/** A question the insurer requires answered before it will issue. */
export const insuranceQuestionSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    kind: z.enum(["boolean", "text", "number", "date", "single_choice", "multi_choice"]),
    options: z
      .array(z.object({ value: z.string().min(1), label: z.string().min(1) }).strict())
      .optional(),
    required: z.boolean(),
    /** Applies to one insured person rather than the policy as a whole. */
    perInsuredPerson: z.boolean().default(false),
    helpText: z.string().optional(),
  })
  .strict()

export type InsuranceQuestion = z.infer<typeof insuranceQuestionSchema>

export const insuranceAnswerSchema = z
  .object({
    questionId: z.string().min(1),
    /** Present when the question is per-person; the insured person's `ref`. */
    insuredPersonRef: z.string().optional(),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  })
  .strict()

export type InsuranceAnswer = z.infer<typeof insuranceAnswerSchema>

/** What a caller submits to open an application against a quote. */
export const insuranceApplicationInputSchema = z
  .object({
    quoteId: z.string().min(1),
    providerId: z.string().min(1),
    /** Optional-cover ids from the quote that the traveller chose to add. */
    selectedOptionalCoverIds: z.array(z.string().min(1)).default([]),
    insuredPersons: z.array(insuranceInsuredPersonSchema).min(1),
    contractingParty: insuranceContractingPartySchema,
    answers: z.array(insuranceAnswerSchema).default([]),
    /** `(kind, versionId)` pairs the traveller acknowledged, and when. */
    acceptedDisclosures: z
      .array(
        z
          .object({
            kind: z.string().min(1),
            versionId: z.string().min(1),
            acceptedAt: insuranceInstantSchema,
          })
          .strict(),
      )
      .default([]),
  })
  .strict()

export type InsuranceApplicationInput = z.infer<typeof insuranceApplicationInputSchema>

export const INSURANCE_APPLICATION_STATUSES = [
  "open",
  "submitted",
  "accepted",
  "declined",
  "expired",
  "withdrawn",
] as const

export type InsuranceApplicationStatus = (typeof INSURANCE_APPLICATION_STATUSES)[number]

export const insuranceApplicationStatusSchema = z.enum(INSURANCE_APPLICATION_STATUSES)

export const insuranceApplicationSchema = z
  .object({
    applicationId: z.string().min(1),
    providerId: z.string().min(1),
    quoteId: z.string().min(1),
    status: insuranceApplicationStatusSchema,
    /**
     * Insurers hold an application open for a bounded window and then require
     * it to be issued or discarded. Past this instant the application is no
     * longer a thing that can become a policy, whatever the stored status says.
     */
    expiresAt: insuranceInstantSchema,
    premium: insuranceMoneySchema,
    insuredPersons: z.array(insuranceInsuredPersonSchema).min(1),
    contractingParty: insuranceContractingPartySchema,
    /** Questions the insurer still wants answered, when it asks for more. */
    outstandingQuestions: z.array(insuranceQuestionSchema).default([]),
    answers: z.array(insuranceAnswerSchema).default([]),
    eligibility: insuranceEligibilitySchema,
    providerReference: z.string().optional(),
    createdAt: insuranceInstantSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type InsuranceApplication = z.infer<typeof insuranceApplicationSchema>

/**
 * Whether the application can still become a policy.
 *
 * Checks the window as well as the status, because an application that expired
 * five minutes ago still carries `status: "accepted"` until something notices.
 */
export function isInsuranceApplicationIssuableAt(
  application: InsuranceApplication,
  at: Date,
): boolean {
  if (application.status !== "open" && application.status !== "accepted") return false
  if (application.outstandingQuestions.some((question) => question.required)) return false
  const expiresAt = Date.parse(application.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt > at.getTime()
}
