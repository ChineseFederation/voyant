import type {
  ReconcileSupplierOperationV1,
  ResolveSupplierOperationV1,
  SupplierOperationRecordV1,
  SupplierOperationStateV1,
} from "@voyant-travel/catalog-contracts/booking-engine/supplier-operations"
import { newId } from "@voyant-travel/db/lib/typeid"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { SourceAdapterRegistry } from "./registry.js"
import { createDrizzleBookingSessionRepository } from "./sessions-drizzle.js"
import type { BookingSessionAccessContext } from "./sessions-service.js"
import { createSupplierOperationWorkflow } from "./supplier-operation-workflow.js"
import {
  createDrizzleSupplierOperationRepository,
  serializeSupplierOperation,
} from "./supplier-operations.js"

export interface SupplierOperationOperatorService {
  list(
    input: {
      state?: SupplierOperationStateV1
      sessionId?: string
      limit: number
    },
    access: BookingSessionAccessContext,
  ): Promise<SupplierOperationRecordV1[]>
  get(
    operationId: string,
    access: BookingSessionAccessContext,
  ): Promise<SupplierOperationRecordV1 | null>
  reconcile(
    operationId: string,
    input: ReconcileSupplierOperationV1,
    access: BookingSessionAccessContext,
  ): Promise<SupplierOperationRecordV1>
  resolve(
    operationId: string,
    input: ResolveSupplierOperationV1,
    access: BookingSessionAccessContext,
  ): Promise<SupplierOperationRecordV1>
}

export function createSupplierOperationOperatorService(deps: {
  db: PostgresJsDatabase
  resolveRegistry(): SourceAdapterRegistry | Promise<SourceAdapterRegistry>
  now?: () => Date
}): SupplierOperationOperatorService {
  const now = deps.now ?? (() => new Date())
  return {
    async list(input, access) {
      requireOperator(access)
      return (
        await createDrizzleSupplierOperationRepository(deps.db).list({
          ...(input.state ? { state: input.state } : {}),
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
          limit: input.limit,
        })
      ).map(serializeSupplierOperation)
    },
    async get(operationId, access) {
      requireOperator(access)
      const operation = await createDrizzleSupplierOperationRepository(deps.db).get(operationId)
      return operation ? serializeSupplierOperation(operation) : null
    },
    async reconcile(operationId, input, access) {
      requireOperator(access)
      const repository = createDrizzleSupplierOperationRepository(deps.db)
      const operation = await repository.get(operationId)
      if (!operation) throw new Error("supplier_operation_not_found")
      const prior = operation.safeEvidence.lastOperatorReconcile
      if (
        prior &&
        typeof prior === "object" &&
        Reflect.get(prior, "idempotencyKey") === input.idempotencyKey
      ) {
        return serializeSupplierOperation(operation)
      }
      const workflow = createSupplierOperationWorkflow({
        repository,
        registry: await deps.resolveRegistry(),
      })
      const outcome = await workflow.reconcile(operation, {
        adapterContext: { connection_id: operation.sourceConnectionId },
        now: now(),
      })
      if (outcome.kind === "idempotency_conflict") {
        throw new Error("supplier_operation_idempotency_conflict")
      }
      if (outcome.kind === "failed") {
        await reopenSupplierPendingSession(deps.db, outcome.operation.sessionId, now())
      }
      outcome.operation.safeEvidence = {
        ...outcome.operation.safeEvidence,
        lastOperatorReconcile: {
          idempotencyKey: input.idempotencyKey,
          at: now().toISOString(),
        },
      }
      await repository.save(outcome.operation)
      await appendOperatorAudit(
        deps.db,
        outcome.operation.sessionId,
        "supplier_reconcile",
        access,
        {
          supplierOperationId: outcome.operation.id,
          state: outcome.operation.state,
          idempotencyKey: input.idempotencyKey,
        },
      )
      return serializeSupplierOperation(outcome.operation)
    },
    async resolve(operationId, input, access) {
      requireOperator(access)
      return deps.db.transaction(async (rawTx) => {
        const tx = rawTx as PostgresJsDatabase
        const repository = createDrizzleSupplierOperationRepository(tx)
        const operation = await repository.getForUpdate(operationId)
        if (!operation) throw new Error("supplier_operation_not_found")
        const prior = operation.safeEvidence.manualResolution
        if (prior && typeof prior === "object") {
          const idempotencyKey = Reflect.get(prior, "idempotencyKey")
          const resolution = Reflect.get(prior, "resolution")
          const reason = Reflect.get(prior, "reason")
          if (
            idempotencyKey === input.idempotencyKey &&
            resolution === input.resolution &&
            reason === input.reason
          ) {
            return serializeSupplierOperation(operation)
          }
          throw new Error("supplier_operation_resolution_conflict")
        }
        if (
          operation.state === "succeeded" ||
          operation.state === "refused" ||
          operation.state === "cancelled"
        ) {
          throw new Error("supplier_operation_already_terminal")
        }
        const upstreamRef = input.upstreamRef ?? operation.upstreamRef
        if (input.resolution === "succeeded" && !upstreamRef) {
          throw new Error("supplier_operation_upstream_ref_required")
        }
        const at = now()
        operation.state = "manually_resolved"
        operation.upstreamStatus = input.resolution
        operation.upstreamRef = upstreamRef
        operation.resolvedAt = at
        operation.updatedAt = at
        operation.nextReconcileAt = undefined
        operation.resolvedBy = access.principalId ?? "operator"
        operation.resolutionReason = input.reason
        operation.safeEvidence = {
          ...operation.safeEvidence,
          manualResolution: {
            idempotencyKey: input.idempotencyKey,
            resolution: input.resolution,
            reason: input.reason,
          },
        }
        await repository.save(operation)
        if (input.resolution !== "succeeded") {
          const sessions = createDrizzleBookingSessionRepository(tx)
          const session = await sessions.getSession(operation.sessionId)
          if (session?.state === "supplier_pending") {
            session.state = "active"
            session.updatedAt = at
            await sessions.saveSession(session)
          }
        }
        await appendOperatorAudit(tx, operation.sessionId, "supplier_manual_resolve", access, {
          supplierOperationId: operation.id,
          resolution: input.resolution,
          reason: input.reason,
        })
        return serializeSupplierOperation(operation)
      })
    },
  }
}

async function reopenSupplierPendingSession(
  db: PostgresJsDatabase,
  sessionId: string,
  at: Date,
): Promise<void> {
  const sessions = createDrizzleBookingSessionRepository(db)
  await sessions.withSessionTransaction(sessionId, async () => {
    const session = await sessions.getSession(sessionId)
    if (session?.state !== "supplier_pending") return
    session.state = "active"
    session.updatedAt = at
    await sessions.saveSession(session)
  })
}

function requireOperator(access: BookingSessionAccessContext): void {
  if (access.actorKind !== "staff" || !access.staffAuthority?.admitted) {
    throw new Error("supplier_operation_operator_authority_required")
  }
}

async function appendOperatorAudit(
  db: PostgresJsDatabase,
  sessionId: string,
  action: "supplier_reconcile" | "supplier_manual_resolve",
  access: BookingSessionAccessContext,
  metadata: Record<string, unknown>,
): Promise<void> {
  await createDrizzleBookingSessionRepository(db).appendAudit({
    id: newId("booking_session_audit_events"),
    sessionId,
    action,
    actorKind: access.actorKind,
    principalId: access.principalId,
    organizationId: access.organizationId,
    authorityReason: access.staffAuthority?.reason,
    metadata,
    createdAt: new Date(),
  })
}
