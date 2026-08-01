/**
 * Response/envelope schemas for the proposals admin OpenAPI routes (voyant#2276 —
 * step 3.5). Row schemas are authored from the Drizzle `$inferSelect` shapes in
 * `schema-sales.ts` (§17: `timestamp` columns serialize to ISO strings over the
 * wire; `date` columns serialize to date strings; integer columns stay numbers;
 * jsonb bags are open records / typed arrays). Enum columns reuse the exported
 * contract enum schemas so the documented values stay in lock-step with request
 * validation. Business logic and the wire envelopes (`{ data, total, limit,
 * offset }` lists, `{ data }` singles, `{ success: true }` deletes) are
 * unchanged; only the representation is documented here.
 */

import { z } from "zod"

import {
  entityTypeSchema,
  participantRoleSchema,
  proposalStatusSchema,
  proposalVersionStatusSchema,
} from "../validation.js"

// --- shared envelopes -------------------------------------------------------

export const errorResponseSchema = z.object({ error: z.string() })
export const successResponseSchema = z.object({ success: z.literal(true) })
const idSchema = z.string()
export const idParamSchema = z.object({ id: idSchema })

// §17: `timestamp` columns serialize to ISO datetime strings; `date` columns
// serialize to `YYYY-MM-DD` strings; both are plain strings over the wire.
const isoTimestamp = z.string()
const isoDate = z.string()
const jsonRecord = z.record(z.string(), z.unknown())
const namespacedCustomFields = z.record(z.string(), jsonRecord)

// --- pipeline ---------------------------------------------------------------

export const pipelineSchema = z.object({
  id: idSchema,
  entityType: entityTypeSchema,
  name: z.string(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- stage ------------------------------------------------------------------

export const stageSchema = z.object({
  id: idSchema,
  pipelineId: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  probability: z.number().int().nullable(),
  isClosed: z.boolean(),
  isWon: z.boolean(),
  isLost: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- proposal ------------------------------------------------------------------

export const proposalSchema = z.object({
  id: idSchema,
  title: z.string(),
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  pipelineId: z.string(),
  stageId: z.string(),
  ownerId: z.string().nullable(),
  status: proposalStatusSchema,
  acceptedVersionId: z.string().nullable(),
  valueAmountCents: z.number().int().nullable(),
  valueCurrency: z.string().nullable(),
  paxCount: z.number().int().nullable(),
  expectedCloseDate: isoDate.nullable(),
  source: z.string().nullable(),
  sourceRef: z.string().nullable(),
  lostReason: z.string().nullable(),
  tags: z.array(z.string()),
  customFields: namespacedCustomFields,
  description: z.string().nullable(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  stageChangedAt: isoTimestamp,
  closedAt: isoTimestamp.nullable(),
})

// --- proposal participant ------------------------------------------------------

export const proposalParticipantSchema = z.object({
  id: idSchema,
  proposalId: z.string(),
  personId: z.string(),
  role: participantRoleSchema,
  isPrimary: z.boolean(),
  createdAt: isoTimestamp,
})

// --- proposal product ----------------------------------------------------------

export const proposalProductSchema = z.object({
  id: idSchema,
  proposalId: z.string(),
  productId: z.string().nullable(),
  supplierServiceId: z.string().nullable(),
  nameSnapshot: z.string(),
  description: z.string().nullable(),
  quantity: z.number().int(),
  unitPriceAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  currency: z.string().nullable(),
  discountAmountCents: z.number().int().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- proposal media ------------------------------------------------------------

export const proposalMediaSchema = z.object({
  id: idSchema,
  proposalId: z.string(),
  mediaType: z.string(),
  name: z.string(),
  url: z.string(),
  storageKey: z.string().nullable(),
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  altText: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- proposal version ----------------------------------------------------------

export const proposalVersionSchema = z.object({
  id: idSchema,
  proposalId: z.string(),
  label: z.string().nullable(),
  status: proposalVersionStatusSchema,
  supersedesId: z.string().nullable(),
  tripSnapshotId: z.string().nullable(),
  validUntil: isoDate.nullable(),
  currency: z.string(),
  subtotalAmountCents: z.number().int(),
  taxAmountCents: z.number().int(),
  totalAmountCents: z.number().int(),
  notes: z.string().nullable(),
  sentAt: isoTimestamp.nullable(),
  viewedAt: isoTimestamp.nullable(),
  decidedAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  archivedAt: isoTimestamp.nullable(),
})

// --- proposal version line -----------------------------------------------------

export const proposalVersionLineSchema = z.object({
  id: idSchema,
  proposalVersionId: z.string(),
  productId: z.string().nullable(),
  supplierServiceId: z.string().nullable(),
  description: z.string(),
  quantity: z.number().int(),
  unitPriceAmountCents: z.number().int(),
  totalAmountCents: z.number().int(),
  currency: z.string(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- composite version results ---------------------------------------------

// `applyTripSnapshotToProposalVersion` returns the updated version plus its rebuilt
// lines.
export const applyTripSnapshotResultSchema = z.object({
  proposalVersion: proposalVersionSchema,
  lines: z.array(proposalVersionLineSchema),
})

// `acceptProposalVersion` returns the won proposal, the accepted version, and any
// versions it closed (declined + superseded).
export const acceptProposalVersionResultSchema = z.object({
  proposal: proposalSchema,
  proposalVersion: proposalVersionSchema,
  closedProposalVersions: z.array(proposalVersionSchema),
})
