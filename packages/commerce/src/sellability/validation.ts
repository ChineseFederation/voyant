import { booleanQueryParam } from "@voyant-travel/db/helpers"
import { z } from "zod"

export const requestedUnitSchema = z.object({
  requestRef: z.string().min(1).max(100).optional(),
  unitId: z.string().nullable().optional(),
  pricingCategoryId: z.string().nullable().optional(),
  quantity: z.number().int().min(1),
})

export const sellabilityResolveQuerySchema = z.object({
  productId: z.string().optional(),
  optionId: z.string().optional(),
  slotId: z.string().optional(),
  dateLocal: z.string().date().optional(),
  startTimeId: z.string().optional(),
  marketId: z.string().optional(),
  channelId: z.string().optional(),
  pickupPointId: z.string().optional(),
  currencyCode: z.string().length(3).optional(),
  requestedUnits: z.array(requestedUnitSchema).default([]),
  travelerCount: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(25),
})

export const sellabilitySnapshotStatusSchema = z.enum(["resolved", "offer_constructed", "expired"])
export const sellabilityPolicyScopeSchema = z.enum([
  "global",
  "product",
  "option",
  "market",
  "channel",
])
export const sellabilityPolicyTypeSchema = z.enum([
  "capability",
  "occupancy",
  "pickup",
  "question",
  "allotment",
  "availability_window",
  "currency",
  "custom",
])
export const sellabilityPolicyResultStatusSchema = z.enum([
  "passed",
  "blocked",
  "warning",
  "adjusted",
])
export const offerRefreshRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "expired",
])
export const offerExpirationEventStatusSchema = z.enum([
  "scheduled",
  "expired",
  "cancelled",
  "superseded",
])
export const sellabilityExplanationTypeSchema = z.enum([
  "sellable",
  "blocked",
  "warning",
  "pricing",
  "allotment",
  "pickup",
  "policy",
])

export const sellabilityPersistSnapshotSchema = z.object({
  query: sellabilityResolveQuerySchema,
  expiresAt: z.string().datetime().nullable().optional(),
})

export const sellabilitySnapshotListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  offerId: z.string().optional(),
  marketId: z.string().optional(),
  channelId: z.string().optional(),
  productId: z.string().optional(),
  optionId: z.string().optional(),
  slotId: z.string().optional(),
  status: sellabilitySnapshotStatusSchema.optional(),
})

export const sellabilitySnapshotItemListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  snapshotId: z.string().optional(),
  productId: z.string().optional(),
  optionId: z.string().optional(),
  slotId: z.string().optional(),
  unitId: z.string().optional(),
})

export const sellabilityPolicyCoreSchema = z.object({
  name: z.string().min(1).max(255),
  scope: sellabilityPolicyScopeSchema.default("global"),
  policyType: sellabilityPolicyTypeSchema.default("custom"),
  productId: z.string().nullable().optional(),
  optionId: z.string().nullable().optional(),
  marketId: z.string().nullable().optional(),
  channelId: z.string().nullable().optional(),
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
  conditions: z.record(z.string(), z.unknown()).default({}),
  effects: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export const insertSellabilityPolicySchema = sellabilityPolicyCoreSchema
export const updateSellabilityPolicySchema = sellabilityPolicyCoreSchema.partial()
export const sellabilityPolicyListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  scope: sellabilityPolicyScopeSchema.optional(),
  policyType: sellabilityPolicyTypeSchema.optional(),
  productId: z.string().optional(),
  optionId: z.string().optional(),
  marketId: z.string().optional(),
  channelId: z.string().optional(),
  active: booleanQueryParam.optional(),
})

export const sellabilityPolicyResultCoreSchema = z.object({
  snapshotId: z.string(),
  snapshotItemId: z.string().nullable().optional(),
  policyId: z.string().nullable().optional(),
  candidateIndex: z.number().int().min(0).default(0),
  status: sellabilityPolicyResultStatusSchema.default("passed"),
  message: z.string().nullable().optional(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
})
export const insertSellabilityPolicyResultSchema = sellabilityPolicyResultCoreSchema
export const updateSellabilityPolicyResultSchema = sellabilityPolicyResultCoreSchema.partial()
export const sellabilityPolicyResultListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  snapshotId: z.string().optional(),
  snapshotItemId: z.string().optional(),
  policyId: z.string().optional(),
  status: sellabilityPolicyResultStatusSchema.optional(),
})

export const offerRefreshRunCoreSchema = z.object({
  offerId: z.string(),
  snapshotId: z.string().nullable().optional(),
  status: offerRefreshRunStatusSchema.default("pending"),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export const insertOfferRefreshRunSchema = offerRefreshRunCoreSchema
export const updateOfferRefreshRunSchema = offerRefreshRunCoreSchema.partial()
export const offerRefreshRunListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  offerId: z.string().optional(),
  snapshotId: z.string().optional(),
  status: offerRefreshRunStatusSchema.optional(),
})

export const offerExpirationEventCoreSchema = z.object({
  offerId: z.string(),
  snapshotId: z.string().nullable().optional(),
  expiresAt: z.string().datetime(),
  expiredAt: z.string().datetime().nullable().optional(),
  status: offerExpirationEventStatusSchema.default("scheduled"),
  reason: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export const insertOfferExpirationEventSchema = offerExpirationEventCoreSchema
export const updateOfferExpirationEventSchema = offerExpirationEventCoreSchema.partial()
export const offerExpirationEventListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  offerId: z.string().optional(),
  snapshotId: z.string().optional(),
  status: offerExpirationEventStatusSchema.optional(),
})

export const sellabilityExplanationCoreSchema = z.object({
  snapshotId: z.string(),
  snapshotItemId: z.string().nullable().optional(),
  candidateIndex: z.number().int().min(0).default(0),
  explanationType: sellabilityExplanationTypeSchema.default("policy"),
  code: z.string().nullable().optional(),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
})
export const insertSellabilityExplanationSchema = sellabilityExplanationCoreSchema
export const updateSellabilityExplanationSchema = sellabilityExplanationCoreSchema.partial()
export const sellabilityExplanationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  snapshotId: z.string().optional(),
  snapshotItemId: z.string().optional(),
  explanationType: sellabilityExplanationTypeSchema.optional(),
})

export type SellabilityResolveQuery = z.infer<typeof sellabilityResolveQuerySchema>
export type SellabilityPersistSnapshotInput = z.infer<typeof sellabilityPersistSnapshotSchema>
