import { RequestValidationError } from "@voyant-travel/hono"
import { and, desc, eq, ilike, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"

import type { ProposalsRouteRuntime } from "../route-runtime.js"
import { proposalMedia, proposalParticipants, proposalProducts, proposals } from "../schema.js"
import type {
  insertProposalMediaSchema,
  insertProposalParticipantSchema,
  insertProposalProductSchema,
  insertProposalSchema,
  proposalListQuerySchema,
  updateProposalProductSchema,
  updateProposalSchema,
} from "../validation.js"
import { paginate } from "./helpers.js"

type ProposalListQuery = z.infer<typeof proposalListQuerySchema>
type CreateProposalInput = z.infer<typeof insertProposalSchema>
type UpdateProposalInput = z.infer<typeof updateProposalSchema>
type CreateProposalParticipantInput = z.infer<typeof insertProposalParticipantSchema>
type CreateProposalProductInput = z.infer<typeof insertProposalProductSchema>
type UpdateProposalProductInput = z.infer<typeof updateProposalProductSchema>
type CreateProposalMediaInput = z.infer<typeof insertProposalMediaSchema>

export const proposalsService = {
  async listProposals(db: PostgresJsDatabase, query: ProposalListQuery) {
    const conditions = []

    if (query.personId) conditions.push(eq(proposals.personId, query.personId))
    if (query.organizationId) conditions.push(eq(proposals.organizationId, query.organizationId))
    if (query.pipelineId) conditions.push(eq(proposals.pipelineId, query.pipelineId))
    if (query.stageId) conditions.push(eq(proposals.stageId, query.stageId))
    if (query.ownerId) conditions.push(eq(proposals.ownerId, query.ownerId))
    if (query.status) conditions.push(eq(proposals.status, query.status))
    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(
        or(
          ilike(proposals.title, term),
          ilike(proposals.source, term),
          ilike(proposals.sourceRef, term),
        ),
      )
    }

    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(proposals)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(proposals.updatedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(proposals).where(where),
      query.limit,
      query.offset,
    )
  },

  async getProposalById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1)
    return row ?? null
  },

  async createProposal(db: PostgresJsDatabase, data: CreateProposalInput, actorId?: string | null) {
    const [row] = await db
      .insert(proposals)
      .values({ ...data, createdBy: actorId ?? null, updatedBy: actorId ?? null })
      .returning()
    return row
  },

  async updateProposal(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateProposalInput,
    actorId?: string | null,
  ) {
    const patch: UpdateProposalInput & {
      updatedAt: Date
      updatedBy?: string | null
      stageChangedAt?: Date
      closedAt?: Date | null
    } = {
      ...data,
      updatedAt: new Date(),
      updatedBy: actorId ?? null,
    }

    if (data.stageId) patch.stageChangedAt = new Date()
    if (data.status && data.status !== "open") {
      patch.closedAt = new Date()
    }
    if (data.status === "open") {
      patch.closedAt = null
    }

    const [row] = await db.update(proposals).set(patch).where(eq(proposals.id, id)).returning()
    return row ?? null
  },

  async deleteProposal(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(proposals)
      .where(eq(proposals.id, id))
      .returning({ id: proposals.id })
    return row ?? null
  },

  listProposalParticipants(db: PostgresJsDatabase, proposalId: string) {
    return db
      .select()
      .from(proposalParticipants)
      .where(eq(proposalParticipants.proposalId, proposalId))
      .orderBy(desc(proposalParticipants.isPrimary), proposalParticipants.createdAt)
  },

  async createProposalParticipant(
    db: PostgresJsDatabase,
    proposalId: string,
    data: CreateProposalParticipantInput,
    runtime: ProposalsRouteRuntime = {},
  ) {
    await validateProposalParticipantPerson(db, data.personId, runtime)

    const [row] = await db
      .insert(proposalParticipants)
      .values({ ...data, proposalId })
      .returning()
    return row
  },

  async deleteProposalParticipant(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(proposalParticipants)
      .where(eq(proposalParticipants.id, id))
      .returning({ id: proposalParticipants.id })
    return row ?? null
  },

  listProposalProducts(db: PostgresJsDatabase, proposalId: string) {
    return db
      .select()
      .from(proposalProducts)
      .where(eq(proposalProducts.proposalId, proposalId))
      .orderBy(proposalProducts.createdAt)
  },

  async createProposalProduct(
    db: PostgresJsDatabase,
    proposalId: string,
    data: CreateProposalProductInput,
    actorId?: string | null,
  ) {
    const [row] = await db
      .insert(proposalProducts)
      .values({ ...data, proposalId })
      .returning()
    await recomputeProposalValue(db, proposalId, actorId)
    return row
  },

  async updateProposalProduct(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateProposalProductInput,
    actorId?: string | null,
  ) {
    const [row] = await db
      .update(proposalProducts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(proposalProducts.id, id))
      .returning()
    if (row) await recomputeProposalValue(db, row.proposalId, actorId)
    return row ?? null
  },

  async deleteProposalProduct(db: PostgresJsDatabase, id: string, actorId?: string | null) {
    const [row] = await db
      .delete(proposalProducts)
      .where(eq(proposalProducts.id, id))
      .returning({ id: proposalProducts.id, proposalId: proposalProducts.proposalId })
    if (row) await recomputeProposalValue(db, row.proposalId, actorId)
    return row ?? null
  },

  listProposalMedia(db: PostgresJsDatabase, proposalId: string) {
    return db
      .select()
      .from(proposalMedia)
      .where(eq(proposalMedia.proposalId, proposalId))
      .orderBy(proposalMedia.sortOrder, proposalMedia.createdAt)
  },

  async createProposalMedia(
    db: PostgresJsDatabase,
    proposalId: string,
    data: CreateProposalMediaInput,
  ) {
    const [row] = await db
      .insert(proposalMedia)
      .values({ ...data, proposalId })
      .returning()
    return row
  },

  async deleteProposalMedia(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(proposalMedia)
      .where(eq(proposalMedia.id, id))
      .returning({ id: proposalMedia.id })
    return row ?? null
  },
}

async function validateProposalParticipantPerson(
  db: PostgresJsDatabase,
  personId: string,
  runtime: ProposalsRouteRuntime,
): Promise<void> {
  if (!runtime.resolveParticipantPersonById) {
    return
  }

  const exists = await runtime.resolveParticipantPersonById(db, personId)
  if (!exists) {
    throw new RequestValidationError(
      "Proposal participant personId does not reference an existing person",
      {
        fields: {
          fieldErrors: { personId: ["Person not found"] },
          formErrors: [],
        },
      },
    )
  }
}

/**
 * Recompute and persist a proposal's headline value from its line items —
 * `Σ (quantity × unit price − discount)`. The proposal value is derived from
 * its products, not entered by hand, so it stays in sync everywhere (list,
 * pipeline board, detail) whenever an item changes.
 */
async function recomputeProposalValue(
  db: PostgresJsDatabase,
  proposalId: string,
  actorId?: string | null,
): Promise<number> {
  const products = await db
    .select({
      quantity: proposalProducts.quantity,
      unitPriceAmountCents: proposalProducts.unitPriceAmountCents,
      discountAmountCents: proposalProducts.discountAmountCents,
    })
    .from(proposalProducts)
    .where(eq(proposalProducts.proposalId, proposalId))

  const total = products.reduce(
    (sum, p) => sum + p.quantity * (p.unitPriceAmountCents ?? 0) - (p.discountAmountCents ?? 0),
    0,
  )

  await db
    .update(proposals)
    .set({
      valueAmountCents: total,
      updatedAt: new Date(),
      ...(actorId !== undefined ? { updatedBy: actorId } : {}),
    })
    .where(eq(proposals.id, proposalId))

  return total
}
