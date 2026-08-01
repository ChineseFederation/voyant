import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

const paginatedEnvelope = listResponseSchema

const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })

export const listEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: z.array(item) })

export const successEnvelope = z.object({ success: z.boolean() })

export const proposalRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  pipelineId: z.string(),
  stageId: z.string(),
  ownerId: z.string().nullable(),
  status: z.string(),
  acceptedVersionId: z.string().nullable(),
  valueAmountCents: z.number().int().nullable(),
  valueCurrency: z.string().nullable(),
  paxCount: z.number().int().nullable(),
  description: z.string().nullable(),
  expectedCloseDate: z.string().nullable(),
  source: z.string().nullable(),
  sourceRef: z.string().nullable(),
  lostReason: z.string().nullable(),
  tags: z.array(z.string()),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  stageChangedAt: z.string(),
  closedAt: z.string().nullable(),
})

export type ProposalRecord = z.infer<typeof proposalRecordSchema>

export const proposalListResponse = paginatedEnvelope(proposalRecordSchema)
export const proposalSingleResponse = singleEnvelope(proposalRecordSchema)

export const pipelineRecordSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type PipelineRecord = z.infer<typeof pipelineRecordSchema>

export const pipelineListResponse = paginatedEnvelope(pipelineRecordSchema)
export const pipelineSingleResponse = singleEnvelope(pipelineRecordSchema)

export const stageRecordSchema = z.object({
  id: z.string(),
  pipelineId: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  probability: z.number().int().nullable(),
  isClosed: z.boolean(),
  isWon: z.boolean(),
  isLost: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type StageRecord = z.infer<typeof stageRecordSchema>

export const stageListResponse = paginatedEnvelope(stageRecordSchema)
export const stageSingleResponse = singleEnvelope(stageRecordSchema)

export const proposalVersionRecordSchema = z.object({
  id: z.string(),
  proposalId: z.string(),
  label: z.string().nullable(),
  status: z.string(),
  supersedesId: z.string().nullable(),
  tripSnapshotId: z.string().nullable(),
  validUntil: z.string().nullable(),
  currency: z.string(),
  subtotalAmountCents: z.number().int(),
  taxAmountCents: z.number().int(),
  totalAmountCents: z.number().int(),
  notes: z.string().nullable(),
  sentAt: z.string().nullable(),
  viewedAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
})

export type ProposalVersionRecord = z.infer<typeof proposalVersionRecordSchema>

export const proposalVersionListResponse = paginatedEnvelope(proposalVersionRecordSchema)
export const proposalVersionSingleResponse = singleEnvelope(proposalVersionRecordSchema)
export const acceptProposalVersionResponse = singleEnvelope(
  z.object({
    proposal: proposalRecordSchema,
    proposalVersion: proposalVersionRecordSchema,
    closedProposalVersions: z.array(proposalVersionRecordSchema),
  }),
)

export const proposalVersionLineRecordSchema = z.object({
  id: z.string(),
  proposalVersionId: z.string(),
  productId: z.string().nullable(),
  supplierServiceId: z.string().nullable(),
  description: z.string(),
  quantity: z.number().int(),
  unitPriceAmountCents: z.number().int(),
  totalAmountCents: z.number().int(),
  currency: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProposalVersionLineRecord = z.infer<typeof proposalVersionLineRecordSchema>

export const proposalVersionLineListResponse = listEnvelope(proposalVersionLineRecordSchema)
export const proposalVersionLineSingleResponse = singleEnvelope(proposalVersionLineRecordSchema)

export const proposalParticipantRecordSchema = z.object({
  id: z.string(),
  proposalId: z.string(),
  personId: z.string(),
  role: z.string(),
  isPrimary: z.boolean(),
  createdAt: z.string(),
})

export type ProposalParticipantRecord = z.infer<typeof proposalParticipantRecordSchema>

export const proposalParticipantListResponse = listEnvelope(proposalParticipantRecordSchema)
export const proposalParticipantSingleResponse = singleEnvelope(proposalParticipantRecordSchema)

export const proposalProductRecordSchema = z.object({
  id: z.string(),
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
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProposalProductRecord = z.infer<typeof proposalProductRecordSchema>

export const proposalProductListResponse = listEnvelope(proposalProductRecordSchema)
export const proposalProductSingleResponse = singleEnvelope(proposalProductRecordSchema)

export const proposalMediaRecordSchema = z.object({
  id: z.string(),
  proposalId: z.string(),
  mediaType: z.string(),
  name: z.string(),
  url: z.string(),
  storageKey: z.string().nullable(),
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  altText: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProposalMediaRecord = z.infer<typeof proposalMediaRecordSchema>

export const proposalMediaListResponse = listEnvelope(proposalMediaRecordSchema)
export const proposalMediaSingleResponse = singleEnvelope(proposalMediaRecordSchema)
