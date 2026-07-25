import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { Context } from "hono"
import { z } from "zod"

import type { SourceAdapterContext } from "../adapter/contract.js"

import type { OwnedBookingHandlerRegistry } from "./owned-handler.js"
import type { QuoteEntityDeps, QuoteEntityResult } from "./quote.js"
import type { SourceAdapterRegistry } from "./registry.js"

const recordSchema = z.record(z.string(), z.unknown())

const quoteScopeSchema = z
  .object({
    locale: z.string().min(1).optional(),
    audience: z.enum(["staff", "customer", "partner", "supplier"]).optional(),
    market: z.string().min(1).optional(),
    currency: z.string().min(1).optional(),
  })
  .optional()

const batchCriteriaSchema = z
  .object({
    checkIn: z.string().min(1).optional(),
    checkOut: z.string().min(1).optional(),
    occupancy: z.record(z.string(), z.number().int().nonnegative()).optional(),
    roomCount: z.number().int().positive().optional(),
  })
  .optional()

const batchSelectionSchema = z.object({
  entityModule: z.string().min(1),
  entityId: z.string().min(1),
  ratePlanId: z.string().min(1).optional(),
  sourceKind: z.string().min(1).optional(),
  sourceProvider: z.string().min(1).optional(),
  sourceConnectionId: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
  parameters: recordSchema.optional(),
  draft: recordSchema.optional(),
})

export const quoteBodySchema = z.object({
  entityModule: z.string().min(1),
  entityId: z.string().min(1),
  sourceKind: z.string().min(1).optional(),
  sourceProvider: z.string().min(1).optional(),
  sourceConnectionId: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
  scope: quoteScopeSchema,
  parameters: recordSchema.optional(),
  draft: recordSchema.optional(),
  ttlMs: z.number().int().positive().optional(),
})

export const batchQuoteBodySchema = z.object({
  criteria: batchCriteriaSchema,
  scope: quoteScopeSchema,
  parameters: recordSchema.optional(),
  draft: recordSchema.optional(),
  ttlMs: z.number().int().positive().optional(),
  selections: z.array(batchSelectionSchema).min(1).max(30),
})

export const draftBodySchema = z.object({
  entityModule: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  sourceKind: z.string().min(1).optional(),
  sourceConnectionId: z.string().min(1).optional(),
  sourceRef: z.string().min(1).optional(),
  draftPayload: recordSchema,
  currentStep: z.string().min(1).optional(),
  currentQuoteId: z.string().min(1).optional(),
  ttlMs: z.number().int().positive().optional(),
})

export const holdPlaceBodySchema = z.object({
  entityModule: z.string().min(1),
  entityId: z.string().min(1),
  draftId: z.string().min(1),
  ttlMs: z.number().int().positive().optional(),
  parameters: recordSchema.optional(),
})

export const holdReleaseBodySchema = z.object({
  entityModule: z.string().min(1),
  holdToken: z.string().min(1),
})

export type CatalogBookingQuoteBody = z.infer<typeof quoteBodySchema>
export type CatalogBookingBatchQuoteBody = z.infer<typeof batchQuoteBodySchema>
export type CatalogBookingBatchQuoteSelection = z.infer<typeof batchSelectionSchema>
export type CatalogBookingDraftBody = z.infer<typeof draftBodySchema>
export type CatalogBookingHoldPlaceBody = z.infer<typeof holdPlaceBodySchema>
export type CatalogBookingHoldReleaseBody = z.infer<typeof holdReleaseBodySchema>

export interface CatalogBookingProvenance {
  sourceKind: string
  sourceProvider?: string
  sourceConnectionId?: string
  sourceRef?: string
}

export interface CatalogBookingProvenanceInput {
  c: Context
  db: AnyDrizzleDb
  entityModule: string
  entityId: string
}

export interface CatalogBookingAdapterContextInput {
  c: Context
  db: AnyDrizzleDb
  operation: "quote" | "hold"
  entityModule?: string
  entityId?: string
  sourceKind: string
  sourceConnectionId?: string
  correlationId: string
}

export interface CatalogBookingHoldTtlInput {
  c: Context
  db: AnyDrizzleDb
  entityModule: string
  entityId: string
}

export interface CatalogBookingQuoteTransformInput {
  c: Context
  db: AnyDrizzleDb
  request: CatalogBookingQuoteBody
  provenance: CatalogBookingProvenance
  result: QuoteEntityResult
}

export interface CatalogBookingBatchQuoteTransformInput {
  c: Context
  db: AnyDrizzleDb
  request: CatalogBookingBatchQuoteBody
  results: Array<{
    selection: CatalogBookingBatchQuoteSelection
    request: CatalogBookingQuoteBody
    provenance: CatalogBookingProvenance
    result: QuoteEntityResult
  }>
}

export interface CatalogBookingRoutesOptions {
  resolveDb(c: Context): AnyDrizzleDb
  resolveSourceRegistry(c: Context): SourceAdapterRegistry
  resolveOwnedHandlers?(c: Context): OwnedBookingHandlerRegistry | undefined
  resolveActorId?(c: Context): string | null
  resolveCorrelationId?(c: Context): string
  resolveAdapterContext?(input: CatalogBookingAdapterContextInput): SourceAdapterContext
  resolveEntityProvenance?(input: CatalogBookingProvenanceInput): Promise<CatalogBookingProvenance>
  resolveHoldTtlMs?(input: CatalogBookingHoldTtlInput): Promise<number>
  contentEnricher?: QuoteEntityDeps["contentEnricher"]
  onContentEnricherError?: QuoteEntityDeps["onEnricherError"]
  /**
   * Resolve a per-request `evaluatePromotions` hook. Returning `undefined`
   * skips promotion evaluation. Templates typically wire
   * `createCatalogPromotionEvaluator(db)` from `@voyant-travel/commerce`.
   *
   * Per docs/architecture/promotions-architecture.md §3.6 + §7.1.
   */
  resolveEvaluatePromotions?(input: {
    c: Context
    db: AnyDrizzleDb
  }): QuoteEntityDeps["evaluatePromotions"]
  transformQuoteResult?(input: CatalogBookingQuoteTransformInput): Promise<QuoteEntityResult>
  transformBatchQuoteResults?(input: CatalogBookingBatchQuoteTransformInput):
    | Promise<
        Array<{
          selection: CatalogBookingBatchQuoteSelection
          request: CatalogBookingQuoteBody
          provenance: CatalogBookingProvenance
          result: QuoteEntityResult
        }>
      >
    | Array<{
        selection: CatalogBookingBatchQuoteSelection
        request: CatalogBookingQuoteBody
        provenance: CatalogBookingProvenance
        result: QuoteEntityResult
      }>
}
