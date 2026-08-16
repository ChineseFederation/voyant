import { RequestValidationError } from "@voyant-travel/hono"
import { listResponse } from "@voyant-travel/types"
import { and, asc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"
import { legalTerms } from "./schema.js"
import {
  type insertLegalTermSchema,
  legalTermArchivalViolation,
  type legalTermListQuerySchema,
  type updateLegalTermSchema,
} from "./validation.js"

export type CreateLegalTermInput = z.infer<typeof insertLegalTermSchema>
export type UpdateLegalTermInput = z.infer<typeof updateLegalTermSchema>
export type LegalTermListQuery = z.infer<typeof legalTermListQuerySchema>

function normalizeTimestamp(value?: string | null): Date | null | undefined {
  if (value === undefined) return undefined
  return value ? new Date(value) : null
}

/**
 * The archival invariant, decided against the row a patch actually lands on.
 *
 * A patch cannot see that row, so `updateLegalTermSchema` can only reject what
 * is self-evidently wrong in the payload. Merging here is what catches
 * `PATCH { termType: "insurer_terms" }` against a row that was never archived —
 * the shape that would otherwise look configured and silently isn't.
 */
function assertArchivalInvariant(term: {
  termType?: string | null
  sourceVersionId?: string | null
  archivedStorageKey?: string | null
}) {
  const violation = legalTermArchivalViolation(term)
  if (violation) throw new RequestValidationError(violation)
}

async function paginate<T extends object>(
  rowsQuery: Promise<T[]>,
  countQuery: Promise<Array<{ count: number }>>,
  limit: number,
  offset: number,
) {
  const [data, countResult] = await Promise.all([rowsQuery, countQuery])
  return listResponse(data, { total: countResult[0]?.count ?? 0, limit, offset })
}

export const legalTermsService = {
  async listTerms(db: PostgresJsDatabase, query: LegalTermListQuery) {
    const conditions = []
    if (query.contractId) conditions.push(eq(legalTerms.contractId, query.contractId))
    if (query.policyVersionId)
      conditions.push(eq(legalTerms.policyVersionId, query.policyVersionId))
    if (query.targetKind) conditions.push(eq(legalTerms.targetKind, query.targetKind))
    if (query.targetId) conditions.push(eq(legalTerms.targetId, query.targetId))
    if (query.targetProvider) conditions.push(eq(legalTerms.targetProvider, query.targetProvider))
    if (query.targetSourceRef)
      conditions.push(eq(legalTerms.targetSourceRef, query.targetSourceRef))
    if (query.legacyTransactionOfferId)
      conditions.push(eq(legalTerms.legacyTransactionOfferId, query.legacyTransactionOfferId))
    if (query.legacyTransactionOrderId)
      conditions.push(eq(legalTerms.legacyTransactionOrderId, query.legacyTransactionOrderId))
    if (query.termType) conditions.push(eq(legalTerms.termType, query.termType))
    if (query.acceptanceStatus)
      conditions.push(eq(legalTerms.acceptanceStatus, query.acceptanceStatus))
    if (query.sourceVersionId)
      conditions.push(eq(legalTerms.sourceVersionId, query.sourceVersionId))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(legalTerms)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(asc(legalTerms.sortOrder), asc(legalTerms.createdAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(legalTerms).where(where),
      query.limit,
      query.offset,
    )
  },

  async getTermById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(legalTerms).where(eq(legalTerms.id, id)).limit(1)
    return row ?? null
  },

  async createTerm(db: PostgresJsDatabase, data: CreateLegalTermInput) {
    const { acceptedAt, ...rest } = data
    assertArchivalInvariant(rest)
    const [row] = await db
      .insert(legalTerms)
      .values({
        ...rest,
        acceptedAt: normalizeTimestamp(acceptedAt) ?? null,
      })
      .returning()
    return row ?? null
  },

  async updateTerm(db: PostgresJsDatabase, id: string, data: UpdateLegalTermInput) {
    const { acceptedAt, ...rest } = data
    const [existing] = await db
      .select({
        termType: legalTerms.termType,
        sourceVersionId: legalTerms.sourceVersionId,
        archivedStorageKey: legalTerms.archivedStorageKey,
      })
      .from(legalTerms)
      .where(eq(legalTerms.id, id))
      .limit(1)
    if (!existing) return null
    assertArchivalInvariant({ ...existing, ...rest })
    const [row] = await db
      .update(legalTerms)
      .set({
        ...rest,
        acceptedAt: normalizeTimestamp(acceptedAt),
        updatedAt: new Date(),
      })
      .where(eq(legalTerms.id, id))
      .returning()
    return row ?? null
  },

  async deleteTerm(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .delete(legalTerms)
      .where(eq(legalTerms.id, id))
      .returning({ id: legalTerms.id })
    return row ?? null
  },
}
