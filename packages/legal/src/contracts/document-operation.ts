import { newId } from "@voyant-travel/db/lib/typeid"
import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  checksumLegalDocumentBytes,
  type LegalDocumentArtifactProvider,
  type LegalDocumentRenderDescriptor,
  type LegalDocumentRenderedArtifact,
} from "./document-artifact-provider.js"
import { contractAttachments, contractDocumentOperations, contracts } from "./schema.js"

export type LegalDocumentOperationMode = "generate" | "regenerate"

export interface LegalDocumentOperationPrincipal {
  readonly type: string
  readonly id: string
  readonly organizationId: string | null
}

export interface LegalDocumentOperationClaimBinding {
  readonly actionId: string
  readonly actionName: string
  readonly actionVersion: string
  readonly targetType: string
  readonly targetId: string
  readonly idempotencyScope: string
  readonly idempotencyKey: string
  readonly idempotencyFingerprint: string
  readonly commandPayload: Readonly<Record<string, unknown>>
}

export interface LegalDocumentOperationResult {
  readonly operationId: string
  readonly bookingId: string
  readonly contractId: string
  readonly attachmentId: string
  readonly mode: LegalDocumentOperationMode
  readonly checksumSha256: string
}

export class LegalDocumentOperationDriftError extends Error {
  constructor() {
    super("The idempotency key was already used with a different immutable legal document request.")
    this.name = "LegalDocumentOperationDriftError"
  }
}

export class LegalDocumentOperationIsolationError extends Error {
  constructor() {
    super("The legal document operation belongs to a different principal or organization.")
    this.name = "LegalDocumentOperationIsolationError"
  }
}

export class LegalDocumentCanonicalExistsError extends Error {
  constructor() {
    super("Generate cannot replace an existing canonical contract document; use regenerate.")
    this.name = "LegalDocumentCanonicalExistsError"
  }
}

export class LegalDocumentCanonicalMissingError extends Error {
  constructor() {
    super("Regenerate requires an existing canonical contract document.")
    this.name = "LegalDocumentCanonicalMissingError"
  }
}

export class LegalDocumentCanonicalChangedError extends Error {
  constructor() {
    super("The canonical contract document changed after regeneration was admitted.")
    this.name = "LegalDocumentCanonicalChangedError"
  }
}

export class LegalDocumentProviderBindingError extends Error {
  constructor() {
    super("The selected legal document provider does not match the operation's stored identity.")
    this.name = "LegalDocumentProviderBindingError"
  }
}

export class LegalDocumentOperationRowDriftError extends Error {
  constructor() {
    super("The durable legal document operation row changed outside its fenced state transition.")
    this.name = "LegalDocumentOperationRowDriftError"
  }
}

export interface PreparedLegalDocumentTarget {
  readonly contractId: string
  readonly bookingId: string
  readonly organizationId: string | null
  readonly descriptor: LegalDocumentRenderDescriptor
}

export interface LegalDocumentOperationEngineOptions {
  readonly provider: LegalDocumentArtifactProvider
  readonly leaseMs?: number
  readonly maxAttempts?: number
  readonly now?: () => Date
  readonly testHooks?: {
    afterRenderCheckpoint?(operationId: string): Promise<void>
    afterPutBeforeCheckpoint?(operationId: string): Promise<void>
    afterStoredCheckpoint?(operationId: string): Promise<void>
    beforeFinalize?(operationId: string): Promise<void>
    afterFinalize?(operationId: string): Promise<void>
    afterDeadLetterCheckpoint?(operationId: string): Promise<void>
  }
}

type Db = PostgresJsDatabase

function operationId() {
  return newId("contract_document_operations")
}

function operationEventId(id: string) {
  return `evt_legal_contract_document_${id}`
}

function retryAt(now: Date, attempt: number) {
  const delay = Math.min(60 * 60_000, 1_000 * 2 ** Math.min(attempt, 12))
  return new Date(now.getTime() + delay)
}

function canonicalResult(value: unknown): LegalDocumentOperationResult | null {
  if (!value || typeof value !== "object") return null
  const result = value as LegalDocumentOperationResult
  return result.operationId && result.contractId && result.attachmentId ? result : null
}

function tenantScope(organizationId: string | null) {
  return organizationId ? `organization:${organizationId}` : "organization:<none>"
}

function attachmentProvider(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const value = metadata as Record<string, unknown>
  return typeof value.providerId === "string" &&
    typeof value.providerVersion === "string" &&
    typeof value.providerProtocol === "string"
    ? {
        id: value.providerId,
        version: value.providerVersion,
        protocol: value.providerProtocol,
      }
    : null
}

async function canonicalAttachmentFingerprint(
  attachment: typeof contractAttachments.$inferSelect,
): Promise<string> {
  const snapshot = {
    id: attachment.id,
    contractId: attachment.contractId,
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    storageKey: attachment.storageKey,
    checksum: attachment.checksum,
    targetKind: attachment.targetKind,
    targetId: attachment.targetId,
    targetProvider: attachment.targetProvider,
    targetSourceRef: attachment.targetSourceRef,
    legacyTransactionOfferId: attachment.legacyTransactionOfferId,
    legacyTransactionOrderId: attachment.legacyTransactionOrderId,
    metadata: attachment.metadata,
    createdAt: attachment.createdAt.toISOString(),
  }
  return checksumLegalDocumentBytes(new TextEncoder().encode(canonicalJson(snapshot)))
}

async function sameCanonicalFingerprint(
  attachment: typeof contractAttachments.$inferSelect,
  admitted: unknown,
) {
  return (
    typeof admitted === "string" && admitted === (await canonicalAttachmentFingerprint(attachment))
  )
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`
}

export async function legalDocumentOperationTargetFingerprint(input: {
  bookingId: string
  contractId: string
  organizationId: string | null
  mode: LegalDocumentOperationMode
  providerId: string
  providerVersion: string
  providerProtocol: string
  descriptor: LegalDocumentRenderDescriptor
}): Promise<string> {
  return checksumLegalDocumentBytes(new TextEncoder().encode(canonicalJson(input)))
}

/** Fixed recovery-job preflight used when the selected provider disappears. */
export async function hasRecoverableLegalDocumentOperations(db: Db): Promise<boolean> {
  const rows = await db
    .select({ id: contractDocumentOperations.id })
    .from(contractDocumentOperations)
    .where(
      inArray(contractDocumentOperations.status, [
        "prepared",
        "retry_scheduled",
        "running",
        "cleanup_pending",
        "cleanup_needed",
        "dead_lettered_cleanup_needed",
      ]),
    )
    .limit(1)
  return rows.length > 0
}

function encodePayload(bytes: Uint8Array) {
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return btoa(binary)
}

function decodePayload(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

/**
 * Durable booking-contract document state machine. Callers provide the
 * immutable request/target fingerprints produced by handler admission; no
 * ephemeral delivery request is accepted here.
 */
export function createLegalDocumentOperationEngine(options: LegalDocumentOperationEngineOptions) {
  const now = options.now ?? (() => new Date())
  const leaseMs = options.leaseMs ?? 60_000
  const maxAttempts = options.maxAttempts ?? 8

  function assertProviderBinding(row: typeof contractDocumentOperations.$inferSelect) {
    if (
      row.providerId !== options.provider.identity.id ||
      row.providerVersion !== options.provider.identity.version ||
      row.providerProtocol !== options.provider.identity.protocol
    ) {
      throw new LegalDocumentProviderBindingError()
    }
  }

  async function admit(input: {
    db: Db
    bookingId: string
    mode: LegalDocumentOperationMode
    idempotencyKey: string
    requestFingerprint: string
    principal: LegalDocumentOperationPrincipal
    claim: LegalDocumentOperationClaimBinding
    prepareTarget(tx: Db): Promise<PreparedLegalDocumentTarget>
  }) {
    if (
      input.claim.targetType !== "booking" ||
      input.claim.targetId !== input.bookingId ||
      input.claim.idempotencyKey !== input.idempotencyKey ||
      input.claim.idempotencyFingerprint !== input.requestFingerprint
    ) {
      throw new LegalDocumentOperationDriftError()
    }
    return input.db.transaction(async (rawTx) => {
      const tx = rawTx as Db
      const normalizedTenantScope = tenantScope(input.principal.organizationId)
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${normalizedTenantScope}:${input.bookingId}:${input.idempotencyKey}`}))`,
      )
      const [replay] = await tx
        .select()
        .from(contractDocumentOperations)
        .where(
          and(
            eq(contractDocumentOperations.tenantScope, normalizedTenantScope),
            eq(contractDocumentOperations.bookingId, input.bookingId),
            eq(contractDocumentOperations.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1)

      if (replay) {
        const replayTargetFingerprint = await legalDocumentOperationTargetFingerprint({
          bookingId: replay.bookingId,
          contractId: replay.contractId!,
          organizationId: replay.organizationId,
          mode: replay.mode as LegalDocumentOperationMode,
          providerId: replay.providerId,
          providerVersion: replay.providerVersion,
          providerProtocol: replay.providerProtocol,
          descriptor: replay.renderDescriptor as LegalDocumentRenderDescriptor,
        })
        if (
          replay.requestFingerprint !== input.requestFingerprint ||
          replay.targetFingerprint !== replayTargetFingerprint ||
          replay.mode !== input.mode ||
          replay.principalType !== input.principal.type ||
          replay.principalId !== input.principal.id ||
          replay.claimActionId !== input.claim.actionId ||
          replay.claimActionName !== input.claim.actionName ||
          replay.claimActionVersion !== input.claim.actionVersion ||
          replay.claimTargetType !== input.claim.targetType ||
          replay.claimTargetId !== input.claim.targetId ||
          replay.claimIdempotencyScope !== input.claim.idempotencyScope ||
          replay.claimIdempotencyFingerprint !== input.claim.idempotencyFingerprint ||
          canonicalJson(replay.claimCommandPayload) !== canonicalJson(input.claim.commandPayload) ||
          replay.providerId !== options.provider.identity.id ||
          replay.providerVersion !== options.provider.identity.version ||
          replay.providerProtocol !== options.provider.identity.protocol
        ) {
          throw new LegalDocumentOperationDriftError()
        }
        return { operationId: replay.id, result: canonicalResult(replay.result), replayed: true }
      }

      const target = await input.prepareTarget(tx)
      if (
        target.bookingId !== input.bookingId ||
        target.descriptor.bookingId !== input.bookingId ||
        target.organizationId !== input.principal.organizationId
      ) {
        throw new LegalDocumentOperationIsolationError()
      }

      // Serialize prepare/finalize per contract while leaving the existing
      // canonical attachment untouched until the final transaction.
      await tx.execute(sql`select 1 from ${contracts} where ${contracts.id} =
        ${target.contractId} for update`)
      const [previous] = await tx
        .select()
        .from(contractAttachments)
        .where(
          and(
            eq(contractAttachments.contractId, target.contractId),
            eq(contractAttachments.kind, "document"),
          ),
        )
        .limit(1)
      if (previous && input.mode === "generate") {
        throw new LegalDocumentCanonicalExistsError()
      }
      if (!previous && input.mode === "regenerate") {
        throw new LegalDocumentCanonicalMissingError()
      }

      const id = operationId()
      const operationKey = `legal/contract-documents/operations/${id}/artifact`
      const previousProvider = attachmentProvider(previous?.metadata)
      const targetFingerprint = await legalDocumentOperationTargetFingerprint({
        bookingId: input.bookingId,
        contractId: target.contractId,
        organizationId: target.organizationId,
        mode: input.mode,
        providerId: options.provider.identity.id,
        providerVersion: options.provider.identity.version,
        providerProtocol: options.provider.identity.protocol,
        descriptor: target.descriptor,
      })
      const [inserted] = await tx
        .insert(contractDocumentOperations)
        .values({
          id,
          bookingId: input.bookingId,
          contractId: target.contractId,
          organizationId: input.principal.organizationId,
          principalType: input.principal.type,
          principalId: input.principal.id,
          tenantScope: normalizedTenantScope,
          claimActionId: input.claim.actionId,
          claimActionName: input.claim.actionName,
          claimActionVersion: input.claim.actionVersion,
          claimTargetType: input.claim.targetType,
          claimTargetId: input.claim.targetId,
          claimIdempotencyScope: input.claim.idempotencyScope,
          claimIdempotencyFingerprint: input.claim.idempotencyFingerprint,
          claimCommandPayload: input.claim.commandPayload,
          idempotencyKey: input.idempotencyKey,
          mode: input.mode,
          requestFingerprint: input.requestFingerprint,
          targetFingerprint,
          providerId: options.provider.identity.id,
          providerVersion: options.provider.identity.version,
          providerProtocol: options.provider.identity.protocol,
          status: "prepared",
          checkpoint: "prepared",
          maxAttempts,
          operationKey,
          renderDescriptor: target.descriptor,
          previousAttachmentId: previous?.id ?? null,
          previousStorageKey: previous?.storageKey ?? null,
          previousProviderId: previousProvider?.id ?? null,
          previousProviderVersion: previousProvider?.version ?? null,
          previousProviderProtocol: previousProvider?.protocol ?? null,
          previousCanonicalFingerprint: previous
            ? await canonicalAttachmentFingerprint(previous)
            : null,
          eventId: operationEventId(id),
        })
        .onConflictDoNothing()
        .returning()
      if (inserted) return { operationId: id, result: null, replayed: false }

      const [concurrent] = await tx
        .select()
        .from(contractDocumentOperations)
        .where(
          and(
            eq(contractDocumentOperations.tenantScope, normalizedTenantScope),
            eq(contractDocumentOperations.bookingId, input.bookingId),
            eq(contractDocumentOperations.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1)
      if (
        !concurrent ||
        concurrent.requestFingerprint !== input.requestFingerprint ||
        concurrent.targetFingerprint !==
          (await legalDocumentOperationTargetFingerprint({
            bookingId: concurrent.bookingId,
            contractId: concurrent.contractId!,
            organizationId: concurrent.organizationId,
            mode: concurrent.mode as LegalDocumentOperationMode,
            providerId: concurrent.providerId,
            providerVersion: concurrent.providerVersion,
            providerProtocol: concurrent.providerProtocol,
            descriptor: concurrent.renderDescriptor as LegalDocumentRenderDescriptor,
          })) ||
        concurrent.mode !== input.mode ||
        concurrent.principalType !== input.principal.type ||
        concurrent.principalId !== input.principal.id ||
        concurrent.claimActionId !== input.claim.actionId ||
        concurrent.claimActionName !== input.claim.actionName ||
        concurrent.claimActionVersion !== input.claim.actionVersion ||
        concurrent.claimTargetType !== input.claim.targetType ||
        concurrent.claimTargetId !== input.claim.targetId ||
        concurrent.claimIdempotencyScope !== input.claim.idempotencyScope ||
        concurrent.claimIdempotencyFingerprint !== input.claim.idempotencyFingerprint ||
        canonicalJson(concurrent.claimCommandPayload) !==
          canonicalJson(input.claim.commandPayload) ||
        concurrent.providerId !== options.provider.identity.id ||
        concurrent.providerVersion !== options.provider.identity.version ||
        concurrent.providerProtocol !== options.provider.identity.protocol
      ) {
        throw new LegalDocumentOperationDriftError()
      }
      return {
        operationId: concurrent.id,
        result: canonicalResult(concurrent.result),
        replayed: true,
      }
    })
  }

  async function claim(db: Db, id: string, workerId: string) {
    const claimedAt = now()
    const [row] = await db
      .update(contractDocumentOperations)
      .set({
        status: "running",
        leaseOwner: workerId,
        leaseExpiresAt: new Date(claimedAt.getTime() + leaseMs),
        fencingToken: sql`${contractDocumentOperations.fencingToken} + 1`,
        attemptCount: sql`${contractDocumentOperations.attemptCount} + 1`,
        updatedAt: claimedAt,
      })
      .where(
        and(
          eq(contractDocumentOperations.id, id),
          inArray(contractDocumentOperations.status, [
            "prepared",
            "retry_scheduled",
            "running",
            "cleanup_pending",
            "cleanup_needed",
            "dead_lettered_cleanup_needed",
          ]),
          or(
            isNull(contractDocumentOperations.leaseExpiresAt),
            lte(contractDocumentOperations.leaseExpiresAt, claimedAt),
            eq(contractDocumentOperations.leaseOwner, workerId),
          ),
        ),
      )
      .returning()
    return row ?? null
  }

  async function checkpoint(
    db: Db,
    row: typeof contractDocumentOperations.$inferSelect,
    values: Partial<typeof contractDocumentOperations.$inferInsert>,
  ) {
    return db.transaction(async (rawTx) => {
      const tx = rawTx as Db
      const [current] = await tx
        .select()
        .from(contractDocumentOperations)
        .where(eq(contractDocumentOperations.id, row.id))
        .for("update")
        .limit(1)
      if (!current || canonicalJson(current) !== canonicalJson(row)) {
        throw new LegalDocumentOperationRowDriftError()
      }
      const [updated] = await tx
        .update(contractDocumentOperations)
        .set({ ...values, updatedAt: now() })
        .where(eq(contractDocumentOperations.id, row.id))
        .returning()
      if (!updated) throw new LegalDocumentOperationRowDriftError()
      return updated
    })
  }

  async function reconcilePut(
    row: typeof contractDocumentOperations.$inferSelect,
    expectedChecksum: string,
  ) {
    assertProviderBinding(row)
    const inspected = await options.provider.inspect(row.operationKey)
    if (inspected.status === "present" && inspected.checksumSha256 === expectedChecksum) {
      return inspected
    }
    assertProviderBinding(row)
    const bytes = await options.provider.get(row.operationKey)
    if (bytes && (await checksumLegalDocumentBytes(bytes)) === expectedChecksum) {
      return {
        status: "present" as const,
        key: row.operationKey,
        checksumSha256: expectedChecksum,
        byteLength: bytes.byteLength,
      }
    }
    throw new Error("Ambiguous artifact put could not be reconciled by checksum.")
  }

  async function finalize(db: Db, row: typeof contractDocumentOperations.$inferSelect) {
    return db.transaction(async (rawTx) => {
      const tx = rawTx as Db
      const [current] = await tx
        .select()
        .from(contractDocumentOperations)
        .where(eq(contractDocumentOperations.id, row.id))
        .for("update")
        .limit(1)
      if (
        !current ||
        canonicalJson(current) !== canonicalJson(row) ||
        current.status !== "running" ||
        current.fencingToken !== row.fencingToken ||
        current.leaseOwner !== row.leaseOwner ||
        current.checkpoint !== "stored"
      ) {
        throw new LegalDocumentOperationRowDriftError()
      }
      const replay = canonicalResult(current.result)
      if (replay) return replay
      assertProviderBinding(current)

      const [reserved] = await tx
        .update(contractDocumentOperations)
        .set({ checkpoint: "finalizing", updatedAt: now() })
        .where(
          and(
            eq(contractDocumentOperations.id, current.id),
            eq(contractDocumentOperations.fencingToken, row.fencingToken),
            eq(contractDocumentOperations.leaseOwner, row.leaseOwner!),
            eq(contractDocumentOperations.checkpoint, "stored"),
          ),
        )
        .returning()
      if (!reserved) throw new Error("Legal document finalize reservation was fenced.")

      await tx.execute(sql`select 1 from ${contracts} where ${contracts.id} =
        ${current.contractId!} for update`)
      const [oldCanonical] = await tx
        .select()
        .from(contractAttachments)
        .where(
          and(
            eq(contractAttachments.contractId, current.contractId!),
            eq(contractAttachments.kind, "document"),
          ),
        )
        .limit(1)
      if (oldCanonical && current.mode === "generate") {
        throw new LegalDocumentCanonicalExistsError()
      }
      if (
        current.mode === "regenerate" &&
        (!oldCanonical ||
          oldCanonical.id !== current.previousAttachmentId ||
          !(await sameCanonicalFingerprint(oldCanonical, current.previousCanonicalFingerprint)))
      ) {
        throw new LegalDocumentCanonicalChangedError()
      }
      if (oldCanonical) {
        await tx
          .update(contractAttachments)
          .set({ kind: "document-history" })
          .where(eq(contractAttachments.id, oldCanonical.id))
      }

      const [attachment] = await tx
        .insert(contractAttachments)
        .values({
          contractId: current.contractId!,
          kind: "document",
          name: current.artifactName!,
          mimeType: current.artifactContentType,
          fileSize: current.artifactByteLength,
          storageKey: current.operationKey,
          checksum: current.artifactChecksum,
          metadata: {
            operationId: current.id,
            requestFingerprint: current.requestFingerprint,
            providerId: current.providerId,
            providerVersion: current.providerVersion,
            providerProtocol: current.providerProtocol,
          },
        })
        .returning()
      if (!attachment) throw new Error("Canonical legal document attachment was not inserted.")

      const result: LegalDocumentOperationResult = {
        operationId: current.id,
        bookingId: current.bookingId,
        contractId: current.contractId!,
        attachmentId: attachment.id,
        mode: current.mode as LegalDocumentOperationMode,
        checksumSha256: current.artifactChecksum!,
      }
      await insertOutboxEvents(tx, [
        {
          name: "contract.document.generated",
          data: {
            contractId: result.contractId,
            contractStatus: (
              await tx
                .select({ status: contracts.status })
                .from(contracts)
                .where(eq(contracts.id, current.contractId!))
                .limit(1)
            )[0]!.status,
            attachmentId: result.attachmentId,
            attachmentKind: "document",
            attachmentName: current.artifactName!,
            renderedBodyFormat: (current.renderDescriptor as LegalDocumentRenderDescriptor)
              .bodyFormat,
            regenerated: current.mode === "regenerate",
          },
          metadata: {
            category: "domain",
            source: "service",
            eventId: current.eventId,
          },
        },
      ])
      const [settled] = await tx
        .update(contractDocumentOperations)
        .set({
          canonicalAttachmentId: attachment.id,
          previousAttachmentId: oldCanonical?.id ?? current.previousAttachmentId,
          previousStorageKey: oldCanonical?.storageKey ?? current.previousStorageKey,
          result,
          checkpoint: "finalized",
          status: oldCanonical?.storageKey ? "cleanup_pending" : "completed",
          completedAt: now(),
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: now(),
        })
        .where(
          and(
            eq(contractDocumentOperations.id, current.id),
            eq(contractDocumentOperations.fencingToken, row.fencingToken),
            eq(contractDocumentOperations.leaseOwner, row.leaseOwner!),
            eq(contractDocumentOperations.checkpoint, "finalizing"),
          ),
        )
        .returning()
      if (!settled) throw new Error("Legal document finalize settlement was fenced.")
      return result
    })
  }

  async function run(db: Db, id: string, workerId = `legal-doc-${crypto.randomUUID()}`) {
    let row = await claim(db, id, workerId)
    let finalized = false
    if (!row) {
      const [existing] = await db
        .select()
        .from(contractDocumentOperations)
        .where(eq(contractDocumentOperations.id, id))
        .limit(1)
      return canonicalResult(existing?.result)
    }
    try {
      if (row.deadLetteredAt && !row.result) {
        assertProviderBinding(row)
        await options.provider.deleteIfPresent(row.operationKey)
        row = await checkpoint(db, row, {
          status: "dead_lettered_cleanup_complete",
          cleanupCompletedAt: now(),
          leaseOwner: null,
          leaseExpiresAt: null,
        })
        return null
      }

      if (row.checkpoint === "finalized" || row.status === "cleanup_pending") {
        assertProviderBinding(row)
        if (!row.previousStorageKey) {
          row = await checkpoint(db, row, {
            status: "completed",
            checkpoint: "cleaned",
            cleanupCompletedAt: now(),
            leaseOwner: null,
            leaseExpiresAt: null,
          })
          return canonicalResult(row.result)
        }
        if (
          row.previousProviderId !== options.provider.identity.id ||
          row.previousProviderVersion !== options.provider.identity.version ||
          row.previousProviderProtocol !== options.provider.identity.protocol
        ) {
          row = await checkpoint(db, row, {
            status: "cleanup_needed",
            lastError:
              "Previous canonical artifact belongs to another or unknown provider; retained.",
            nextAttemptAt: retryAt(now(), row.attemptCount),
            leaseOwner: null,
            leaseExpiresAt: null,
          })
          return canonicalResult(row.result)
        }
        assertProviderBinding(row)
        await options.provider.deleteIfPresent(row.previousStorageKey)
        if (row.previousAttachmentId) {
          const [history] = await db
            .select({ metadata: contractAttachments.metadata })
            .from(contractAttachments)
            .where(eq(contractAttachments.id, row.previousAttachmentId))
            .limit(1)
          await db
            .update(contractAttachments)
            .set({
              storageKey: null,
              metadata: {
                ...((history?.metadata as Record<string, unknown> | null) ?? {}),
                tombstonedAt: now().toISOString(),
                tombstoneReason: "replaced-canonical-artifact-cleaned",
              },
            })
            .where(
              and(
                eq(contractAttachments.id, row.previousAttachmentId),
                eq(contractAttachments.kind, "document-history"),
                eq(contractAttachments.storageKey, row.previousStorageKey),
              ),
            )
        }
        row = await checkpoint(db, row, {
          status: "completed",
          checkpoint: "cleaned",
          cleanupCompletedAt: now(),
          leaseOwner: null,
          leaseExpiresAt: null,
        })
        return canonicalResult(row.result)
      }

      assertProviderBinding(row)
      let artifact: LegalDocumentRenderedArtifact | null = null
      if (row.checkpoint === "prepared") {
        assertProviderBinding(row)
        artifact = await options.provider.render(
          row.renderDescriptor as LegalDocumentRenderDescriptor,
        )
        const actualChecksum = await checksumLegalDocumentBytes(artifact.bytes)
        if (actualChecksum !== artifact.checksumSha256) {
          throw new Error("Legal document renderer returned a mismatched checksum.")
        }
        row = await checkpoint(db, row, {
          checkpoint: "rendered",
          renderedPayload: encodePayload(artifact.bytes),
          artifactMetadata: artifact.metadata ?? null,
          artifactName: artifact.name,
          artifactContentType: artifact.contentType,
          artifactChecksum: artifact.checksumSha256,
          artifactByteLength: artifact.bytes.byteLength,
        })
        await options.testHooks?.afterRenderCheckpoint?.(row.id)
      }

      if (row.checkpoint === "rendered") {
        if (
          !row.renderedPayload ||
          !row.artifactName ||
          !row.artifactContentType ||
          !row.artifactChecksum
        ) {
          throw new Error("Rendered legal document checkpoint is incomplete.")
        }
        artifact = {
          bytes: decodePayload(row.renderedPayload),
          checksumSha256: row.artifactChecksum,
          name: row.artifactName,
          contentType: row.artifactContentType,
          metadata: (row.artifactMetadata as Record<string, string> | null) ?? undefined,
        }
        if ((await checksumLegalDocumentBytes(artifact.bytes)) !== artifact.checksumSha256) {
          throw new Error("Rendered legal document checkpoint checksum does not match its payload.")
        }
        let stored: Awaited<ReturnType<LegalDocumentArtifactProvider["put"]>>
        try {
          assertProviderBinding(row)
          stored = await options.provider.put({
            operationId: row.id,
            operationKey: row.operationKey,
            requestFingerprint: row.requestFingerprint,
            artifact,
          })
        } catch {
          stored = await reconcilePut(row, artifact.checksumSha256)
        }
        if (stored.key !== row.operationKey || stored.checksumSha256 !== artifact.checksumSha256) {
          throw new Error("Legal document provider returned a mismatched operation artifact.")
        }
        await options.testHooks?.afterPutBeforeCheckpoint?.(row.id)
        row = await checkpoint(db, row, { checkpoint: "stored" })
        await options.testHooks?.afterStoredCheckpoint?.(row.id)
      }
      if (row.checkpoint !== "stored") {
        throw new Error(`Unexpected legal document checkpoint "${row.checkpoint}".`)
      }
      await options.testHooks?.beforeFinalize?.(row.id)
      const result = await finalize(db, row)
      finalized = true
      await options.testHooks?.afterFinalize?.(row.id)
      return result
    } catch (error) {
      if (finalized) throw error
      if (error instanceof LegalDocumentOperationRowDriftError) throw error
      const retryCleanupStatus =
        row.deadLetteredAt && !row.result
          ? "dead_lettered_cleanup_needed"
          : row.result
            ? "cleanup_needed"
            : null
      if (retryCleanupStatus) {
        await checkpoint(db, row, {
          status: retryCleanupStatus,
          nextAttemptAt: retryAt(now(), row.attemptCount),
          lastError: error instanceof Error ? error.message : String(error),
          leaseOwner: null,
          leaseExpiresAt: null,
        })
        throw error
      }
      const exhausted =
        error instanceof LegalDocumentProviderBindingError ||
        error instanceof LegalDocumentCanonicalExistsError ||
        error instanceof LegalDocumentCanonicalMissingError ||
        error instanceof LegalDocumentCanonicalChangedError ||
        row.attemptCount >= row.maxAttempts
      const needsArtifactCleanup =
        exhausted && (row.checkpoint === "rendered" || row.checkpoint === "stored")
      const settled = await checkpoint(db, row, {
        status: needsArtifactCleanup
          ? "dead_lettered_cleanup_needed"
          : exhausted
            ? "dead_lettered"
            : "retry_scheduled",
        deadLetteredAt: exhausted ? now() : null,
        nextAttemptAt: retryAt(now(), row.attemptCount),
        lastError: error instanceof Error ? error.message : String(error),
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      if (needsArtifactCleanup) {
        await options.testHooks?.afterDeadLetterCheckpoint?.(row.id)
        try {
          assertProviderBinding(settled)
          await options.provider.deleteIfPresent(row.operationKey)
          await checkpoint(db, settled, {
            status: "dead_lettered_cleanup_complete",
            cleanupCompletedAt: now(),
          })
        } catch (cleanupError) {
          if (cleanupError instanceof LegalDocumentOperationRowDriftError) throw cleanupError
          await checkpoint(db, settled, {
            status: "dead_lettered_cleanup_needed",
            lastError: `${error instanceof Error ? error.message : String(error)}; cleanup: ${
              cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            }`,
          })
        }
      }
      throw error
    }
  }

  async function runDue(db: Db, limit = 25) {
    const rows = await db
      .select({ id: contractDocumentOperations.id })
      .from(contractDocumentOperations)
      .where(
        and(
          inArray(contractDocumentOperations.status, [
            "prepared",
            "retry_scheduled",
            "running",
            "cleanup_pending",
            "cleanup_needed",
            "dead_lettered_cleanup_needed",
          ]),
          lte(contractDocumentOperations.nextAttemptAt, now()),
        ),
      )
      .limit(Math.max(1, Math.min(limit, 100)))
    const results = []
    for (const row of rows) results.push(await run(db, row.id))
    return results
  }

  return { admit, run, runDue }
}
