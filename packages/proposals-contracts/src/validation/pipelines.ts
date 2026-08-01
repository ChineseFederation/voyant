import { z } from "zod"

import { entityTypeSchema, paginationSchema } from "./common.js"

export const pipelineCoreSchema = z.object({
  entityType: entityTypeSchema.default("proposal"),
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
})

export const insertPipelineSchema = pipelineCoreSchema
export const updatePipelineSchema = pipelineCoreSchema.partial()
export const pipelineListQuerySchema = paginationSchema.extend({
  entityType: entityTypeSchema.optional(),
})

export const stageCoreSchema = z.object({
  pipelineId: z.string(),
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  probability: z.number().int().min(0).max(100).nullable().optional(),
  isClosed: z.boolean().default(false),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
})

export const insertStageSchema = stageCoreSchema
export const updateStageSchema = stageCoreSchema.partial()
export const stageListQuerySchema = paginationSchema.extend({
  pipelineId: z.string().optional(),
})
