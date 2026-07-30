import { financeAppApiRuntimePort as importCheapFinanceAppApiRuntimePort } from "./runtime-port.js"

export interface FinanceAppApiIssuanceDocument {
  id: string
  documentType: "invoice" | "proforma"
  number: string
  status: string
  booking: { id: string; number: string | null }
  billing: {
    name: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    region: string | null
    country: string | null
    vatCode: string | null
    registrationNumber: string | null
  }
  currency: { document: string; base: string | null }
  fx: {
    rateSetId: string | null
    rate: number | null
    effectiveRate: number | null
    source: string | null
    quotedAt: string | null
    validUntil: string | null
    commissionBasisPoints: number | null
    invoiceMention: string | null
  } | null
  totals: { subtotalCents: number; taxCents: number; totalCents: number }
  dates: { issuedOn: string | null; dueOn: string | null }
  language: string | null
  taxRegime: {
    id: string
    code: string
    name: string
    legalReference: string | null
    specialRegime: boolean
    marginSchemeArticle311: boolean
  } | null
  series: { id: string; code: string; name: string; scope: string } | null
  allocation: { required: boolean; pending: boolean; placeholderNumber: string | null }
  lines: readonly {
    id: string
    description: string
    quantity: number
    unitPriceCents: number
    totalCents: number
    tax: { ratePercent: number | null; name: string | null; regimeCode: string | null }
  }[]
}

export interface FinanceAppApiExternalReferenceInput {
  externalId: string | null
  externalNumber: string | null
  externalUrl: string | null
  status: string | null
  metadata: Record<string, unknown> | null
  syncedAt: string | null
  syncError: string | null
}

export interface FinanceAppApiExternalReferenceUpsertInput {
  reference: FinanceAppApiExternalReferenceInput
  allocation?: { invoiceNumber: string }
}

export interface FinanceAppApiExternalReference {
  id: string
  documentId: string
  provider: string
  externalId: string | null
  externalNumber: string | null
  externalUrl: string | null
  status: string | null
  metadata: Record<string, unknown> | null
  syncedAt: string | null
  syncError: string | null
  sync: FinanceAppApiExternalSyncState | null
  createdAt: string
  updatedAt: string
}

export type FinanceAppApiExternalSyncStatus = "succeeded" | "retryable_failure" | "terminal_failure"

export interface FinanceAppApiExternalSyncStateInput {
  operationId: string
  status: FinanceAppApiExternalSyncStatus
  occurredAt: string
  error: { code: string; message: string } | null
  metadata: Record<string, unknown> | null
}

export interface FinanceAppApiExternalSyncState extends FinanceAppApiExternalSyncStateInput {
  provider: string
  documentId: string
}

export type FinanceAppApiExternalSyncMutationResult =
  | {
      status: "ok"
      outcome: "created" | "updated" | "unchanged"
      sync: FinanceAppApiExternalSyncState
    }
  | { status: "not_found" }
  | {
      status: "conflict"
      reason: "idempotency_key_reused" | "out_of_order"
      current: FinanceAppApiExternalSyncState
    }

export type FinanceAppApiExternalLifecycleState = "converted" | "voided"

export interface FinanceAppApiDocumentLineage {
  sourceDocumentId: string
  successorDocumentId: string
}

export interface FinanceAppApiExternalLifecycleStateInput {
  operationId: string
  state: FinanceAppApiExternalLifecycleState
  occurredAt: string
  lineage: FinanceAppApiDocumentLineage | null
}

export interface FinanceAppApiExternalLifecycleObservation
  extends FinanceAppApiExternalLifecycleStateInput {
  provider: string
  documentId: string
}

export type FinanceAppApiExternalLifecycleMutationResult =
  | {
      status: "ok"
      outcome: "created" | "unchanged"
      lifecycle: FinanceAppApiExternalLifecycleObservation
    }
  | { status: "not_found" }
  | {
      status: "conflict"
      reason:
        | "idempotency_key_reused"
        | "lineage_mismatch"
        | "native_state_mismatch"
        | "out_of_order"
        | "terminal_transition"
      current: FinanceAppApiExternalLifecycleObservation | null
    }

export type FinanceAppApiSettlementObservationStatus = "partial" | "paid"

export interface FinanceAppApiSettlementTotals {
  totalCents: number
  paidCents: number
  balanceDueCents: number
}

export interface FinanceAppApiSettlementObservationInput {
  operationId: string
  occurredAt: string
  status: FinanceAppApiSettlementObservationStatus
  currency: string
  totals: FinanceAppApiSettlementTotals
  paymentIdentifiers: readonly string[]
}

export interface FinanceAppApiSettlementObservation
  extends FinanceAppApiSettlementObservationInput {
  provider: string
  documentId: string
}

export type FinanceAppApiSettlementObservationMutationResult =
  | {
      status: "ok"
      outcome: "created" | "unchanged"
      observation: FinanceAppApiSettlementObservation
    }
  | { status: "not_found" }
  | {
      status: "conflict"
      reason:
        | "idempotency_key_reused"
        | "native_document_mismatch"
        | "out_of_order"
        | "payment_identifier_conflict"
        | "settlement_regression"
        | "terminal_transition"
      current: FinanceAppApiSettlementObservation | null
      paymentIdentifier?: string
    }

export interface FinanceAppApiPdfArtifactInput {
  bytes: Uint8Array
  contentType: "application/pdf"
  fileName: string
  idempotencyKey: string
}

export interface FinanceAppApiPdfArtifact {
  id: string
  documentId: string
  provider: string
  fileName: string
  byteSize: number
  checksum: string
  createdAt: string
}

export type FinanceAppApiPdfArtifactMutationResult =
  | {
      status: "ok"
      outcome: "created" | "unchanged"
      artifact: FinanceAppApiPdfArtifact
    }
  | { status: "not_found" }
  | { status: "not_configured" }
  | { status: "conflict"; reason: "idempotency_key_reused" }

export type FinanceAppApiReferenceMutationResult =
  | {
      status: "ok"
      reference: FinanceAppApiExternalReference
      referenceOutcome: "created" | "updated" | "unchanged"
      allocationOutcome: "not_requested" | "applied" | "already_applied"
    }
  | { status: "not_found" }
  | { status: "allocation_conflict"; currentNumber: string; currentStatus: string }

export class FinanceAppApiNumberConflictError extends Error {
  constructor(readonly invoiceNumber: string) {
    super(`Finance document number "${invoiceNumber}" is already in use.`)
    this.name = "FinanceAppApiNumberConflictError"
  }
}

/**
 * Database handle supplied by the implementing runtime.
 *
 * `finance-contracts` is dependency-light per ADR-0002 and must not depend on
 * Drizzle, so the handle is a type parameter rather than a concrete
 * `PostgresJsDatabase`. The interface only ever passes it through - it never
 * calls a method on it - so the contract loses nothing by leaving it opaque.
 * Implementers instantiate it, e.g. `FinanceAppApiRuntime<PostgresJsDatabase>`.
 */
export interface FinanceAppApiRuntime<TDatabase = unknown> {
  getIssuanceDocument(
    db: TDatabase,
    documentId: string,
  ): Promise<FinanceAppApiIssuanceDocument | null>
  getExternalReference(
    db: TDatabase,
    documentId: string,
    provider: string,
  ): Promise<FinanceAppApiExternalReference | null>
  upsertExternalReference(
    db: TDatabase,
    documentId: string,
    provider: string,
    input: FinanceAppApiExternalReferenceUpsertInput,
  ): Promise<FinanceAppApiReferenceMutationResult>
  attachPdfArtifact(
    db: TDatabase,
    environment: unknown,
    documentId: string,
    provider: string,
    input: FinanceAppApiPdfArtifactInput,
  ): Promise<FinanceAppApiPdfArtifactMutationResult>
  updateExternalSyncState(
    db: TDatabase,
    documentId: string,
    provider: string,
    input: FinanceAppApiExternalSyncStateInput,
  ): Promise<FinanceAppApiExternalSyncMutationResult>
  updateExternalLifecycleState(
    db: TDatabase,
    documentId: string,
    provider: string,
    input: FinanceAppApiExternalLifecycleStateInput,
  ): Promise<FinanceAppApiExternalLifecycleMutationResult>
  recordSettlementObservation(
    db: TDatabase,
    documentId: string,
    provider: string,
    input: FinanceAppApiSettlementObservationInput,
  ): Promise<FinanceAppApiSettlementObservationMutationResult>
}

/** Typed runtime view of the exact object used by import-cheap manifests. */
export const financeAppApiRuntimePort: {
  readonly id: typeof importCheapFinanceAppApiRuntimePort.id
  readonly test: (provider: FinanceAppApiRuntime) => void
} = importCheapFinanceAppApiRuntimePort
