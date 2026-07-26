import { z } from "@hono/zod-openapi"

export const setupStepIdSchema = z.string().trim().min(1).max(200)

export const setupStepDefinitionSchema = z.object({
  id: setupStepIdSchema,
  skippable: z.boolean(),
})

export const initializeSetupInputSchema = z.object({
  stepIds: z.array(setupStepIdSchema).max(100),
  fresh: z.boolean(),
})

export const setupStepStateSchema = z.object({
  stepId: setupStepIdSchema,
  firstSeenAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  skippedAt: z.string().datetime().nullable(),
})

export const setupStateSchema = z.object({
  startedAt: z.string().datetime(),
  firstRunOpenedAt: z.string().datetime().nullable(),
  dismissedAt: z.string().datetime().nullable(),
  steps: z.array(setupStepStateSchema),
  prefill: z.record(z.string(), z.unknown()),
})

export const initializeSetupResponseSchema = z.object({
  data: setupStateSchema.extend({ shouldRedirect: z.boolean() }),
})

export const dismissSetupResponseSchema = z.object({
  data: setupStateSchema,
})

export const setupStateSnapshotSchema = z.object({
  state: setupStateSchema.nullable(),
  canManage: z.boolean(),
})

export const setupStateResponseSchema = z.object({ data: setupStateSnapshotSchema })
export const setupStepResponseSchema = z.object({ data: setupStepStateSchema })

export type InitializeSetupInput = z.infer<typeof initializeSetupInputSchema>
export type SetupStepDefinition = z.infer<typeof setupStepDefinitionSchema>
export type SetupStepState = z.infer<typeof setupStepStateSchema>
export type SetupState = z.infer<typeof setupStateSchema>
export type SetupStateSnapshot = z.infer<typeof setupStateSnapshotSchema>
