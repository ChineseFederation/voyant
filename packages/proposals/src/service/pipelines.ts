import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"

import { pipelines, proposals, stages } from "../schema.js"
import type {
  insertPipelineSchema,
  insertStageSchema,
  pipelineListQuerySchema,
  stageListQuerySchema,
  updatePipelineSchema,
  updateStageSchema,
} from "../validation.js"
import { paginate } from "./helpers.js"

type PipelineListQuery = z.infer<typeof pipelineListQuerySchema>
type CreatePipelineInput = z.infer<typeof insertPipelineSchema>
type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>
type StageListQuery = z.infer<typeof stageListQuerySchema>
type CreateStageInput = z.infer<typeof insertStageSchema>
type UpdateStageInput = z.infer<typeof updateStageSchema>

export class PipelineDeleteConflictError extends Error {
  constructor(
    readonly pipelineId: string,
    readonly dependentProposalCount: number,
  ) {
    super(
      `Pipeline ${pipelineId} cannot be deleted because it has dependent ${dependentProposalCount} proposal(s)`,
    )
    this.name = "PipelineDeleteConflictError"
  }
}

export const pipelinesService = {
  async listPipelines(db: PostgresJsDatabase, query: PipelineListQuery) {
    const where = query.entityType ? eq(pipelines.entityType, query.entityType) : undefined
    return paginate(
      db
        .select()
        .from(pipelines)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(pipelines.sortOrder, pipelines.createdAt),
      db.select({ count: sql<number>`count(*)::int` }).from(pipelines).where(where),
      query.limit,
      query.offset,
    )
  },

  async getPipelineById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(pipelines).where(eq(pipelines.id, id)).limit(1)
    return row ?? null
  },

  async createPipeline(db: PostgresJsDatabase, data: CreatePipelineInput) {
    const [row] = await db.insert(pipelines).values(data).returning()
    return row
  },

  async updatePipeline(db: PostgresJsDatabase, id: string, data: UpdatePipelineInput) {
    const [row] = await db
      .update(pipelines)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(pipelines.id, id))
      .returning()
    return row ?? null
  },

  async deletePipeline(db: PostgresJsDatabase, id: string) {
    const [pipeline] = await db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(eq(pipelines.id, id))
      .limit(1)
    if (!pipeline) return null

    const [proposalDependencies] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(proposals)
      .where(eq(proposals.pipelineId, id))

    const dependentProposalCount = proposalDependencies?.count ?? 0
    if (dependentProposalCount) {
      throw new PipelineDeleteConflictError(id, dependentProposalCount)
    }

    const [row] = await db
      .delete(pipelines)
      .where(eq(pipelines.id, id))
      .returning({ id: pipelines.id })
    return row ?? null
  },

  async listStages(db: PostgresJsDatabase, query: StageListQuery) {
    const where = query.pipelineId ? eq(stages.pipelineId, query.pipelineId) : undefined
    return paginate(
      db
        .select()
        .from(stages)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(stages.sortOrder, stages.createdAt),
      db.select({ count: sql<number>`count(*)::int` }).from(stages).where(where),
      query.limit,
      query.offset,
    )
  },

  async getStageById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(stages).where(eq(stages.id, id)).limit(1)
    return row ?? null
  },

  async createStage(db: PostgresJsDatabase, data: CreateStageInput) {
    const [row] = await db.insert(stages).values(data).returning()
    return row
  },

  async updateStage(db: PostgresJsDatabase, id: string, data: UpdateStageInput) {
    const [row] = await db
      .update(stages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(stages.id, id))
      .returning()
    return row ?? null
  },

  async deleteStage(db: PostgresJsDatabase, id: string) {
    const [row] = await db.delete(stages).where(eq(stages.id, id)).returning({ id: stages.id })
    return row ?? null
  },
}
