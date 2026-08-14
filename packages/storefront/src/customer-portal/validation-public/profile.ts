import { emailAddress } from "@voyant-travel/schema-kit/email"
import { z } from "zod"

import {
  customerPortalAddressLabelSchema,
  customerPortalCompanionDocumentTypeSchema,
  customerPortalProfileDocumentTypeSchema,
  seatingPreferenceSchema,
} from "./common.js"

export const customerPortalAddressSchema = z.object({
  id: z.string(),
  label: customerPortalAddressLabelSchema,
  fullText: z.string().nullable(),
  line1: z.string().nullable(),
  line2: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  isPrimary: z.boolean(),
})

export const updateCustomerPortalAddressSchema = z
  .object({
    label: customerPortalAddressLabelSchema.optional(),
    fullText: z.string().nullable().optional(),
    line1: z.string().nullable().optional(),
    line2: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
    postalCode: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    isPrimary: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one billingAddress field must be provided",
  })

export const customerPortalRecordSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  preferredLanguage: z.string().nullable(),
  preferredCurrency: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  billingAddress: customerPortalAddressSchema.nullable(),
  relation: z.string().nullable(),
  status: z.string(),
})

export const customerPortalBootstrapCandidateSchema = customerPortalRecordSchema.extend({
  linkable: z.boolean(),
  claimedByAnotherUser: z.boolean(),
})

export const customerPortalProfileSchema = z.object({
  userId: z.string(),
  // null for phone-only signups; customer identity lives in customer_auth.user
  // guarantees email or phoneNumber is set, not both required.
  email: emailAddress().nullable(),
  phoneNumber: z.string().nullable().optional(),
  emailVerified: z.boolean(),
  firstName: z.string().nullable(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  locale: z.string(),
  timezone: z.string().nullable(),
  seatingPreference: seatingPreferenceSchema.nullable(),
  dateOfBirth: z.string().nullable(),
  address: z
    .object({
      country: z.string().nullable(),
      state: z.string().nullable(),
      city: z.string().nullable(),
      postalCode: z.string().nullable(),
      addressLine1: z.string().nullable(),
      addressLine2: z.string().nullable(),
    })
    .nullable(),
  /**
   * Free-text PII slots stored on `crm.people` and decrypted server-
   * side. Stay nullable strings so the UI can surface them as simple
   * textareas; richer structures (loyalty programs as rows, insurance
   * policies as rows) graduate later if/when real consumers exist.
   */
  accessibility: z.string().nullable(),
  dietary: z.string().nullable(),
  loyalty: z.string().nullable(),
  insurance: z.string().nullable(),
  marketingConsent: z.boolean(),
  marketingConsentAt: z.string().nullable(),
  marketingConsentSource: z.string().nullable(),
  notificationDefaults: z.record(z.string(), z.unknown()).nullable(),
  uiPrefs: z.record(z.string(), z.unknown()).nullable(),
  customerRecord: customerPortalRecordSchema.nullable(),
})

export const updateCustomerPortalRecordSchema = z.object({
  preferredLanguage: z.string().max(35).nullable().optional(),
  preferredCurrency: z.string().min(3).max(3).nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  billingAddress: updateCustomerPortalAddressSchema.optional(),
})

export const updateCustomerPortalProfileSchema = z
  .object({
    firstName: z.string().max(200).nullable().optional(),
    middleName: z.string().max(200).nullable().optional(),
    lastName: z.string().max(200).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    locale: z.string().max(10).optional(),
    timezone: z.string().max(64).nullable().optional(),
    seatingPreference: seatingPreferenceSchema.nullable().optional(),
    dateOfBirth: z.string().date().nullable().optional(),
    address: z
      .object({
        country: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        postalCode: z.string().nullable().optional(),
        addressLine1: z.string().nullable().optional(),
        addressLine2: z.string().nullable().optional(),
      })
      .optional(),
    accessibility: z.string().max(4000).nullable().optional(),
    dietary: z.string().max(4000).nullable().optional(),
    loyalty: z.string().max(4000).nullable().optional(),
    insurance: z.string().max(4000).nullable().optional(),
    marketingConsent: z.boolean().optional(),
    marketingConsentSource: z.string().max(255).nullable().optional(),
    notificationDefaults: z.record(z.string(), z.unknown()).nullable().optional(),
    uiPrefs: z.record(z.string(), z.unknown()).nullable().optional(),
    customerRecord: updateCustomerPortalRecordSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })

/**
 * Per-document shape exposed by `/me/documents`. Plaintext on the
 * wire — server encrypts/decrypts `number` against the people KMS key.
 */
export const customerPortalProfileDocumentSchema = z.object({
  id: z.string(),
  type: customerPortalProfileDocumentTypeSchema,
  number: z.string().nullable(),
  issuingAuthority: z.string().nullable(),
  issuingCountry: z.string().nullable(),
  issueDate: z.string().nullable(),
  expiryDate: z.string().nullable(),
  attachmentId: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const createCustomerPortalProfileDocumentSchema = z.object({
  type: customerPortalProfileDocumentTypeSchema,
  number: z.string().min(1).max(255).nullable().optional(),
  issuingAuthority: z.string().max(255).nullable().optional(),
  issuingCountry: z.string().max(255).nullable().optional(),
  issueDate: z.string().date().nullable().optional(),
  expiryDate: z.string().date().nullable().optional(),
  attachmentId: z.string().max(1024).nullable().optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export const updateCustomerPortalProfileDocumentSchema = createCustomerPortalProfileDocumentSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })

export const bootstrapCustomerPortalSchema = z
  .object({
    customerRecordId: z.string().optional(),
    createCustomerIfMissing: z.boolean().default(true),
    firstName: z.string().max(200).nullable().optional(),
    lastName: z.string().max(200).nullable().optional(),
    marketingConsent: z.boolean().optional(),
    marketingConsentSource: z.string().max(255).nullable().optional(),
    customerRecord: updateCustomerPortalRecordSchema.optional(),
  })
  .refine((value) => value.customerRecordId || value.createCustomerIfMissing !== false, {
    message: "Provide a customerRecordId or allow customer creation",
  })

export const bootstrapCustomerPortalResultSchema = z.object({
  status: z.enum([
    "already_linked",
    "linked_existing_customer",
    "created_customer",
    "customer_selection_required",
  ]),
  profile: customerPortalProfileSchema.nullable(),
  candidates: z.array(customerPortalBootstrapCandidateSchema).default([]),
})

export const customerPortalCompanionSchema = z.object({
  id: z.string(),
  role: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  typeKey: z.string().nullable(),
  person: z.object({
    firstName: z.string().nullable(),
    middleName: z.string().nullable(),
    lastName: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    addresses: z.array(
      z.object({
        type: z.string().nullable(),
        country: z.string().nullable(),
        state: z.string().nullable(),
        city: z.string().nullable(),
        postalCode: z.string().nullable(),
        addressLine1: z.string().nullable(),
        addressLine2: z.string().nullable(),
        isDefault: z.boolean(),
      }),
    ),
    documents: z.array(
      z.object({
        type: customerPortalCompanionDocumentTypeSchema,
        number: z.string().nullable(),
        issuingAuthority: z.string().nullable(),
        country: z.string().nullable(),
        issueDate: z.string().nullable(),
        expiryDate: z.string().nullable(),
      }),
    ),
  }),
  metadata: z.record(z.string(), z.unknown()).nullable(),
})

export const createCustomerPortalCompanionSchema = z.object({
  role: z
    .enum([
      "general",
      "primary",
      "reservations",
      "operations",
      "front_desk",
      "sales",
      "emergency",
      "accounting",
      "legal",
      "other",
    ])
    .default("other"),
  name: z.string().min(1).max(255),
  title: z.string().max(255).nullable().optional(),
  email: emailAddress().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().nullable().optional(),
  typeKey: z.string().max(100).nullable().optional(),
  person: z
    .object({
      firstName: z.string().max(200).nullable().optional(),
      middleName: z.string().max(200).nullable().optional(),
      lastName: z.string().max(200).nullable().optional(),
      dateOfBirth: z.string().date().nullable().optional(),
      addresses: z
        .array(
          z.object({
            type: z.string().max(100).nullable().optional(),
            country: z.string().max(255).nullable().optional(),
            state: z.string().max(255).nullable().optional(),
            city: z.string().max(255).nullable().optional(),
            postalCode: z.string().max(50).nullable().optional(),
            addressLine1: z.string().max(255).nullable().optional(),
            addressLine2: z.string().max(255).nullable().optional(),
            isDefault: z.boolean().optional(),
          }),
        )
        .optional(),
      documents: z
        .array(
          z.object({
            type: customerPortalCompanionDocumentTypeSchema,
            number: z.string().max(255).nullable().optional(),
            issuingAuthority: z.string().max(255).nullable().optional(),
            country: z.string().max(255).nullable().optional(),
            issueDate: z.string().date().nullable().optional(),
            expiryDate: z.string().date().nullable().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const updateCustomerPortalCompanionSchema = createCustomerPortalCompanionSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })

export const importCustomerPortalBookingTravelersSchema = z.object({
  bookingIds: z.array(z.string()).min(1).optional(),
})

export const importCustomerPortalBookingTravelersResultSchema = z.object({
  created: z.array(customerPortalCompanionSchema),
  skippedCount: z.number().int().nonnegative(),
})

export const importCustomerPortalBookingParticipantsSchema =
  importCustomerPortalBookingTravelersSchema
export const importCustomerPortalBookingParticipantsResultSchema =
  importCustomerPortalBookingTravelersResultSchema

export type CustomerPortalProfile = z.infer<typeof customerPortalProfileSchema>
export type UpdateCustomerPortalProfileInput = z.infer<typeof updateCustomerPortalProfileSchema>
export type CustomerPortalAddress = z.infer<typeof customerPortalAddressSchema>
export type UpdateCustomerPortalAddressInput = z.input<typeof updateCustomerPortalAddressSchema>
export type CustomerPortalProfileDocument = z.infer<typeof customerPortalProfileDocumentSchema>
export type CreateCustomerPortalProfileDocumentInput = z.infer<
  typeof createCustomerPortalProfileDocumentSchema
>
export type UpdateCustomerPortalProfileDocumentInput = z.infer<
  typeof updateCustomerPortalProfileDocumentSchema
>
export type BootstrapCustomerPortalInput = z.infer<typeof bootstrapCustomerPortalSchema>
export type BootstrapCustomerPortalResult = z.infer<typeof bootstrapCustomerPortalResultSchema>
export type CustomerPortalBootstrapCandidate = z.infer<
  typeof customerPortalBootstrapCandidateSchema
>
export type CustomerPortalCompanion = z.infer<typeof customerPortalCompanionSchema>
export type CreateCustomerPortalCompanionInput = z.infer<typeof createCustomerPortalCompanionSchema>
export type UpdateCustomerPortalCompanionInput = z.infer<typeof updateCustomerPortalCompanionSchema>
export type ImportCustomerPortalBookingTravelersInput = z.infer<
  typeof importCustomerPortalBookingTravelersSchema
>
export type ImportCustomerPortalBookingTravelersResult = z.infer<
  typeof importCustomerPortalBookingTravelersResultSchema
>
export type ImportCustomerPortalBookingParticipantsInput = ImportCustomerPortalBookingTravelersInput
export type ImportCustomerPortalBookingParticipantsResult =
  ImportCustomerPortalBookingTravelersResult
