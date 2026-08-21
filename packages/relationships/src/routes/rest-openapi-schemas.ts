/**
 * Response/envelope schemas for the remaining relationships admin OpenAPI route
 * files (voyant#2276 — step 3.5, stage B): activities, custom-fields,
 * customer-signals, person-documents, person-relationships. Authored from the
 * Drizzle `$inferSelect` shapes (`schema-activities.ts`, `schema-signals.ts`,
 * `schema-accounts.ts`) — §17: `timestamp`/`date` columns serialize to ISO
 * strings over the wire; jsonb bags are open records; encrypted KMS-envelope
 * columns are opaque objects. Enum columns reuse the exported `validation.ts`
 * enum schemas so the documented values stay in lock-step with request
 * validation.
 *
 * The shared error/success envelopes and the `{ id }` path schema are reused
 * from `accounts-openapi-schemas.ts` (stage A) so the whole module shares one
 * source for those.
 */

import { inquiryRecordSchema } from "@voyant-travel/relationships-contracts"
import { z } from "zod"

import {
  activityLinkRoleSchema,
  activityStatusSchema,
  activityTypeSchema,
  customerSignalKindSchema,
  customerSignalSourceSchema,
  customerSignalStatusSchema,
  entityTypeSchema,
  personDocumentTypeSchema,
  personRelationshipKindSchema,
} from "../validation.js"

export {
  errorResponseSchema,
  idParamSchema,
  successResponseSchema,
} from "./accounts-openapi-schemas.js"

// §17: `timestamp`/`date` columns are serialized to ISO strings over the wire.
const isoTimestamp = z.string()
const isoDate = z.string()
const jsonRecord = z.record(z.string(), z.unknown())
const namespacedCustomFields = z.record(z.string(), jsonRecord)
/** KMS envelopes are opaque jsonb objects; only their presence/absence matters. */
const encryptedEnvelope = z.unknown()

// --- activities -------------------------------------------------------------

export const activitySchema = z.object({
  id: z.string(),
  subject: z.string(),
  type: activityTypeSchema,
  ownerId: z.string().nullable(),
  status: activityStatusSchema,
  dueAt: isoTimestamp.nullable(),
  completedAt: isoTimestamp.nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  customFields: namespacedCustomFields,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const activityLinkSchema = z.object({
  id: z.string(),
  activityId: z.string(),
  entityType: entityTypeSchema,
  entityId: z.string(),
  role: activityLinkRoleSchema,
  createdAt: isoTimestamp,
})

export const activityParticipantSchema = z.object({
  id: z.string(),
  activityId: z.string(),
  personId: z.string(),
  isPrimary: z.boolean(),
  createdAt: isoTimestamp,
})

// --- customer signals -------------------------------------------------------

export const customerSignalSchema = z.object({
  id: z.string(),
  personId: z.string(),
  productId: z.string().nullable(),
  optionUnitId: z.string().nullable(),
  kind: customerSignalKindSchema,
  source: customerSignalSourceSchema,
  status: customerSignalStatusSchema,
  // Stored as free-form text (constrained to low|normal|high|urgent at the
  // write boundary) so deployments can add values without a migration.
  priority: z.string(),
  notes: z.string().nullable(),
  tags: z.array(z.string()),
  assignedToUserId: z.string().nullable(),
  followUpAt: isoTimestamp.nullable(),
  resolvedBookingId: z.string().nullable(),
  sourceSubmissionId: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- inquiries --------------------------------------------------------------

export const inquirySchema = inquiryRecordSchema

// --- person documents -------------------------------------------------------

export const personDocumentSchema = z.object({
  id: z.string(),
  personId: z.string(),
  type: personDocumentTypeSchema,
  numberEncrypted: encryptedEnvelope,
  issuingAuthority: z.string().nullable(),
  issuingCountry: z.string().nullable(),
  issueDate: isoDate.nullable(),
  expiryDate: isoDate.nullable(),
  attachmentId: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/** Decrypted, mergeable snapshot derived from a person + their primary document. */
export const personTravelSnapshotSchema = z.object({
  dateOfBirth: z.string().nullable(),
  dietaryRequirements: z.string().nullable(),
  accessibilityNeeds: z.string().nullable(),
  documentType: personDocumentTypeSchema.nullable(),
  documentNumber: z.string().nullable(),
  documentExpiry: z.string().nullable(),
  documentIssuingCountry: z.string().nullable(),
  documentIssuingAuthority: z.string().nullable(),
  documentPersonDocumentId: z.string().nullable(),
})

/** Single-document number reveal (audited via the action ledger). */
export const personDocumentRevealSchema = z.object({
  documentId: z.string(),
  number: z.string().nullable(),
})

/** 403 body for the gated reveal route — carries the access-denial reason. */
export const forbiddenResponseSchema = z.object({
  error: z.string(),
  reason: z.string(),
})

// --- person relationships ---------------------------------------------------

export const personRelationshipSchema = z.object({
  id: z.string(),
  fromPersonId: z.string(),
  toPersonId: z.string(),
  kind: personRelationshipKindSchema,
  inverseKind: personRelationshipKindSchema.nullable(),
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})
