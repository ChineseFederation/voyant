import type { Contract as LegalContract } from "./contracts/schema.js"
import type { LegalContractDetail, LegalContractSummary } from "./tools.js"

type LegalContractDetailOptions = {
  redactManagedBookingPii?: boolean
}

function iso(value: Date): string {
  return value.toISOString()
}

function nullableIso(value: Date | null): string | null {
  return value ? iso(value) : null
}

export function legalContractSummary(row: LegalContract): LegalContractSummary {
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    scope: row.scope,
    status: row.status,
    title: row.title,
    bookingId: row.bookingId,
    personId: row.personId,
    organizationId: row.organizationId,
    supplierId: row.supplierId,
    language: row.language,
    issuedAt: nullableIso(row.issuedAt),
    sentAt: nullableIso(row.sentAt),
    executedAt: nullableIso(row.executedAt),
    expiresAt: nullableIso(row.expiresAt),
    voidedAt: nullableIso(row.voidedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function managedBookingWorkflow(metadata: unknown): Record<string, unknown> | null {
  const workflow = record(metadata).bookingContractWorkflow
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) return null
  const candidate = workflow as Record<string, unknown>
  return candidate.reviewSnapshot ? candidate : null
}

export function hasManagedBookingWorkflow(metadata: unknown): boolean {
  return !!managedBookingWorkflow(metadata)
}

export function redactManagedBookingContractForGenericDetail<
  T extends { variables: unknown; metadata: unknown },
>(row: T): T {
  const workflow = managedBookingWorkflow(row.metadata)
  if (!workflow) return row
  const {
    bookingContractWorkflow: _workflow,
    bookingContractReviewSnapshot: _legacy,
    ...metadata
  } = record(row.metadata)
  return {
    ...row,
    variables: null,
    metadata: {
      ...metadata,
      bookingContractWorkflow: {
        revision: typeof workflow.revision === "number" ? workflow.revision : null,
        previousRevisionId:
          typeof workflow.previousRevisionId === "string" ? workflow.previousRevisionId : null,
        reviewOnly: workflow.reviewOnly === true,
        piiRedacted: true,
      },
    },
  }
}

export function legalContractDetail(
  row: LegalContract,
  options: LegalContractDetailOptions = {},
): LegalContractDetail {
  const safeRow =
    options.redactManagedBookingPii === false
      ? row
      : redactManagedBookingContractForGenericDetail(row)
  return {
    ...legalContractSummary(safeRow),
    templateVersionId: safeRow.templateVersionId,
    seriesId: safeRow.seriesId,
    channelId: safeRow.channelId,
    targetKind: safeRow.targetKind,
    targetId: safeRow.targetId,
    targetProvider: safeRow.targetProvider,
    targetSourceRef: safeRow.targetSourceRef,
    renderedBodyFormat: safeRow.renderedBodyFormat,
    renderedBody: safeRow.renderedBody,
    variables: safeRow.variables as LegalContractDetail["variables"],
    metadata: safeRow.metadata as LegalContractDetail["metadata"],
    stageHistory: safeRow.stageHistory,
  }
}
