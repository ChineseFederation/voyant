import type {
  BookingSupplierAmendmentOperationInput,
  BookingsSupplierAmendmentRuntime,
} from "@voyant-travel/bookings/runtime-port"

import type { SourceAdapterRegistry } from "./registry.js"
import { createSupplierOperationWorkflow } from "./supplier-operation-workflow.js"
import {
  createDrizzleSupplierOperationRepository,
  type SupplierOperationInternalRecord,
} from "./supplier-operations.js"

export function createCatalogBookingAmendmentRuntime(options: {
  resolveRegistry(): Promise<SourceAdapterRegistry>
}): BookingsSupplierAmendmentRuntime {
  return {
    async dispatch(input) {
      const registry = await options.resolveRegistry()
      const workflow = createSupplierOperationWorkflow({
        repository: createDrizzleSupplierOperationRepository(input.db),
        registry,
      })
      const outcomes = []
      for (const operation of input.operations) {
        const outcome = await workflow.dispatchAmendment({
          amendmentId: input.amendmentId,
          bookingId: input.bookingId,
          bookingItemId: operation.bookingItemId,
          scopeKey: operation.bookingItemId,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: operation.requestFingerprint,
          operationKind: "modify",
          entityModule: operation.entityModule,
          entityId: operation.entityId,
          sourceKind: operation.sourceKind,
          sourceConnectionId: operation.sourceConnectionId,
          sourceRef: operation.sourceRef,
          request: {
            upstream_ref: operation.upstreamRef,
            desired_state: {
              ...(operation.desiredState.parameters
                ? { parameters: operation.desiredState.parameters }
                : {}),
              party: { passengers: [...operation.desiredState.party.passengers] },
            },
            idempotency_key: `${input.amendmentId}:${operation.bookingItemId}:${input.idempotencyKey}:modify`,
          },
          adapterContext: { connection_id: operation.sourceConnectionId },
          now: input.now,
        })
        outcomes.push(mapOutcome(operation, outcome))
      }
      return outcomes
    },

    async reconcile(input) {
      const registry = await options.resolveRegistry()
      const repository = createDrizzleSupplierOperationRepository(input.db)
      const workflow = createSupplierOperationWorkflow({ repository, registry })
      const outcomes = []
      for (const operationId of input.supplierOperationIds) {
        const operation = await repository.get(operationId)
        if (!operation) {
          outcomes.push({
            bookingItemId: "unknown",
            supplierOperationId: null,
            outcome: "in_doubt" as const,
          })
          continue
        }
        const outcome = await workflow.reconcile(operation, {
          adapterContext: { connection_id: operation.sourceConnectionId },
          now: input.now,
        })
        outcomes.push(mapStoredOutcome(operation, outcome))
      }
      return outcomes
    },
  }
}

function mapOutcome(
  input: BookingSupplierAmendmentOperationInput,
  outcome: Awaited<
    ReturnType<ReturnType<typeof createSupplierOperationWorkflow>["dispatchAmendment"]>
  >,
) {
  if (outcome.kind === "idempotency_conflict") {
    return {
      bookingItemId: input.bookingItemId,
      supplierOperationId: null,
      outcome: "idempotency_conflict" as const,
    }
  }
  return {
    bookingItemId: input.bookingItemId,
    supplierOperationId: outcome.operation.id,
    outcome: mapKind(outcome.kind),
  }
}

function mapStoredOutcome(
  operation: SupplierOperationInternalRecord,
  outcome: Awaited<ReturnType<ReturnType<typeof createSupplierOperationWorkflow>["reconcile"]>>,
) {
  if (outcome.kind === "idempotency_conflict") {
    return {
      bookingItemId: operation.bookingItemId ?? "unknown",
      supplierOperationId: operation.id,
      outcome: "idempotency_conflict" as const,
    }
  }
  return {
    bookingItemId: operation.bookingItemId ?? "unknown",
    supplierOperationId: operation.id,
    outcome: mapKind(outcome.kind),
  }
}

function mapKind(kind: "secured" | "pending" | "in_doubt" | "failed") {
  return kind === "failed" ? ("refused" as const) : kind
}
