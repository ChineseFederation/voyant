import {
  ReservationDispatchError,
  type ReserveRequest,
  type ReserveResult,
  type SourceAdapterContext,
} from "../adapter/contract.js"
import type { SourceAdapterRegistry } from "./registry.js"
import {
  createSupplierOperationRecord,
  type SupplierOperationInternalRecord,
  type SupplierOperationRepository,
} from "./supplier-operations.js"

export type SupplierOperationWorkflowOutcome =
  | { kind: "secured"; operation: SupplierOperationInternalRecord; result: ReserveResult }
  | { kind: "pending"; operation: SupplierOperationInternalRecord }
  | { kind: "in_doubt"; operation: SupplierOperationInternalRecord }
  | { kind: "failed"; operation: SupplierOperationInternalRecord }
  | { kind: "idempotency_conflict" }

export interface DispatchSupplierReservationInput {
  sessionId: string
  scopeKey?: string
  quoteId: string
  holdId?: string
  commitIdempotencyKey: string
  requestFingerprint: string
  entityModule: string
  entityId: string
  sourceKind: string
  sourceConnectionId: string
  sourceRef: string
  request: ReserveRequest
  adapterContext: SourceAdapterContext
  now: Date
}

export interface SupplierOperationWorkflow {
  dispatch(input: DispatchSupplierReservationInput): Promise<SupplierOperationWorkflowOutcome>
  reconcile(
    operation: SupplierOperationInternalRecord,
    input: { adapterContext: SourceAdapterContext; now: Date },
  ): Promise<SupplierOperationWorkflowOutcome>
}

export function createSupplierOperationWorkflow(deps: {
  repository: SupplierOperationRepository
  registry: SourceAdapterRegistry
  reconcileAfterMs?: number
}): SupplierOperationWorkflow {
  const reconcileAfterMs = deps.reconcileAfterMs ?? 60_000

  return {
    async dispatch(input) {
      const adapter = deps.registry.resolveByConnection(input.sourceConnectionId)
      if (!adapter?.capabilities.supportsBookingForwarding || !adapter.reserve) {
        return operationFailedWithoutDispatch(
          deps.repository,
          input,
          "booking_forwarding_unsupported",
        )
      }
      const scopeKey = input.scopeKey ?? "session"
      const adapterIdempotencyKey = supplierAdapterIdempotencyKey(
        input.sessionId,
        input.commitIdempotencyKey,
        input.scopeKey,
      )
      const claim = await deps.repository.createOrReplay(
        createSupplierOperationRecord({
          sessionId: input.sessionId,
          scopeKey,
          quoteId: input.quoteId,
          ...(input.holdId ? { holdId: input.holdId } : {}),
          commitIdempotencyKey: input.commitIdempotencyKey,
          entityModule: input.entityModule,
          entityId: input.entityId,
          sourceKind: input.sourceKind,
          sourceConnectionId: input.sourceConnectionId,
          sourceRef: input.sourceRef,
          adapterKind: adapter.kind,
          requestFingerprint: input.requestFingerprint,
          adapterIdempotencyKey,
          requestPayload: safeSupplierRequestPayload(input.request),
          now: input.now,
        }),
      )
      if (claim.status === "conflict") return { kind: "idempotency_conflict" }
      const replay = outcomeForStoredOperation(claim.operation)
      if (claim.status === "replay" && replay) return replay

      const operation =
        claim.operation.state === "queued"
          ? await deps.repository.claimDispatch(claim.operation.id, input.now)
          : null
      if (!operation) {
        const current = await deps.repository.get(claim.operation.id)
        return current
          ? (outcomeForStoredOperation(current) ?? { kind: "in_doubt", operation: current })
          : { kind: "in_doubt", operation: claim.operation }
      }

      try {
        const result = await adapter.reserve(input.adapterContext, {
          ...input.request,
          idempotency_key: operation.adapterIdempotencyKey,
        })
        const at = input.now
        operation.updatedAt = at
        operation.upstreamRef = result.upstream_ref
        operation.upstreamStatus = result.status
        operation.safeEvidence = safeEvidence(result)
        if (result.status === "pending") {
          operation.state = "pending"
          operation.nextReconcileAt = new Date(at.getTime() + reconcileAfterMs)
          await deps.repository.save(operation)
          return { kind: "pending", operation }
        }
        operation.resolvedAt = at
        operation.nextReconcileAt = undefined
        if (result.status === "failed") {
          operation.state = "refused"
          await deps.repository.save(operation)
          return { kind: "failed", operation }
        }
        operation.state = "succeeded"
        await deps.repository.save(operation)
        return { kind: "secured", operation, result }
      } catch (error) {
        operation.updatedAt = input.now
        operation.lastErrorClass = errorClass(error)
        if (error instanceof ReservationDispatchError && error.certainty === "not_sent") {
          operation.state = "queued"
          operation.submittedAt = undefined
          operation.nextReconcileAt = new Date(input.now.getTime() + reconcileAfterMs)
          operation.safeEvidence = { dispatchCertainty: "not_sent" }
          await deps.repository.save(operation)
          return { kind: "pending", operation }
        }
        operation.state = "in_doubt"
        operation.nextReconcileAt = new Date(input.now.getTime() + reconcileAfterMs)
        operation.safeEvidence = { dispatchCertainty: "possibly_sent" }
        await deps.repository.save(operation)
        return { kind: "in_doubt", operation }
      }
    },

    async reconcile(operation, input) {
      const terminal = outcomeForStoredOperation(operation)
      if (
        terminal &&
        operation.state !== "pending" &&
        operation.state !== "in_doubt" &&
        operation.state !== "succeeded"
      ) {
        return terminal
      }
      const adapter = deps.registry.resolveByConnection(operation.sourceConnectionId)
      if (
        !adapter?.capabilities.supportsReservationRetrieval ||
        !adapter.getReservation ||
        (!operation.upstreamRef && !adapter.capabilities.supportsReservationLookupByIdempotencyKey)
      ) {
        operation.state = "manual_review"
        operation.lastCheckedAt = input.now
        operation.updatedAt = input.now
        operation.nextReconcileAt = undefined
        operation.lastErrorClass = "reservation_retrieval_unsupported"
        await deps.repository.save(operation)
        return { kind: "in_doubt", operation }
      }
      try {
        const result = await adapter.getReservation(
          input.adapterContext,
          operation.upstreamRef
            ? { upstream_ref: operation.upstreamRef }
            : { idempotency_key: operation.adapterIdempotencyKey },
        )
        operation.lastCheckedAt = input.now
        operation.updatedAt = input.now
        if (
          result?.source_updated_at &&
          operation.sourceUpdatedAt &&
          result.source_updated_at <= operation.sourceUpdatedAt
        ) {
          await deps.repository.save(operation)
          return outcomeForStoredOperation(operation) ?? { kind: "in_doubt", operation }
        }
        operation.sourceUpdatedAt = result?.source_updated_at ?? operation.sourceUpdatedAt
        operation.upstreamRef = result?.upstream_ref ?? operation.upstreamRef
        if (!result) {
          operation.state = "in_doubt"
          operation.lastErrorClass = "reservation_not_found"
          operation.nextReconcileAt = new Date(input.now.getTime() + reconcileAfterMs)
          await deps.repository.save(operation)
          return { kind: "in_doubt", operation }
        }
        if (result.status === "failed" || result.status === "refused") {
          operation.state = "refused"
          operation.resolvedAt = input.now
          operation.nextReconcileAt = undefined
          operation.safeEvidence = {
            ...operation.safeEvidence,
            ...redactSupplierEvidence(result?.upstream_payload),
          }
          await deps.repository.save(operation)
          return { kind: "failed", operation }
        }
        if (result.status === "cancelled") {
          operation.state = "cancelled"
          operation.resolvedAt = input.now
          operation.nextReconcileAt = undefined
          operation.safeEvidence = {
            ...operation.safeEvidence,
            ...redactSupplierEvidence(result.upstream_payload),
          }
          await deps.repository.save(operation)
          return { kind: "failed", operation }
        }
        if (result.status === "pending" || result.status === "cancelling") {
          operation.state = "pending"
          operation.nextReconcileAt = new Date(input.now.getTime() + reconcileAfterMs)
          operation.safeEvidence = {
            ...operation.safeEvidence,
            ...redactSupplierEvidence(result.upstream_payload),
          }
          await deps.repository.save(operation)
          return { kind: "pending", operation }
        }
        operation.state = "succeeded"
        operation.upstreamStatus = result.status
        operation.resolvedAt = input.now
        operation.nextReconcileAt = undefined
        operation.safeEvidence = {
          ...operation.safeEvidence,
          ...redactSupplierEvidence(result.upstream_payload),
        }
        await deps.repository.save(operation)
        return {
          kind: "secured",
          operation,
          result: {
            upstream_ref: result.upstream_ref,
            status: result.status,
            upstream_payload: result.upstream_payload,
          },
        }
      } catch (error) {
        operation.state = "in_doubt"
        operation.lastCheckedAt = input.now
        operation.updatedAt = input.now
        operation.nextReconcileAt = new Date(input.now.getTime() + reconcileAfterMs)
        operation.lastErrorClass = errorClass(error)
        await deps.repository.save(operation)
        return { kind: "in_doubt", operation }
      }
    },
  }
}

async function operationFailedWithoutDispatch(
  repository: SupplierOperationRepository,
  input: DispatchSupplierReservationInput,
  reason: string,
): Promise<SupplierOperationWorkflowOutcome> {
  const operation = createSupplierOperationRecord({
    sessionId: input.sessionId,
    scopeKey: input.scopeKey,
    quoteId: input.quoteId,
    ...(input.holdId ? { holdId: input.holdId } : {}),
    commitIdempotencyKey: input.commitIdempotencyKey,
    entityModule: input.entityModule,
    entityId: input.entityId,
    sourceKind: input.sourceKind,
    sourceConnectionId: input.sourceConnectionId,
    sourceRef: input.sourceRef,
    adapterKind: input.sourceKind,
    requestFingerprint: input.requestFingerprint,
    adapterIdempotencyKey: supplierAdapterIdempotencyKey(
      input.sessionId,
      input.commitIdempotencyKey,
      input.scopeKey,
    ),
    requestPayload: safeSupplierRequestPayload(input.request),
    now: input.now,
  })
  operation.state = "refused"
  operation.lastErrorClass = reason
  operation.resolvedAt = input.now
  const claim = await repository.createOrReplay(operation)
  if (claim.status === "conflict") return { kind: "idempotency_conflict" }
  const storedOutcome = outcomeForStoredOperation(claim.operation)
  if (storedOutcome) return storedOutcome
  claim.operation.state = "refused"
  claim.operation.lastErrorClass = reason
  claim.operation.resolvedAt = input.now
  claim.operation.updatedAt = input.now
  await repository.save(claim.operation)
  return { kind: "failed", operation: claim.operation }
}

function supplierAdapterIdempotencyKey(
  sessionId: string,
  commitIdempotencyKey: string,
  scopeKey?: string,
): string {
  return scopeKey && scopeKey !== "session"
    ? `${sessionId}:${scopeKey}:${commitIdempotencyKey}:reserve`
    : `${sessionId}:${commitIdempotencyKey}:reserve`
}

function outcomeForStoredOperation(
  operation: SupplierOperationInternalRecord,
): SupplierOperationWorkflowOutcome | null {
  switch (operation.state) {
    case "queued":
      return null
    case "submitted":
    case "in_doubt":
    case "manual_review":
      return { kind: "in_doubt", operation }
    case "pending":
      return { kind: "pending", operation }
    case "refused":
    case "cancelled":
      return { kind: "failed", operation }
    case "manually_resolved":
      return operation.upstreamStatus === "succeeded"
        ? {
            kind: "secured",
            operation,
            result: {
              upstream_ref: requiredUpstreamRef(operation),
              status: "confirmed",
              upstream_payload: operation.safeEvidence,
            },
          }
        : { kind: "failed", operation }
    case "succeeded":
      return {
        kind: "secured",
        operation,
        result: {
          upstream_ref: requiredUpstreamRef(operation),
          status: securedStatus(operation.upstreamStatus),
          upstream_payload: operation.safeEvidence,
        },
      }
  }
}

function safeEvidence(result: ReserveResult): Record<string, unknown> {
  return {
    dispatchCertainty: "acknowledged",
    upstreamStatus: result.status,
    ...(result.upstream_payload
      ? { upstreamPayload: redactSupplierEvidence(result.upstream_payload) }
      : {}),
  }
}

export function safeSupplierRequestPayload(request: ReserveRequest): Record<string, unknown> {
  return {
    entity_module: request.entity_module,
    entity_id: request.entity_id,
    ...(request.source_ref ? { source_ref: request.source_ref } : {}),
    parameters: redactSupplierParameters(request.parameters),
    ...(request.payment_intent
      ? {
          paymentIntentSummary: {
            kind: request.payment_intent.kind,
            type: request.payment_intent.type,
            mode: request.payment_intent.mode,
          },
        }
      : {}),
    ...(request.scope ? { scope: request.scope } : {}),
    partySummary: {
      passengerCount: Array.isArray(request.party?.passengers)
        ? request.party.passengers.length
        : undefined,
      hasContact: Boolean(request.party?.contact),
    },
  }
}

function redactSupplierParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const { draft: _draft, contact: _contact, passengers: _passengers, ...safe } = parameters
  return safe
}

function redactSupplierEvidence(value: unknown): Record<string, unknown> {
  const redacted = redactEvidenceValue(value)
  return redacted && typeof redacted === "object" && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : {}
}

function redactEvidenceValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactEvidenceValue)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SUPPLIER_EVIDENCE_PII_KEYS.test(key))
      .map(([key, item]) => [key, redactEvidenceValue(item)]),
  )
}

const SUPPLIER_EVIDENCE_PII_KEYS =
  /(passengers?|travelers?|contact|first_?name|last_?name|email|phone|address|postal_?code|passport|document)/i

function requiredUpstreamRef(operation: SupplierOperationInternalRecord): string {
  if (!operation.upstreamRef) throw new Error("succeeded supplier operation has no upstream ref")
  return operation.upstreamRef
}

function securedStatus(value: string | undefined): "held" | "confirmed" | "ticketed" {
  return value === "held" || value === "ticketed" ? value : "confirmed"
}

function errorClass(error: unknown): string {
  if (error instanceof ReservationDispatchError) return error.errorClass
  return error instanceof Error ? error.name || "Error" : "unknown_error"
}
