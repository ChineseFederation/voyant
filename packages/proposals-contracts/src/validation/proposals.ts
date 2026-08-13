import { z } from "zod"

import {
  paginationSchema,
  participantRoleSchema,
  proposalStatusSchema,
  proposalVersionStatusSchema,
} from "./common.js"

export const proposalCoreSchema = z.object({
  title: z.string().min(1),
  personId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  pipelineId: z.string(),
  stageId: z.string(),
  ownerId: z.string().nullable().optional(),
  status: proposalStatusSchema.default("open"),
  acceptedVersionId: z.string().nullable().optional(),
  valueAmountCents: z.number().int().nullable().optional(),
  valueCurrency: z.string().nullable().optional(),
  paxCount: z.number().int().min(0).nullable().optional(),
  description: z.string().nullable().optional(),
  expectedCloseDate: z.string().date().nullable().optional(),
  source: z.string().nullable().optional(),
  sourceRef: z.string().nullable().optional(),
  lostReason: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
})

export const insertProposalSchema = proposalCoreSchema
export const updateProposalSchema = proposalCoreSchema.partial()
export const proposalListQuerySchema = paginationSchema.extend({
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  ownerId: z.string().optional(),
  status: proposalStatusSchema.optional(),
  search: z.string().optional(),
})

export const insertProposalParticipantSchema = z.object({
  personId: z.string(),
  role: participantRoleSchema.default("other"),
  isPrimary: z.boolean().default(false),
})

export const insertProposalMediaSchema = z.object({
  mediaType: z.enum(["image", "video", "document"]).default("image"),
  name: z.string().min(1),
  url: z.string().min(1),
  storageKey: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileSize: z.number().int().nullable().optional(),
  altText: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export const insertProposalProductSchema = z.object({
  productId: z.string().nullable().optional(),
  supplierServiceId: z.string().nullable().optional(),
  nameSnapshot: z.string().min(1),
  description: z.string().nullable().optional(),
  quantity: z.number().int().min(1).default(1),
  unitPriceAmountCents: z.number().int().nullable().optional(),
  costAmountCents: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
  discountAmountCents: z.number().int().nullable().optional(),
})

export const updateProposalProductSchema = insertProposalProductSchema.partial()

/**
 * Payment terms stated on one Proposal Version — the deposit the customer
 * pays to accept, and when the balance falls due.
 *
 * Mirrors finance's `PaymentPolicy` field for field. Mirrored rather than
 * imported because a contracts package carries no runtime dependency on a
 * domain package; `packages/finance/src/payment-schedule/routes.ts` mirrors the
 * same shape for the same reason.
 */
export const proposalPaymentTermsSchema = z.object({
  deposit: z.object({
    kind: z.enum(["none", "percent", "fixed_cents"]),
    percent: z.number().min(0).max(100).optional(),
    amountCents: z.number().int().min(0).optional(),
  }),
  minDaysBeforeDepartureForDeposit: z.number().int().min(0),
  balanceDueDaysBeforeDeparture: z.number().int().min(0),
  balanceDueMinDaysFromNow: z.number().int().min(0),
})

export const proposalVersionCoreSchema = z.object({
  proposalId: z.string(),
  label: z.string().nullable().optional(),
  status: proposalVersionStatusSchema.default("draft"),
  supersedesId: z.string().nullable().optional(),
  tripSnapshotId: z.string().nullable().optional(),
  validUntil: z.string().date().nullable().optional(),
  currency: z.string().min(1),
  subtotalAmountCents: z.number().int().default(0),
  taxAmountCents: z.number().int().default(0),
  totalAmountCents: z.number().int().default(0),
  paymentTerms: proposalPaymentTermsSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  sentAt: z.string().datetime().nullable().optional(),
  viewedAt: z.string().datetime().nullable().optional(),
  decidedAt: z.string().datetime().nullable().optional(),
})

export const insertProposalVersionSchema = proposalVersionCoreSchema
export const updateProposalVersionSchema = proposalVersionCoreSchema
  .extend({
    status: proposalVersionStatusSchema,
    subtotalAmountCents: z.number().int(),
    taxAmountCents: z.number().int(),
    totalAmountCents: z.number().int(),
  })
  .partial()
export const proposalVersionListQuerySchema = paginationSchema.extend({
  proposalId: z.string().optional(),
  status: proposalVersionStatusSchema.optional(),
})

export const proposalVersionLineCoreSchema = z.object({
  productId: z.string().nullable().optional(),
  supplierServiceId: z.string().nullable().optional(),
  description: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  unitPriceAmountCents: z.number().int().default(0),
  totalAmountCents: z.number().int().default(0),
  currency: z.string().min(1),
})

export const insertProposalVersionLineSchema = proposalVersionLineCoreSchema
export const updateProposalVersionLineSchema = proposalVersionLineCoreSchema.partial()

export const applyTripSnapshotProposalVersionLineSchema = proposalVersionLineCoreSchema.extend({
  componentId: z.string().nullable().optional(),
})

export const applyTripSnapshotToProposalVersionSchema = z.object({
  tripSnapshotId: z.string().min(1),
  currency: z.string().min(1),
  subtotalAmountCents: z.number().int().default(0),
  taxAmountCents: z.number().int().default(0),
  totalAmountCents: z.number().int().default(0),
  lines: z.array(applyTripSnapshotProposalVersionLineSchema).default([]),
})

export const sendProposalVersionSchema = z.object({
  validUntil: z.string().date().nullable().optional(),
})

export const acceptProposalVersionSchema = z.object({})

export const declineProposalVersionSchema = z.object({})

export const expireProposalVersionsSchema = z.object({
  now: z.string().datetime().optional(),
})
