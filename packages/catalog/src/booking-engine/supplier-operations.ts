import type {
  SupplierCommitmentPolicyV1,
  SupplierOperationKindV1,
  SupplierOperationRecordV1,
  SupplierOperationStateV1,
  SupplierOperationSubjectTypeV1,
} from "@voyant-travel/catalog-contracts/booking-engine/supplier-operations"
import { newId } from "@voyant-travel/db/lib/typeid"
import { and, desc, eq, inArray, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type SelectSupplierOperation,
  supplierOperationsTable,
} from "./supplier-operations-schema.js"

export interface SupplierOperationInternalRecord {
  id: string
  subjectType: SupplierOperationSubjectTypeV1
  subjectId: string
  sessionId?: string
  scopeKey: string
  quoteId?: string
  holdId?: string
  bookingItemId?: string
  amendmentId?: string
  idempotencyKey: string
  operationKind: SupplierOperationKindV1
  state: SupplierOperationStateV1
  commitmentPolicy: SupplierCommitmentPolicyV1
  entityModule: string
  entityId: string
  sourceKind: string
  sourceConnectionId: string
  sourceRef: string
  adapterKind: string
  requestFingerprint: string
  adapterIdempotencyKey: string
  requestPayload: Record<string, unknown>
  version: number
  attemptCount: number
  upstreamRef?: string
  upstreamStatus?: string
  bookingId?: string
  lastErrorClass?: string
  safeEvidence: Record<string, unknown>
  submittedAt?: Date
  lastCheckedAt?: Date
  sourceUpdatedAt?: Date
  nextReconcileAt?: Date
  resolvedAt?: Date
  resolvedBy?: string
  resolutionReason?: string
  createdAt: Date
  updatedAt: Date
}

export type CreateSupplierOperationResult =
  | { status: "created"; operation: SupplierOperationInternalRecord }
  | { status: "replay"; operation: SupplierOperationInternalRecord }
  | { status: "conflict" }

export interface SupplierOperationRepository {
  createOrReplay(record: SupplierOperationInternalRecord): Promise<CreateSupplierOperationResult>
  get(operationId: string): Promise<SupplierOperationInternalRecord | null>
  getByIdempotency(
    subjectType: SupplierOperationSubjectTypeV1,
    subjectId: string,
    idempotencyKey: string,
    scopeKey?: string,
  ): Promise<SupplierOperationInternalRecord | null>
  getBySession(sessionId: string): Promise<SupplierOperationInternalRecord | null>
  getBlockingBySession(
    sessionId: string,
    scopeKey?: string,
  ): Promise<SupplierOperationInternalRecord | null>
  getForUpdate(operationId: string): Promise<SupplierOperationInternalRecord | null>
  list(input: {
    state?: SupplierOperationStateV1
    sessionId?: string
    amendmentId?: string
    limit: number
  }): Promise<SupplierOperationInternalRecord[]>
  claimDispatch(operationId: string, at: Date): Promise<SupplierOperationInternalRecord | null>
  save(record: SupplierOperationInternalRecord): Promise<void>
}

export function createDrizzleSupplierOperationRepository(
  db: PostgresJsDatabase,
): SupplierOperationRepository {
  async function getBySession(sessionId: string): Promise<SupplierOperationInternalRecord | null> {
    const [row] = await db
      .select()
      .from(supplierOperationsTable)
      .where(eq(supplierOperationsTable.sessionId, sessionId))
      .orderBy(desc(supplierOperationsTable.createdAt), desc(supplierOperationsTable.id))
      .limit(1)
    return row ? mapSupplierOperation(row) : null
  }

  async function getBlockingBySession(
    sessionId: string,
    scopeKey?: string,
  ): Promise<SupplierOperationInternalRecord | null> {
    const [row] = await db
      .select()
      .from(supplierOperationsTable)
      .where(
        and(
          eq(supplierOperationsTable.sessionId, sessionId),
          ...(scopeKey ? [eq(supplierOperationsTable.scopeKey, scopeKey)] : []),
          or(
            inArray(supplierOperationsTable.state, [
              "queued",
              "submitted",
              "pending",
              "succeeded",
              "in_doubt",
              "manual_review",
            ]),
            and(
              eq(supplierOperationsTable.state, "manually_resolved"),
              eq(supplierOperationsTable.upstreamStatus, "succeeded"),
            ),
          ),
        ),
      )
      .orderBy(desc(supplierOperationsTable.createdAt), desc(supplierOperationsTable.id))
      .limit(1)
    return row ? mapSupplierOperation(row) : null
  }

  async function getByIdempotency(
    subjectType: SupplierOperationSubjectTypeV1,
    subjectId: string,
    idempotencyKey: string,
    scopeKey?: string,
  ): Promise<SupplierOperationInternalRecord | null> {
    const [row] = await db
      .select()
      .from(supplierOperationsTable)
      .where(
        and(
          eq(supplierOperationsTable.subjectType, subjectType),
          eq(supplierOperationsTable.subjectId, subjectId),
          ...(scopeKey ? [eq(supplierOperationsTable.scopeKey, scopeKey)] : []),
          eq(supplierOperationsTable.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1)
    return row ? mapSupplierOperation(row) : null
  }

  return {
    async createOrReplay(record) {
      const replay = await getByIdempotency(
        record.subjectType,
        record.subjectId,
        record.idempotencyKey,
        record.scopeKey,
      )
      if (replay) {
        return replay.requestFingerprint === record.requestFingerprint
          ? { status: "replay", operation: replay }
          : { status: "conflict" }
      }
      const [blocking] = await db
        .select()
        .from(supplierOperationsTable)
        .where(
          and(
            eq(supplierOperationsTable.subjectType, record.subjectType),
            eq(supplierOperationsTable.subjectId, record.subjectId),
            eq(supplierOperationsTable.scopeKey, record.scopeKey),
            eq(supplierOperationsTable.operationKind, record.operationKind),
            inArray(supplierOperationsTable.state, [
              "queued",
              "submitted",
              "pending",
              "succeeded",
              "in_doubt",
              "manual_review",
            ]),
          ),
        )
        .limit(1)
      if (blocking) {
        return { status: "conflict" }
      }
      const [created] = await db
        .insert(supplierOperationsTable)
        .values(toInsert(record))
        .onConflictDoNothing()
        .returning()
      if (created) return { status: "created", operation: mapSupplierOperation(created) }
      const existing = await getByIdempotency(
        record.subjectType,
        record.subjectId,
        record.idempotencyKey,
        record.scopeKey,
      )
      if (
        !existing ||
        existing.idempotencyKey !== record.idempotencyKey ||
        existing.requestFingerprint !== record.requestFingerprint
      ) {
        return { status: "conflict" }
      }
      return { status: "replay", operation: existing }
    },

    async get(operationId) {
      const [row] = await db
        .select()
        .from(supplierOperationsTable)
        .where(eq(supplierOperationsTable.id, operationId))
        .limit(1)
      return row ? mapSupplierOperation(row) : null
    },

    async getByIdempotency(subjectType, subjectId, idempotencyKey, scopeKey) {
      return getByIdempotency(subjectType, subjectId, idempotencyKey, scopeKey)
    },

    async getBySession(sessionId) {
      return getBySession(sessionId)
    },

    async getBlockingBySession(sessionId, scopeKey) {
      return getBlockingBySession(sessionId, scopeKey)
    },

    async getForUpdate(operationId) {
      const [row] = await db
        .select()
        .from(supplierOperationsTable)
        .where(eq(supplierOperationsTable.id, operationId))
        .limit(1)
        .for("update")
      return row ? mapSupplierOperation(row) : null
    },

    async list(input) {
      const conditions = [
        ...(input.state ? [eq(supplierOperationsTable.state, input.state)] : []),
        ...(input.sessionId ? [eq(supplierOperationsTable.sessionId, input.sessionId)] : []),
        ...(input.amendmentId ? [eq(supplierOperationsTable.amendmentId, input.amendmentId)] : []),
      ]
      const rows = await db
        .select()
        .from(supplierOperationsTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(supplierOperationsTable.createdAt))
        .limit(Math.max(1, Math.min(input.limit, 100)))
      return rows.map(mapSupplierOperation)
    },

    async claimDispatch(operationId, at) {
      const [row] = await db
        .update(supplierOperationsTable)
        .set({
          state: "submitted",
          version: sql`${supplierOperationsTable.version} + 1`,
          attemptCount: sql`${supplierOperationsTable.attemptCount} + 1`,
          submittedAt: at,
          updatedAt: at,
        })
        .where(
          and(
            eq(supplierOperationsTable.id, operationId),
            eq(supplierOperationsTable.state, "queued"),
          ),
        )
        .returning()
      return row ? mapSupplierOperation(row) : null
    },

    async save(record) {
      const [saved] = await db
        .update(supplierOperationsTable)
        .set({
          state: record.state,
          version: record.version + 1,
          attemptCount: record.attemptCount,
          upstreamRef: record.upstreamRef ?? null,
          upstreamStatus: record.upstreamStatus ?? null,
          bookingId: record.bookingId ?? null,
          lastErrorClass: record.lastErrorClass ?? null,
          safeEvidence: record.safeEvidence,
          submittedAt: record.submittedAt ?? null,
          lastCheckedAt: record.lastCheckedAt ?? null,
          sourceUpdatedAt: record.sourceUpdatedAt ?? null,
          nextReconcileAt: record.nextReconcileAt ?? null,
          resolvedAt: record.resolvedAt ?? null,
          resolvedBy: record.resolvedBy ?? null,
          resolutionReason: record.resolutionReason ?? null,
          updatedAt: record.updatedAt,
        })
        .where(
          and(
            eq(supplierOperationsTable.id, record.id),
            eq(supplierOperationsTable.version, record.version),
          ),
        )
        .returning({ version: supplierOperationsTable.version })
      if (!saved) throw new Error("supplier_operation_concurrent_update")
      record.version = saved.version
    },
  }
}

export function createSupplierOperationRecord(input: {
  subjectType: SupplierOperationSubjectTypeV1
  subjectId: string
  sessionId?: string
  scopeKey?: string
  quoteId?: string
  holdId?: string
  bookingId?: string
  bookingItemId?: string
  amendmentId?: string
  idempotencyKey: string
  operationKind: SupplierOperationKindV1
  commitmentPolicy?: SupplierCommitmentPolicyV1
  entityModule: string
  entityId: string
  sourceKind: string
  sourceConnectionId: string
  sourceRef: string
  adapterKind: string
  requestFingerprint: string
  adapterIdempotencyKey: string
  requestPayload: Record<string, unknown>
  upstreamRef?: string
  now: Date
}): SupplierOperationInternalRecord {
  return {
    id: newId("supplier_operations"),
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    scopeKey: input.scopeKey ?? "session",
    ...(input.quoteId ? { quoteId: input.quoteId } : {}),
    ...(input.holdId ? { holdId: input.holdId } : {}),
    ...(input.bookingId ? { bookingId: input.bookingId } : {}),
    ...(input.bookingItemId ? { bookingItemId: input.bookingItemId } : {}),
    ...(input.amendmentId ? { amendmentId: input.amendmentId } : {}),
    idempotencyKey: input.idempotencyKey,
    operationKind: input.operationKind,
    state: "queued",
    commitmentPolicy: input.commitmentPolicy ?? "supplier_first",
    entityModule: input.entityModule,
    entityId: input.entityId,
    sourceKind: input.sourceKind,
    sourceConnectionId: input.sourceConnectionId,
    sourceRef: input.sourceRef,
    adapterKind: input.adapterKind,
    requestFingerprint: input.requestFingerprint,
    adapterIdempotencyKey: input.adapterIdempotencyKey,
    requestPayload: input.requestPayload,
    ...(input.upstreamRef ? { upstreamRef: input.upstreamRef } : {}),
    version: 0,
    attemptCount: 0,
    safeEvidence: { intentPersistedBeforeDispatch: true },
    createdAt: input.now,
    updatedAt: input.now,
  }
}

export function serializeSupplierOperation(
  operation: SupplierOperationInternalRecord,
): SupplierOperationRecordV1 {
  return {
    id: operation.id,
    subjectType: operation.subjectType,
    subjectId: operation.subjectId,
    sessionId: operation.sessionId ?? null,
    scopeKey: operation.scopeKey,
    quoteId: operation.quoteId ?? null,
    holdId: operation.holdId ?? null,
    bookingItemId: operation.bookingItemId ?? null,
    amendmentId: operation.amendmentId ?? null,
    operationKind: operation.operationKind,
    state: operation.state,
    commitmentPolicy: operation.commitmentPolicy,
    entityModule: operation.entityModule,
    entityId: operation.entityId,
    sourceKind: operation.sourceKind,
    sourceConnectionId: operation.sourceConnectionId,
    sourceRef: operation.sourceRef,
    adapterKind: operation.adapterKind,
    requestFingerprint: operation.requestFingerprint,
    adapterIdempotencyKey: operation.adapterIdempotencyKey,
    attemptCount: operation.attemptCount,
    upstreamRef: operation.upstreamRef ?? null,
    upstreamStatus: operation.upstreamStatus ?? null,
    bookingId: operation.bookingId ?? null,
    lastErrorClass: operation.lastErrorClass ?? null,
    safeEvidence: operation.safeEvidence,
    submittedAt: operation.submittedAt?.toISOString() ?? null,
    lastCheckedAt: operation.lastCheckedAt?.toISOString() ?? null,
    sourceUpdatedAt: operation.sourceUpdatedAt?.toISOString() ?? null,
    nextReconcileAt: operation.nextReconcileAt?.toISOString() ?? null,
    resolvedAt: operation.resolvedAt?.toISOString() ?? null,
    resolvedBy: operation.resolvedBy ?? null,
    resolutionReason: operation.resolutionReason ?? null,
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString(),
  }
}

function toInsert(record: SupplierOperationInternalRecord) {
  return {
    id: record.id,
    subjectType: record.subjectType,
    subjectId: record.subjectId,
    sessionId: record.sessionId,
    scopeKey: record.scopeKey,
    quoteId: record.quoteId,
    holdId: record.holdId,
    idempotencyKey: record.idempotencyKey,
    operationKind: record.operationKind,
    state: record.state,
    commitmentPolicy: record.commitmentPolicy,
    entityModule: record.entityModule,
    entityId: record.entityId,
    sourceKind: record.sourceKind,
    sourceConnectionId: record.sourceConnectionId,
    sourceRef: record.sourceRef,
    adapterKind: record.adapterKind,
    requestFingerprint: record.requestFingerprint,
    adapterIdempotencyKey: record.adapterIdempotencyKey,
    requestPayload: record.requestPayload,
    bookingId: record.bookingId,
    bookingItemId: record.bookingItemId,
    amendmentId: record.amendmentId,
    version: record.version,
    attemptCount: record.attemptCount,
    safeEvidence: record.safeEvidence,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function mapSupplierOperation(row: SelectSupplierOperation): SupplierOperationInternalRecord {
  return {
    id: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    scopeKey: row.scopeKey,
    ...(row.quoteId ? { quoteId: row.quoteId } : {}),
    ...(row.holdId ? { holdId: row.holdId } : {}),
    ...(row.bookingItemId ? { bookingItemId: row.bookingItemId } : {}),
    ...(row.amendmentId ? { amendmentId: row.amendmentId } : {}),
    idempotencyKey: row.idempotencyKey,
    operationKind: row.operationKind,
    state: row.state,
    commitmentPolicy: row.commitmentPolicy,
    entityModule: row.entityModule,
    entityId: row.entityId,
    sourceKind: row.sourceKind,
    sourceConnectionId: row.sourceConnectionId,
    sourceRef: row.sourceRef,
    adapterKind: row.adapterKind,
    requestFingerprint: row.requestFingerprint,
    adapterIdempotencyKey: row.adapterIdempotencyKey,
    requestPayload: row.requestPayload,
    version: row.version,
    attemptCount: row.attemptCount,
    ...(row.upstreamRef ? { upstreamRef: row.upstreamRef } : {}),
    ...(row.upstreamStatus ? { upstreamStatus: row.upstreamStatus } : {}),
    ...(row.bookingId ? { bookingId: row.bookingId } : {}),
    ...(row.lastErrorClass ? { lastErrorClass: row.lastErrorClass } : {}),
    safeEvidence: row.safeEvidence,
    ...(row.submittedAt ? { submittedAt: row.submittedAt } : {}),
    ...(row.lastCheckedAt ? { lastCheckedAt: row.lastCheckedAt } : {}),
    ...(row.sourceUpdatedAt ? { sourceUpdatedAt: row.sourceUpdatedAt } : {}),
    ...(row.nextReconcileAt ? { nextReconcileAt: row.nextReconcileAt } : {}),
    ...(row.resolvedAt ? { resolvedAt: row.resolvedAt } : {}),
    ...(row.resolvedBy ? { resolvedBy: row.resolvedBy } : {}),
    ...(row.resolutionReason ? { resolutionReason: row.resolutionReason } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
