/**
 * Response/envelope schemas for the relationships "accounts" admin OpenAPI
 * routes (voyant#2276 — step 3.5, stage A). The row schemas are authored from
 * the Drizzle `$inferSelect` shapes in `schema-accounts.ts` (and the identity
 * contact-point / address rows the account routes proxy through) — §17:
 * `timestamp`/`date` columns serialize to ISO strings over the wire; jsonb bags
 * are open records; encrypted KMS-envelope columns are opaque objects. Enum
 * columns reuse the exported `validation.ts` enum schemas so the documented
 * values stay in lock-step with request validation.
 *
 * The `people` read surface is hydrated (it carries the person's primary
 * `email` / `phone` / `website` resolved from the identity contact points), so
 * `personSchema` extends the base row with those three nullable strings.
 */

import { z } from "zod"

import {
  communicationChannelSchema,
  communicationDirectionSchema,
  recordStatusSchema,
  relationTypeSchema,
} from "../validation.js"

// --- shared envelopes -------------------------------------------------------

export const errorResponseSchema = z.object({ error: z.string() })
export const successResponseSchema = z.object({ success: z.literal(true) })

const idSchema = z.string()
export const idParamSchema = z.object({ id: idSchema })
export const segmentIdParamSchema = z.object({ segmentId: idSchema })

// §17: `timestamp`/`date` columns are serialized to ISO strings over the wire.
const isoTimestamp = z.string()
const isoDate = z.string()
const jsonRecord = z.record(z.string(), z.unknown())
const namespacedCustomFields = z.record(z.string(), jsonRecord)
/** KMS envelopes are opaque jsonb objects; only their presence/absence matters. */
const encryptedEnvelope = z.unknown()

// --- organization -----------------------------------------------------------

export const organizationSchema = z.object({
  id: idSchema,
  name: z.string(),
  legalName: z.string().nullable(),
  website: z.string().nullable(),
  taxId: z.string().nullable(),
  industry: z.string().nullable(),
  relation: relationTypeSchema.nullable(),
  ownerId: z.string().nullable(),
  defaultCurrency: z.string().nullable(),
  preferredLanguage: z.string().nullable(),
  paymentTerms: z.number().int().nullable(),
  status: recordStatusSchema,
  source: z.string().nullable(),
  sourceRef: z.string().nullable(),
  tags: z.array(z.string()),
  customFields: namespacedCustomFields,
  notes: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  archivedAt: isoTimestamp.nullable(),
})

// --- person (hydrated read surface) -----------------------------------------

export const personSchema = z.object({
  id: idSchema,
  organizationId: z.string().nullable(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string(),
  gender: z.string().nullable(),
  jobTitle: z.string().nullable(),
  relation: relationTypeSchema.nullable(),
  preferredLanguage: z.string().nullable(),
  preferredCurrency: z.string().nullable(),
  ownerId: z.string().nullable(),
  status: recordStatusSchema,
  source: z.string().nullable(),
  sourceRef: z.string().nullable(),
  tags: z.array(z.string()),
  customFields: namespacedCustomFields,
  dateOfBirth: isoDate.nullable(),
  notes: z.string().nullable(),
  accessibilityEncrypted: encryptedEnvelope,
  dietaryEncrypted: encryptedEnvelope,
  loyaltyEncrypted: encryptedEnvelope,
  insuranceEncrypted: encryptedEnvelope,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  archivedAt: isoTimestamp.nullable(),
  // Hydrated from the primary identity contact points.
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
})

// --- notes ------------------------------------------------------------------

export const organizationNoteSchema = z.object({
  id: idSchema,
  organizationId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: isoTimestamp,
})

export const personNoteSchema = z.object({
  id: idSchema,
  personId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: isoTimestamp,
})

// --- person payment methods -------------------------------------------------

export const personPaymentMethodSchema = z.object({
  id: idSchema,
  personId: z.string(),
  brand: z.string(),
  last4: z.string().nullable(),
  holderName: z.string().nullable(),
  expMonth: z.number().int().nullable(),
  expYear: z.number().int().nullable(),
  processorToken: z.string(),
  isDefault: z.boolean(),
  createdAt: isoTimestamp,
})

// --- communication log ------------------------------------------------------

export const communicationLogEntrySchema = z.object({
  id: idSchema,
  personId: z.string(),
  organizationId: z.string().nullable(),
  channel: communicationChannelSchema,
  direction: communicationDirectionSchema,
  subject: z.string().nullable(),
  content: z.string().nullable(),
  sentAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
  /**
   * Where the entry came from. `logged` is a row staff wrote and can edit;
   * `notification` is a message the deployment delivered, and is read-only —
   * its authority is the delivery record, not CRM.
   */
  source: z.enum(["logged", "notification"]).default("logged"),
})

// --- segments ---------------------------------------------------------------

export const segmentSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  conditions: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- identity contact points & addresses (proxied by the account routes) ----

export const contactMethodSchema = z.object({
  id: idSchema,
  entityType: z.string(),
  entityId: z.string(),
  kind: z.string(),
  label: z.string().nullable(),
  value: z.string(),
  normalizedValue: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const addressSchema = z.object({
  id: idSchema,
  entityType: z.string(),
  entityId: z.string(),
  label: z.string(),
  fullText: z.string().nullable(),
  line1: z.string().nullable(),
  line2: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  timezone: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecord.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- CSV import result ------------------------------------------------------

export const peopleImportResultSchema = z.object({
  imported: z.number().int(),
  errors: z.array(z.object({ row: z.number().int(), error: z.string() })),
})

export const csvBodySchema = z.string()
