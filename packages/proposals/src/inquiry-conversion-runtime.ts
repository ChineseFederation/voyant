import type {
  ProposalInquiryConversionOutcome,
  ProposalInquiryConversionRuntime,
  ProposalInquiryPipelinePreference,
  ProposalInquiryProductTargetSnapshot,
} from "@voyant-travel/proposals-contracts/inquiry-conversion"
import { formatProposalInquirySourceRef } from "@voyant-travel/proposals-contracts/inquiry-conversion"
import { and, asc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { pipelines, proposalProducts, proposals, stages } from "./schema.js"

interface PipelineRecord {
  id: string
  entityType: string
}

interface StageRecord {
  id: string
  pipelineId: string
  isClosed: boolean
}

interface InquiryProposalRecord {
  id: string
  pipelineId: string
  stageId: string
}

interface CreateInquiryProposalRecord {
  title: string
  description: string | null
  personId: string | null
  organizationId: string | null
  ownerId: string | null
  actorId: string | null
  tags: readonly string[]
  sourceRef: string
  pipelineId: string
  stageId: string
  productTargets: readonly ProposalInquiryProductTargetSnapshot[]
}

interface ProposalInquiryConversionStore {
  withConversionLock<T>(
    database: unknown,
    sourceRef: string,
    operation: (database: unknown) => Promise<T>,
  ): Promise<T>
  findBySourceRef(database: unknown, sourceRef: string): Promise<InquiryProposalRecord[]>
  getPipeline(database: unknown, pipelineId: string): Promise<PipelineRecord | null>
  getDefaultPipeline(database: unknown): Promise<PipelineRecord | null>
  getStage(database: unknown, stageId: string): Promise<StageRecord | null>
  getInitialOpenStage(database: unknown, pipelineId: string): Promise<StageRecord | null>
  createProposal(
    database: unknown,
    input: CreateInquiryProposalRecord,
  ): Promise<InquiryProposalRecord>
}

type PipelineSelectionOutcome =
  | { kind: "selected"; pipelineId: string; stageId: string }
  | Extract<ProposalInquiryConversionOutcome, { kind: "refused" }>

const drizzleProposalInquiryConversionStore: ProposalInquiryConversionStore = {
  withConversionLock(database, sourceRef, operation) {
    const db = database as PostgresJsDatabase
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`proposals:inquiry-conversion:${sourceRef}`}, 0))`,
      )
      return operation(tx)
    })
  },

  async findBySourceRef(database, sourceRef) {
    return (database as PostgresJsDatabase)
      .select({
        id: proposals.id,
        pipelineId: proposals.pipelineId,
        stageId: proposals.stageId,
      })
      .from(proposals)
      .where(and(eq(proposals.source, "inquiry"), eq(proposals.sourceRef, sourceRef)))
      .limit(2)
  },

  async getPipeline(database, pipelineId) {
    const [pipeline] = await (database as PostgresJsDatabase)
      .select({ id: pipelines.id, entityType: pipelines.entityType })
      .from(pipelines)
      .where(eq(pipelines.id, pipelineId))
      .limit(1)
    return pipeline ?? null
  },

  async getDefaultPipeline(database) {
    const [pipeline] = await (database as PostgresJsDatabase)
      .select({ id: pipelines.id, entityType: pipelines.entityType })
      .from(pipelines)
      .where(and(eq(pipelines.entityType, "proposal"), eq(pipelines.isDefault, true)))
      .orderBy(asc(pipelines.sortOrder), asc(pipelines.createdAt))
      .limit(1)
    return pipeline ?? null
  },

  async getStage(database, stageId) {
    const [stage] = await (database as PostgresJsDatabase)
      .select({ id: stages.id, pipelineId: stages.pipelineId, isClosed: stages.isClosed })
      .from(stages)
      .where(eq(stages.id, stageId))
      .limit(1)
    return stage ?? null
  },

  async getInitialOpenStage(database, pipelineId) {
    const [stage] = await (database as PostgresJsDatabase)
      .select({ id: stages.id, pipelineId: stages.pipelineId, isClosed: stages.isClosed })
      .from(stages)
      .where(and(eq(stages.pipelineId, pipelineId), eq(stages.isClosed, false)))
      .orderBy(asc(stages.sortOrder), asc(stages.createdAt))
      .limit(1)
    return stage ?? null
  },

  async createProposal(database, input) {
    const db = database as PostgresJsDatabase
    const [proposal] = await db
      .insert(proposals)
      .values({
        title: input.title,
        description: input.description,
        personId: input.personId,
        organizationId: input.organizationId,
        ownerId: input.ownerId,
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        status: "open",
        source: "inquiry",
        sourceRef: input.sourceRef,
        tags: [...input.tags],
        createdBy: input.actorId,
        updatedBy: input.actorId,
      })
      .returning({
        id: proposals.id,
        pipelineId: proposals.pipelineId,
        stageId: proposals.stageId,
      })
    if (!proposal) throw new Error("Proposal insertion returned no row")

    if (input.productTargets.length > 0) {
      await db.insert(proposalProducts).values(
        input.productTargets.map((target) => ({
          proposalId: proposal.id,
          productId: target.productId,
          nameSnapshot: target.nameSnapshot,
          description: target.description ?? null,
          quantity: target.quantity ?? 1,
          unitPriceAmountCents: null,
          costAmountCents: null,
          currency: null,
          discountAmountCents: null,
        })),
      )
    }
    return proposal
  },
}

export function createProposalInquiryConversionRuntime(
  store: ProposalInquiryConversionStore = drizzleProposalInquiryConversionStore,
): ProposalInquiryConversionRuntime {
  return {
    async convertInquiry(database, input) {
      const sourceRef = formatProposalInquirySourceRef(input.inquiryId, input.idempotencyKey)
      if (sourceRef === null) return refused("invalid_input")
      return store.withConversionLock(database, sourceRef, async (lockedDatabase) => {
        const existing = await store.findBySourceRef(lockedDatabase, sourceRef)
        if (existing.length > 1) return refused("source_conflict")
        const proposal = existing[0]
        if (proposal) {
          return {
            kind: "replayed",
            proposalId: proposal.id,
            pipelineId: proposal.pipelineId,
            stageId: proposal.stageId,
          }
        }

        const selection = await resolvePipelineSelection(
          store,
          lockedDatabase,
          input.pipeline ?? {},
        )
        if (selection.kind === "refused") return selection

        const created = await store.createProposal(lockedDatabase, {
          title: input.title,
          description: input.summary ?? null,
          personId: input.personId ?? null,
          organizationId: input.organizationId ?? null,
          ownerId: input.ownerId ?? null,
          actorId: input.actorId ?? null,
          tags: input.tags ?? [],
          sourceRef,
          pipelineId: selection.pipelineId,
          stageId: selection.stageId,
          productTargets: input.productTargets ?? [],
        })
        return {
          kind: "created",
          proposalId: created.id,
          pipelineId: created.pipelineId,
          stageId: created.stageId,
        }
      })
    },
  }
}

async function resolvePipelineSelection(
  store: ProposalInquiryConversionStore,
  database: unknown,
  preference: ProposalInquiryPipelinePreference,
): Promise<PipelineSelectionOutcome> {
  const explicitStage = preference.stageId
    ? await store.getStage(database, preference.stageId)
    : null
  if (preference.stageId && !explicitStage) return refused("stage_not_found")

  const requestedPipelineId = preference.pipelineId ?? explicitStage?.pipelineId
  const pipeline = requestedPipelineId
    ? await store.getPipeline(database, requestedPipelineId)
    : await store.getDefaultPipeline(database)
  if (pipeline?.entityType !== "proposal") {
    return refused(requestedPipelineId ? "pipeline_not_found" : "default_pipeline_not_found")
  }

  if (explicitStage?.pipelineId !== undefined && explicitStage.pipelineId !== pipeline.id) {
    return refused("stage_pipeline_mismatch")
  }
  if (explicitStage?.isClosed) return refused("stage_closed")

  const stage = explicitStage ?? (await store.getInitialOpenStage(database, pipeline.id))
  if (!stage) return refused("open_stage_not_found")
  return {
    kind: "selected",
    pipelineId: pipeline.id,
    stageId: stage.id,
  }
}

function refused(
  reason: Extract<ProposalInquiryConversionOutcome, { kind: "refused" }>["reason"],
): ProposalInquiryConversionOutcome {
  return { kind: "refused", reason }
}
