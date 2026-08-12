import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

/**
 * Shared API response envelope schemas. The Voyant CRM routes wrap payloads in
 * either `{ data, total, limit, offset }` (lists) or `{ data }` (single
 * resource) so we assemble typed schemas from those envelopes here.
 */

const paginatedEnvelope = listResponseSchema

const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })

const listEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: z.array(item) })

export const successEnvelope = z.object({ success: z.boolean() })

/**
 * Loose Person/Organization schemas — these describe the shape returned by the
 * API (DB rows + hydrated identity fields + timestamps) without forcing
 * consumers to depend on the Drizzle type inference chain. The hooks expose
 * these as `z.infer` types; keep in sync with `packages/relationships/src/schema.ts`.
 */

/**
 * KMS-encrypted envelope shape — `{ enc: base64 }`. Mirrors the
 * `kmsEnvelopeSchema` in `@voyant-travel/db/schema/iam/kms` (kept inline
 * here so relationships-react has no server-side schema dep).
 */
export const kmsEnvelopeRecordSchema = z.object({ enc: z.string().min(1) }).nullable()

export type KmsEnvelopeRecord = z.infer<typeof kmsEnvelopeRecordSchema>

export const personRecordSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string(),
  gender: z.enum(["M", "F", "X"]).nullable(),
  jobTitle: z.string().nullable(),
  relation: z.string().nullable(),
  preferredLanguage: z.string().nullable(),
  preferredCurrency: z.string().nullable(),
  ownerId: z.string().nullable(),
  status: z.string(),
  source: z.string().nullable(),
  sourceRef: z.string().nullable(),
  tags: z.array(z.string()),
  dateOfBirth: z.string().nullable(),
  notes: z.string().nullable(),
  // Encrypted PII slots (canonical store; documents live in /documents)
  accessibilityEncrypted: kmsEnvelopeRecordSchema.optional(),
  dietaryEncrypted: kmsEnvelopeRecordSchema.optional(),
  loyaltyEncrypted: kmsEnvelopeRecordSchema.optional(),
  insuranceEncrypted: kmsEnvelopeRecordSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Hydrated identity fields
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
})

export type PersonRecord = z.infer<typeof personRecordSchema>

export const organizationRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  legalName: z.string().nullable(),
  website: z.string().nullable(),
  taxId: z.string().nullable(),
  industry: z.string().nullable(),
  relation: z.string().nullable(),
  ownerId: z.string().nullable(),
  defaultCurrency: z.string().nullable(),
  preferredLanguage: z.string().nullable(),
  paymentTerms: z.number().int().nullable(),
  status: z.string(),
  source: z.string().nullable(),
  sourceRef: z.string().nullable(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type OrganizationRecord = z.infer<typeof organizationRecordSchema>

export const personListResponse = paginatedEnvelope(personRecordSchema)
export const personSingleResponse = singleEnvelope(personRecordSchema)
export const organizationListResponse = paginatedEnvelope(organizationRecordSchema)
export const organizationSingleResponse = singleEnvelope(organizationRecordSchema)

/**
 * Relationship activity schemas mirror the Relationships API. Timestamps
 * surface as ISO strings after JSON serialization.
 */

export const activityRecordSchema = z.object({
  id: z.string(),
  subject: z.string(),
  type: z.string(),
  ownerId: z.string().nullable(),
  status: z.string(),
  dueAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ActivityRecord = z.infer<typeof activityRecordSchema>

export const activityListResponse = paginatedEnvelope(activityRecordSchema)
export const activitySingleResponse = singleEnvelope(activityRecordSchema)

export const activityLinkRecordSchema = z.object({
  id: z.string(),
  activityId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  role: z.string(),
  createdAt: z.string(),
})

export type ActivityLinkRecord = z.infer<typeof activityLinkRecordSchema>

export const activityLinkListResponse = listEnvelope(activityLinkRecordSchema)
export const activityLinkSingleResponse = singleEnvelope(activityLinkRecordSchema)

export const personNoteRecordSchema = z.object({
  id: z.string(),
  personId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: z.string(),
})

export type PersonNoteRecord = z.infer<typeof personNoteRecordSchema>

export const personNoteListResponse = listEnvelope(personNoteRecordSchema)

export const personDocumentTypeSchema = z.enum([
  "passport",
  "id_card",
  "driver_license",
  "visa",
  "other",
])

export type PersonDocumentType = z.infer<typeof personDocumentTypeSchema>

export const personDocumentRecordSchema = z.object({
  id: z.string(),
  personId: z.string(),
  type: personDocumentTypeSchema,
  numberEncrypted: kmsEnvelopeRecordSchema.optional(),
  issuingAuthority: z.string().nullable(),
  issuingCountry: z.string().nullable(),
  issueDate: z.string().nullable(),
  expiryDate: z.string().nullable(),
  attachmentId: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type PersonDocumentRecord = z.infer<typeof personDocumentRecordSchema>

export const personDocumentListResponse = listEnvelope(personDocumentRecordSchema)
export const personDocumentSingleResponse = singleEnvelope(personDocumentRecordSchema)

const personDocumentRevealSchema = z.object({
  documentId: z.string(),
  number: z.string().nullable(),
})
export const personDocumentRevealResponse = singleEnvelope(personDocumentRevealSchema)

export const personPaymentMethodBrandSchema = z.enum([
  "visa",
  "mastercard",
  "amex",
  "revolut",
  "bank_transfer",
])

export type PersonPaymentMethodBrand = z.infer<typeof personPaymentMethodBrandSchema>

export const personPaymentMethodRecordSchema = z.object({
  id: z.string(),
  personId: z.string(),
  brand: z.string(),
  last4: z.string().nullable(),
  holderName: z.string().nullable(),
  expMonth: z.number().int().nullable(),
  expYear: z.number().int().nullable(),
  isDefault: z.boolean(),
  createdAt: z.string(),
})

export type PersonPaymentMethodRecord = z.infer<typeof personPaymentMethodRecordSchema>

export const personPaymentMethodListResponse = listEnvelope(personPaymentMethodRecordSchema)
export const personPaymentMethodSingleResponse = singleEnvelope(personPaymentMethodRecordSchema)

export const communicationChannelSchema = z.enum([
  "email",
  "phone",
  "whatsapp",
  "sms",
  "meeting",
  "other",
])
export const communicationDirectionSchema = z.enum(["inbound", "outbound"])

export type CommunicationChannel = z.infer<typeof communicationChannelSchema>
export type CommunicationDirection = z.infer<typeof communicationDirectionSchema>

export const communicationLogRecordSchema = z.object({
  id: z.string(),
  personId: z.string(),
  organizationId: z.string().nullable(),
  channel: communicationChannelSchema,
  direction: communicationDirectionSchema,
  subject: z.string().nullable(),
  content: z.string().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
  /**
   * `logged` entries were recorded by staff; `notification` entries are
   * messages the deployment delivered and cannot be edited here. Defaulted so
   * an older API that omits the field still parses.
   */
  source: z.enum(["logged", "notification"]).default("logged"),
})

export type CommunicationLogRecord = z.infer<typeof communicationLogRecordSchema>

export const communicationLogListResponse = listEnvelope(communicationLogRecordSchema)
export const communicationLogSingleResponse = singleEnvelope(communicationLogRecordSchema)

export const customerSignalKindSchema = z.enum([
  "wishlist",
  "notify",
  "inquiry",
  "request_offer",
  "referral",
])

export const customerSignalSourceSchema = z.enum([
  "form",
  "phone",
  "admin",
  "abandoned_cart",
  "website",
  "booking",
])

export const customerSignalStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
  "expired",
])

export type CustomerSignalKind = z.infer<typeof customerSignalKindSchema>
export type CustomerSignalSource = z.infer<typeof customerSignalSourceSchema>
export type CustomerSignalStatus = z.infer<typeof customerSignalStatusSchema>

export const customerSignalRecordSchema = z.object({
  id: z.string(),
  personId: z.string(),
  productId: z.string().nullable(),
  optionUnitId: z.string().nullable(),
  kind: customerSignalKindSchema,
  source: customerSignalSourceSchema,
  status: customerSignalStatusSchema,
  priority: z.string(),
  notes: z.string().nullable(),
  tags: z.array(z.string()),
  assignedToUserId: z.string().nullable(),
  followUpAt: z.string().nullable(),
  resolvedBookingId: z.string().nullable(),
  sourceSubmissionId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type CustomerSignalRecord = z.infer<typeof customerSignalRecordSchema>

export const customerSignalListResponse = paginatedEnvelope(customerSignalRecordSchema)
export const customerSignalListByPersonResponse = listEnvelope(customerSignalRecordSchema)
export const customerSignalSingleResponse = singleEnvelope(customerSignalRecordSchema)

export const personRelationshipKindSchema = z.enum([
  "spouse",
  "partner",
  "parent",
  "child",
  "sibling",
  "guardian",
  "ward",
  "emergency_contact",
  "friend",
  "travel_companion",
  "other",
])

export type PersonRelationshipKind = z.infer<typeof personRelationshipKindSchema>

export const personRelationshipRecordSchema = z.object({
  id: z.string(),
  fromPersonId: z.string(),
  toPersonId: z.string(),
  kind: personRelationshipKindSchema,
  inverseKind: personRelationshipKindSchema.nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type PersonRelationshipRecord = z.infer<typeof personRelationshipRecordSchema>

export const personRelationshipListResponse = listEnvelope(personRelationshipRecordSchema)
export const personRelationshipSingleResponse = singleEnvelope(personRelationshipRecordSchema)

export const personTravelSnapshotSchema = z.object({
  dateOfBirth: z.string().nullable(),
  dietaryRequirements: z.string().nullable(),
  accessibilityNeeds: z.string().nullable(),
  documentType: z.enum(["passport", "id_card", "driver_license", "visa", "other"]).nullable(),
  documentNumber: z.string().nullable(),
  documentExpiry: z.string().nullable(),
  documentIssuingCountry: z.string().nullable(),
  documentIssuingAuthority: z.string().nullable(),
  documentPersonDocumentId: z.string().nullable(),
})

export type PersonTravelSnapshotRecord = z.infer<typeof personTravelSnapshotSchema>
export const personTravelSnapshotResponse = z.object({ data: personTravelSnapshotSchema })
