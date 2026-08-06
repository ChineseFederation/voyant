import { AsyncLocalStorage } from "node:async_hooks"
import { newId } from "@voyant-travel/db/lib/typeid"
import { and, eq, inArray, isNull, lte, notExists, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { BookingRequirementsV1, PricingBreakdownV1 } from "./contracts.js"
import {
  bookingSessionAuditEventsTable,
  bookingSessionCommitsTable,
  bookingSessionHoldsTable,
  bookingSessionOperationsTable,
  bookingSessionQuotesTable,
  bookingSessionsTable,
  type SelectBookingSession,
  type SelectBookingSessionCommit,
  type SelectBookingSessionHold,
  type SelectBookingSessionQuote,
} from "./sessions-schema.js"
import type {
  BookingCommitInternalRecord,
  BookingHoldInternalRecord,
  BookingQuoteInternalRecord,
  BookingSessionInternalRecord,
  BookingSessionRepository,
} from "./sessions-service.js"
import { supplierOperationsTable } from "./supplier-operations-schema.js"

export function createDrizzleBookingSessionRepository(
  db: PostgresJsDatabase,
): BookingSessionRepository {
  const txStore = new AsyncLocalStorage<PostgresJsDatabase>()
  const resolveDb = () => txStore.getStore() ?? db

  return {
    async createSession(record) {
      const [row] = await resolveDb()
        .insert(bookingSessionsTable)
        .values({
          id: record.id,
          createIdempotencyKey: record.createIdempotencyKey,
          createRequestFingerprint: record.createRequestFingerprint,
          capabilityHash: record.capabilityHash ?? null,
          capabilityScopes: record.capabilityScopes,
          actorKind: record.actorKind,
          ownerPrincipalId: record.ownerPrincipalId ?? null,
          ownerOrganizationId: record.ownerOrganizationId ?? null,
          storefrontId: record.storefrontOrigin?.storefrontId ?? null,
          channelId: record.storefrontOrigin?.channelId ?? null,
          locale: record.scope.locale,
          market: record.scope.market,
          currency: record.scope.currency ?? null,
          targetKind: record.target.kind,
          productId: record.target.kind === "product" ? record.target.productId : null,
          catalogItemId: record.target.kind === "catalog_item" ? record.target.catalogItemId : null,
          targetEntityModule:
            record.target.kind === "owned_entity" ? record.target.entityModule : null,
          targetEntityId: record.target.kind === "owned_entity" ? record.target.entityId : null,
          tripSnapshotId:
            record.target.kind === "trip_snapshot" ? record.target.tripSnapshotId : null,
          tripEnvelopeId:
            record.target.kind === "trip_snapshot" ? record.target.tripEnvelopeId : null,
          proposalId:
            record.origin?.kind === "accepted_proposal_version" ? record.origin.proposalId : null,
          proposalVersionId:
            record.origin?.kind === "accepted_proposal_version"
              ? record.origin.proposalVersionId
              : null,
          state: record.state,
          revision: record.revision,
          statePayload: record.statePayload,
          expiresAt: record.expiresAt,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        })
        .onConflictDoNothing({ target: bookingSessionsTable.createIdempotencyKey })
        .returning()
      if (row) return mapSession(row)
      const [existing] = await resolveDb()
        .select()
        .from(bookingSessionsTable)
        .where(eq(bookingSessionsTable.createIdempotencyKey, record.createIdempotencyKey))
        .limit(1)
      return existing ? mapSession(existing) : record
    },
    async getSession(sessionId) {
      const [row] = await resolveDb()
        .select()
        .from(bookingSessionsTable)
        .where(eq(bookingSessionsTable.id, sessionId))
        .limit(1)
      return row ? mapSession(row) : null
    },
    async getSessionByCreateIdempotency(idempotencyKey) {
      const [row] = await resolveDb()
        .select()
        .from(bookingSessionsTable)
        .where(eq(bookingSessionsTable.createIdempotencyKey, idempotencyKey))
        .limit(1)
      return row ? mapSession(row) : null
    },
    async saveSession(record) {
      await resolveDb()
        .update(bookingSessionsTable)
        .set({
          createIdempotencyKey: record.createIdempotencyKey,
          createRequestFingerprint: record.createRequestFingerprint,
          capabilityHash: record.capabilityHash ?? null,
          capabilityScopes: record.capabilityScopes,
          actorKind: record.actorKind,
          ownerPrincipalId: record.ownerPrincipalId ?? null,
          ownerOrganizationId: record.ownerOrganizationId ?? null,
          storefrontId: record.storefrontOrigin?.storefrontId ?? null,
          channelId: record.storefrontOrigin?.channelId ?? null,
          // `locale` / `market` / `currency` are deliberately absent: the
          // Session's commercial scope is fixed at create, so no update path
          // can move a live Session into another market.
          targetKind: record.target.kind,
          productId: record.target.kind === "product" ? record.target.productId : null,
          catalogItemId: record.target.kind === "catalog_item" ? record.target.catalogItemId : null,
          targetEntityModule:
            record.target.kind === "owned_entity" ? record.target.entityModule : null,
          targetEntityId: record.target.kind === "owned_entity" ? record.target.entityId : null,
          tripSnapshotId:
            record.target.kind === "trip_snapshot" ? record.target.tripSnapshotId : null,
          tripEnvelopeId:
            record.target.kind === "trip_snapshot" ? record.target.tripEnvelopeId : null,
          proposalId:
            record.origin?.kind === "accepted_proposal_version" ? record.origin.proposalId : null,
          proposalVersionId:
            record.origin?.kind === "accepted_proposal_version"
              ? record.origin.proposalVersionId
              : null,
          state: record.state,
          revision: record.revision,
          statePayload: record.statePayload,
          expiresAt: record.expiresAt,
          consumedAt: record.state === "consumed" ? record.updatedAt : null,
          abandonedAt: record.state === "abandoned" ? record.updatedAt : null,
          purgedAt: record.purgedAt ?? null,
          updatedAt: record.updatedAt,
        })
        .where(eq(bookingSessionsTable.id, record.id))
    },
    async appendAudit(record) {
      await resolveDb().insert(bookingSessionAuditEventsTable).values({
        id: record.id,
        sessionId: record.sessionId,
        action: record.action,
        actorKind: record.actorKind,
        principalId: record.principalId,
        organizationId: record.organizationId,
        authorityReason: record.authorityReason,
        metadata: record.metadata,
        createdAt: record.createdAt,
      })
    },
    async listExpiryCandidates(input) {
      const rows = await resolveDb()
        .select()
        .from(bookingSessionsTable)
        .where(
          and(
            eq(bookingSessionsTable.state, "active"),
            lte(bookingSessionsTable.expiresAt, input.at),
            notExists(
              resolveDb()
                .select({ id: supplierOperationsTable.id })
                .from(supplierOperationsTable)
                .where(
                  and(
                    eq(supplierOperationsTable.sessionId, bookingSessionsTable.id),
                    inArray(supplierOperationsTable.state, [
                      "queued",
                      "submitted",
                      "pending",
                      "in_doubt",
                      "manual_review",
                      "succeeded",
                      "manually_resolved",
                    ]),
                  ),
                ),
            ),
          ),
        )
        .limit(input.limit)
      return rows.map(mapSession)
    },
    async listPurgeCandidates(input) {
      const rows = await resolveDb()
        .select()
        .from(bookingSessionsTable)
        .where(
          and(
            inArray(bookingSessionsTable.state, ["consumed", "expired", "abandoned"]),
            isNull(bookingSessionsTable.purgedAt),
            lte(bookingSessionsTable.updatedAt, input.before),
          ),
        )
        .limit(input.limit)
      return rows.map(mapSession)
    },
    async purgeSessionArtifacts(sessionId) {
      await resolveDb()
        .delete(bookingSessionOperationsTable)
        .where(eq(bookingSessionOperationsTable.sessionId, sessionId))
    },
    async listActiveQuotes(sessionId) {
      const rows = await resolveDb()
        .select()
        .from(bookingSessionQuotesTable)
        .where(
          and(
            eq(bookingSessionQuotesTable.sessionId, sessionId),
            eq(bookingSessionQuotesTable.state, "active"),
          ),
        )
      return rows.map(mapQuote)
    },
    async getQuote(quoteId) {
      const [row] = await resolveDb()
        .select()
        .from(bookingSessionQuotesTable)
        .where(eq(bookingSessionQuotesTable.id, quoteId))
        .limit(1)
      return row ? mapQuote(row) : null
    },
    async saveQuote(record) {
      await resolveDb()
        .insert(bookingSessionQuotesTable)
        .values({
          id: record.id,
          sessionId: record.sessionId,
          sessionRevision: record.sessionRevision,
          state: record.state,
          requirements: record.requirements,
          pricing: record.pricing,
          priceFingerprint: record.priceFingerprint,
          requirementsFingerprint: record.requirementsFingerprint,
          quotedAt: record.quotedAt,
          expiresAt: record.expiresAt,
          consumedAt: record.state === "consumed" ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: bookingSessionQuotesTable.id,
          set: {
            state: record.state,
            requirements: record.requirements,
            pricing: record.pricing,
            priceFingerprint: record.priceFingerprint,
            requirementsFingerprint: record.requirementsFingerprint,
            expiresAt: record.expiresAt,
            consumedAt: record.state === "consumed" ? new Date() : null,
          },
        })
    },
    async getHold(holdId) {
      const [row] = await resolveDb()
        .select()
        .from(bookingSessionHoldsTable)
        .where(eq(bookingSessionHoldsTable.id, holdId))
        .limit(1)
      return row ? mapHold(row) : null
    },
    async listActiveHolds(sessionId) {
      const rows = await resolveDb()
        .select()
        .from(bookingSessionHoldsTable)
        .where(
          and(
            eq(bookingSessionHoldsTable.sessionId, sessionId),
            eq(bookingSessionHoldsTable.state, "active"),
          ),
        )
      return rows.map(mapHold)
    },
    async saveHold(record) {
      await resolveDb()
        .insert(bookingSessionHoldsTable)
        .values({
          id: record.id,
          sessionId: record.sessionId,
          quoteId: record.quoteId,
          target: record.target,
          quantity: record.quantity,
          state: record.state,
          capacityKey: record.capacityKey,
          expiresAt: record.expiresAt,
          convertedAt: record.state === "converted" ? new Date() : null,
          releasedAt: record.state === "released" ? new Date() : null,
          createdAt: record.createdAt,
        })
        .onConflictDoUpdate({
          target: bookingSessionHoldsTable.id,
          set: {
            target: record.target,
            quantity: record.quantity,
            state: record.state,
            capacityKey: record.capacityKey,
            expiresAt: record.expiresAt,
            convertedAt: record.state === "converted" ? new Date() : null,
            releasedAt: record.state === "released" ? new Date() : null,
          },
        })
    },
    async getCommitByIdempotency(sessionId, idempotencyKey) {
      const [row] = await resolveDb()
        .select()
        .from(bookingSessionCommitsTable)
        .where(
          and(
            eq(bookingSessionCommitsTable.sessionId, sessionId),
            eq(bookingSessionCommitsTable.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1)
      return row ? mapCommit(row) : null
    },
    async getCommitForSession(sessionId) {
      const [row] = await resolveDb()
        .select()
        .from(bookingSessionCommitsTable)
        .where(eq(bookingSessionCommitsTable.sessionId, sessionId))
        .limit(1)
      return row ? mapCommit(row) : null
    },
    async saveCommit(record) {
      await resolveDb().insert(bookingSessionCommitsTable).values({
        id: record.id,
        sessionId: record.sessionId,
        idempotencyKey: record.idempotencyKey,
        requestFingerprint: record.requestFingerprint,
        outcome: record.outcome,
        bookingId: record.bookingId,
        createdAt: record.createdAt,
      })
    },
    async claimOperation(record) {
      const [row] = await resolveDb()
        .insert(bookingSessionOperationsTable)
        .values({
          id: record.id,
          sessionId: record.sessionId,
          operation: record.operation,
          idempotencyKey: record.idempotencyKey,
          requestFingerprint: record.requestFingerprint,
          createdAt: record.now,
        })
        .onConflictDoNothing()
        .returning()
      if (row) return { status: "claimed" as const, id: row.id }

      const [existing] = await resolveDb()
        .select()
        .from(bookingSessionOperationsTable)
        .where(
          and(
            eq(bookingSessionOperationsTable.sessionId, record.sessionId),
            eq(bookingSessionOperationsTable.operation, record.operation),
            eq(bookingSessionOperationsTable.idempotencyKey, record.idempotencyKey),
          ),
        )
        .limit(1)
      if (!existing || existing.requestFingerprint !== record.requestFingerprint) {
        return { status: "conflict" as const }
      }
      return existing.outcome
        ? { status: "replay" as const, outcome: existing.outcome as never }
        : { status: "conflict" as const }
    },
    async completeOperation(record) {
      await resolveDb()
        .update(bookingSessionOperationsTable)
        .set({ outcome: record.outcome })
        .where(eq(bookingSessionOperationsTable.id, record.id))
    },
    async consumeCommit(input) {
      const at = input.now
      const [session] = await resolveDb()
        .update(bookingSessionsTable)
        .set({
          state: "consumed",
          revision: sql`${bookingSessionsTable.revision} + 1`,
          consumedAt: at,
          updatedAt: at,
        })
        .where(
          and(
            eq(bookingSessionsTable.id, input.sessionId),
            inArray(bookingSessionsTable.state, [
              "active",
              "supplier_pending",
              "component_pending",
            ]),
          ),
        )
        .returning()
      if (!session) throw new Error("booking_session_commit_session_consumed")
      const [quote] = await resolveDb()
        .update(bookingSessionQuotesTable)
        .set({ state: "consumed", consumedAt: at })
        .where(
          and(
            eq(bookingSessionQuotesTable.id, input.quoteId),
            eq(bookingSessionQuotesTable.sessionId, input.sessionId),
            eq(bookingSessionQuotesTable.state, "active"),
          ),
        )
        .returning()
      if (!quote) throw new Error("booking_session_commit_quote_consumed")
      if (input.holdId) {
        const [hold] = await resolveDb()
          .update(bookingSessionHoldsTable)
          .set({ state: "converted", convertedAt: at })
          .where(
            and(
              eq(bookingSessionHoldsTable.id, input.holdId),
              eq(bookingSessionHoldsTable.sessionId, input.sessionId),
              eq(bookingSessionHoldsTable.state, "active"),
            ),
          )
          .returning()
        if (!hold) throw new Error("booking_session_commit_hold_consumed")
      }
      await resolveDb()
        .insert(bookingSessionCommitsTable)
        .values({
          id: newId("booking_session_commits"),
          sessionId: input.sessionId,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: input.requestFingerprint,
          outcome: input.outcome,
          bookingId: input.bookingId,
          createdAt: at,
        })
    },
    async withTransactionContext(tx, operation) {
      return txStore.run(tx as PostgresJsDatabase, operation)
    },
    async withSessionTransaction(sessionId, operation) {
      if (typeof db.transaction !== "function") {
        throw new Error("Booking Session writes require a transaction-capable database")
      }
      return db.transaction(async (tx) =>
        txStore.run(tx as PostgresJsDatabase, async () => {
          await resolveDb().execute(
            sql`select id from booking_sessions where id = ${sessionId} for update`,
          )
          return operation(tx)
        }),
      )
    },
  }
}

function mapSession(row: SelectBookingSession): BookingSessionInternalRecord {
  return {
    id: row.id,
    createIdempotencyKey: row.createIdempotencyKey,
    createRequestFingerprint: row.createRequestFingerprint,
    capabilityHash: row.capabilityHash ?? undefined,
    capabilityScopes: row.capabilityScopes,
    target:
      row.targetKind === "catalog_item"
        ? { kind: "catalog_item", catalogItemId: row.catalogItemId ?? "" }
        : row.targetKind === "owned_entity"
          ? {
              kind: "owned_entity",
              entityModule: row.targetEntityModule ?? "",
              entityId: row.targetEntityId ?? "",
            }
          : row.targetKind === "trip_snapshot"
            ? {
                kind: "trip_snapshot",
                tripSnapshotId: row.tripSnapshotId ?? "",
                tripEnvelopeId: row.tripEnvelopeId ?? "",
              }
            : { kind: "product", productId: row.productId ?? "" },
    ...(row.proposalId && row.proposalVersionId && row.tripSnapshotId
      ? {
          origin: {
            kind: "accepted_proposal_version" as const,
            proposalId: row.proposalId,
            proposalVersionId: row.proposalVersionId,
            tripSnapshotId: row.tripSnapshotId,
          },
        }
      : {}),
    actorKind: row.actorKind as BookingSessionInternalRecord["actorKind"],
    ownerPrincipalId: row.ownerPrincipalId ?? undefined,
    ownerOrganizationId: row.ownerOrganizationId ?? undefined,
    storefrontOrigin:
      row.storefrontId && row.channelId
        ? { storefrontId: row.storefrontId, channelId: row.channelId }
        : undefined,
    scope: {
      locale: row.locale,
      market: row.market,
      ...(row.currency ? { currency: row.currency } : {}),
    },
    state: row.state as BookingSessionInternalRecord["state"],
    revision: row.revision,
    statePayload: row.statePayload,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    purgedAt: row.purgedAt ?? undefined,
  }
}

function mapQuote(row: SelectBookingSessionQuote): BookingQuoteInternalRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    sessionRevision: row.sessionRevision,
    state: row.state as BookingQuoteInternalRecord["state"],
    requirements: row.requirements as BookingRequirementsV1,
    pricing: row.pricing as PricingBreakdownV1,
    priceFingerprint: row.priceFingerprint,
    requirementsFingerprint: row.requirementsFingerprint,
    quotedAt: row.quotedAt,
    expiresAt: row.expiresAt,
  }
}

function mapHold(row: SelectBookingSessionHold): BookingHoldInternalRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    quoteId: row.quoteId,
    target: row.target,
    quantity: row.quantity,
    state: row.state as BookingHoldInternalRecord["state"],
    capacityKey: row.capacityKey,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  }
}

function mapCommit(row: SelectBookingSessionCommit): BookingCommitInternalRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    idempotencyKey: row.idempotencyKey,
    requestFingerprint: row.requestFingerprint,
    outcome: row.outcome as BookingCommitInternalRecord["outcome"],
    bookingId: row.bookingId ?? undefined,
    createdAt: row.createdAt,
  }
}
