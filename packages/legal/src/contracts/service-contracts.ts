import { suppliers } from "@voyant-travel/distribution"
import { RequestValidationError } from "@voyant-travel/hono"
import { organizations, people, personDirectoryView } from "@voyant-travel/relationships/schema"
import { and, desc, eq, getTableColumns, ilike, notInArray, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { normalizeLegalTargetFields, normalizeLegalTargetUpdateFields } from "../targets/service.js"
import {
  appendContractStageHistory,
  buildContractLifecycleEvent,
  type ContractLifecycleRuntimeOptions,
  checkContractLifecycleTransition,
  createContractStageHistoryEntry,
  emitContractLifecycleEvent,
} from "./lifecycle.js"
import {
  contractAttachments,
  contractSignatures,
  contracts,
  contractTemplateVersions,
} from "./schema.js"
import {
  allocateContractNumber,
  type ContractListQuery,
  type CreateContractAttachmentInput,
  type CreateContractInput,
  type CreateContractSignatureInput,
  mergeContractNumberIntoVariables,
  paginate,
  renderTemplate,
  toTimestamp,
  type UpdateContractAttachmentInput,
  type UpdateContractInput,
} from "./service-shared.js"

export const DURABLE_CONTRACT_DOCUMENT_ATTACHMENT_KINDS = ["document", "document-history"] as const

export class DurableContractDocumentAttachmentMutationError extends Error {
  constructor() {
    super(
      "Canonical and historical contract documents are owned by the durable document operation.",
    )
    this.name = "DurableContractDocumentAttachmentMutationError"
  }
}

function assertGenericAttachmentKind(kind: string | null | undefined) {
  if (
    kind &&
    DURABLE_CONTRACT_DOCUMENT_ATTACHMENT_KINDS.includes(
      kind as (typeof DURABLE_CONTRACT_DOCUMENT_ATTACHMENT_KINDS)[number],
    )
  ) {
    throw new DurableContractDocumentAttachmentMutationError()
  }
}

/**
 * Existence check for the cross-module party references on a contract. With the
 * hard cross-package FKs removed (module decoupling), this service-layer guard
 * is what keeps `person_id`/`organization_id`/`supplier_id` referentially sound
 * — a stale or mistyped id is rejected with a 400 instead of silently persisted.
 */
async function assertContractPartiesExist(
  db: PostgresJsDatabase,
  data: { personId?: string | null; organizationId?: string | null; supplierId?: string | null },
): Promise<void> {
  const missing: string[] = []
  if (data.personId) {
    const [r] = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.id, data.personId))
      .limit(1)
    if (!r) missing.push(`person ${data.personId}`)
  }
  if (data.organizationId) {
    const [r] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, data.organizationId))
      .limit(1)
    if (!r) missing.push(`organization ${data.organizationId}`)
  }
  if (data.supplierId) {
    const [r] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, data.supplierId))
      .limit(1)
    if (!r) missing.push(`supplier ${data.supplierId}`)
  }
  if (missing.length > 0) {
    throw new RequestValidationError(
      `Unknown contract ${missing.length > 1 ? "parties" : "party"}: ${missing.join(", ")}`,
    )
  }
}

export const contractRecordsService = {
  async listContracts(db: PostgresJsDatabase, query: ContractListQuery) {
    const conditions = []
    if (query.scope) conditions.push(eq(contracts.scope, query.scope))
    if (query.status) conditions.push(eq(contracts.status, query.status))
    if (query.personId) conditions.push(eq(contracts.personId, query.personId))
    if (query.organizationId) conditions.push(eq(contracts.organizationId, query.organizationId))
    if (query.supplierId) conditions.push(eq(contracts.supplierId, query.supplierId))
    if (query.bookingId) conditions.push(eq(contracts.bookingId, query.bookingId))
    if (query.targetKind) conditions.push(eq(contracts.targetKind, query.targetKind))
    if (query.targetId) conditions.push(eq(contracts.targetId, query.targetId))
    if (query.targetProvider) conditions.push(eq(contracts.targetProvider, query.targetProvider))
    if (query.targetSourceRef) conditions.push(eq(contracts.targetSourceRef, query.targetSourceRef))
    if (query.legacyTransactionOfferId)
      conditions.push(eq(contracts.legacyTransactionOfferId, query.legacyTransactionOfferId))
    if (query.legacyTransactionOrderId)
      conditions.push(eq(contracts.legacyTransactionOrderId, query.legacyTransactionOrderId))
    const search = query.search?.trim()
    if (search) {
      const term = `%${search}%`
      conditions.push(
        or(
          ilike(contracts.title, term),
          ilike(contracts.contractNumber, term),
          ilike(people.firstName, term),
          ilike(people.lastName, term),
          // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
          sql`${people.firstName} || ' ' || ${people.lastName} ILIKE ${term}`,
          ilike(personDirectoryView.email, term),
          ilike(personDirectoryView.phone, term),
        ),
      )
    }
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select({
          ...getTableColumns(contracts),
          personFirstName: people.firstName,
          personLastName: people.lastName,
          personEmail: personDirectoryView.email,
          personPhone: personDirectoryView.phone,
        })
        .from(contracts)
        .leftJoin(people, eq(contracts.personId, people.id))
        .leftJoin(personDirectoryView, eq(contracts.personId, personDirectoryView.personId))
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(contracts.createdAt)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contracts)
        .leftJoin(people, eq(contracts.personId, people.id))
        .leftJoin(personDirectoryView, eq(contracts.personId, personDirectoryView.personId))
        .where(where),
      query.limit,
      query.offset,
    )
  },
  async getContractById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1)
    return row ?? null
  },
  async createContract(db: PostgresJsDatabase, data: CreateContractInput) {
    await assertContractPartiesExist(db, data)
    const now = new Date()
    const stage = data.status ?? "draft"
    const [row] = await db
      .insert(contracts)
      .values({
        ...data,
        ...normalizeLegalTargetFields(data),
        stageHistory: [createContractStageHistoryEntry(stage, { enteredAt: now })],
        expiresAt: toTimestamp(data.expiresAt),
      })
      .returning()
    return row ?? null
  },
  async updateContract(db: PostgresJsDatabase, id: string, data: UpdateContractInput) {
    const { status: _status, ...update } = data as UpdateContractInput & {
      status?: never
    }
    const [existing] = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1)
    if (!existing) return null
    if (existing.status !== "draft") {
      throw new RequestValidationError(
        "Issued, sent, signed, executed, expired, and void contract revisions are immutable.",
      )
    }
    const metadata =
      existing.metadata &&
      typeof existing.metadata === "object" &&
      !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {}
    if (metadata.bookingContractWorkflow) {
      throw new RequestValidationError(
        "Booking contract revisions are immutable; create a new revision instead of patching.",
      )
    }
    await assertContractPartiesExist(db, update)
    const [row] = await db
      .update(contracts)
      .set({
        ...update,
        ...normalizeLegalTargetUpdateFields(update),
        expiresAt: update.expiresAt === undefined ? undefined : toTimestamp(update.expiresAt),
        updatedAt: new Date(),
      })
      .where(and(eq(contracts.id, id), eq(contracts.status, "draft")))
      .returning()
    if (!row) {
      throw new RequestValidationError("The contract changed state and can no longer be patched.")
    }
    return row
  },
  async deleteContract(db: PostgresJsDatabase, id: string) {
    const [existing] = await db
      .select({ id: contracts.id, status: contracts.status, metadata: contracts.metadata })
      .from(contracts)
      .where(eq(contracts.id, id))
      .limit(1)
    if (!existing) return { status: "not_found" as const }
    if (existing.status !== "draft" && existing.status !== "void") {
      return { status: "not_deletable" as const }
    }
    const metadata =
      existing.metadata &&
      typeof existing.metadata === "object" &&
      !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {}
    if (metadata.bookingContractWorkflow) {
      return { status: "immutable_revision" as const }
    }
    await db.delete(contracts).where(eq(contracts.id, id))
    return { status: "deleted" as const }
  },
  async issueContract(
    db: PostgresJsDatabase,
    contractId: string,
    runtime?: ContractLifecycleRuntimeOptions,
  ) {
    const result = await db.transaction(async (tx) => {
      const [contract] = await tx
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .for("update")
        .limit(1)
      if (!contract) return { status: "not_found" as const }
      const transition = checkContractLifecycleTransition(contract.status, "issued")
      if (!transition.ok) return { status: transition.reason }

      let contractNumber = contract.contractNumber
      if (!contractNumber && contract.seriesId) {
        const allocated = await allocateContractNumber(tx as PostgresJsDatabase, contract.seriesId)
        if (allocated) contractNumber = allocated.number
      }

      const baseVariables = (contract.variables as Record<string, unknown> | null) ?? {}
      const variables = contractNumber
        ? mergeContractNumberIntoVariables(baseVariables, contractNumber)
        : baseVariables

      let renderedBody = contract.renderedBody
      let renderedBodyFormat = contract.renderedBodyFormat
      if (contract.templateVersionId) {
        const [version] = await tx
          .select()
          .from(contractTemplateVersions)
          .where(eq(contractTemplateVersions.id, contract.templateVersionId))
          .limit(1)
        if (version) {
          renderedBody = renderTemplate(version.body, "html", variables)
          renderedBodyFormat = "html"
        }
      }
      const now = new Date()
      const stageHistory = appendContractStageHistory(
        contract.stageHistory,
        createContractStageHistoryEntry("issued", {
          previousStage: contract.status,
          transition: "issued",
          enteredAt: now,
        }),
      )
      const [updated] = await tx
        .update(contracts)
        .set({
          status: "issued",
          stageHistory,
          issuedAt: now,
          renderedBody,
          renderedBodyFormat,
          contractNumber,
          variables: variables !== baseVariables ? variables : contract.variables,
          updatedAt: now,
        })
        .where(eq(contracts.id, contractId))
        .returning()
      return {
        status: "issued" as const,
        contract: updated ?? null,
        event:
          updated && buildContractLifecycleEvent(updated, contract.status, "issued", "issued", now),
      }
    })
    if (result.status === "issued" && result.event) {
      await emitContractLifecycleEvent(runtime, result.event)
    }
    return result
  },
  async sendContract(
    db: PostgresJsDatabase,
    contractId: string,
    runtime?: ContractLifecycleRuntimeOptions,
    delivery?: { recipientEmail?: string | null; subject?: string | null; message?: string | null },
  ) {
    const result = await db.transaction(async (tx) => {
      const [contract] = await tx
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .for("update")
        .limit(1)
      if (!contract) return { status: "not_found" as const }
      const transition = checkContractLifecycleTransition(contract.status, "sent")
      if (!transition.ok) return { status: transition.reason }
      if (contract.status === "sent") {
        return { status: "sent" as const, contract, event: null }
      }
      const now = new Date()
      const stageHistory = appendContractStageHistory(
        contract.stageHistory,
        createContractStageHistoryEntry("sent", {
          previousStage: contract.status,
          transition: "sent",
          enteredAt: now,
        }),
      )
      const [updated] = await tx
        .update(contracts)
        .set({ status: "sent", stageHistory, sentAt: now, updatedAt: now })
        .where(eq(contracts.id, contractId))
        .returning()
      // Forward the operator's send-dialog customization onto the
      // lifecycle event so the notification subscriber (template
      // wires this up) can deliver the typed-in subject + message
      // instead of falling back to a static contract-sent template.
      const deliveryPayload = delivery
        ? {
            recipientEmail: delivery.recipientEmail ?? null,
            subject: delivery.subject ?? null,
            message: delivery.message ?? null,
          }
        : null
      return {
        status: "sent" as const,
        contract: updated ?? null,
        event:
          updated &&
          buildContractLifecycleEvent(
            updated,
            contract.status,
            "sent",
            "sent",
            now,
            deliveryPayload,
          ),
      }
    })
    if (result.status === "sent" && result.event) {
      await emitContractLifecycleEvent(runtime, result.event)
    }
    return result
  },
  async voidContract(
    db: PostgresJsDatabase,
    contractId: string,
    runtime?: ContractLifecycleRuntimeOptions,
  ) {
    const result = await db.transaction(async (tx) => {
      const [contract] = await tx
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .for("update")
        .limit(1)
      if (!contract) return { status: "not_found" as const }
      const transition = checkContractLifecycleTransition(contract.status, "voided")
      if (!transition.ok) return { status: transition.reason }
      const now = new Date()
      const stageHistory = appendContractStageHistory(
        contract.stageHistory,
        createContractStageHistoryEntry("void", {
          previousStage: contract.status,
          transition: "voided",
          enteredAt: now,
        }),
      )
      const [updated] = await tx
        .update(contracts)
        .set({ status: "void", stageHistory, voidedAt: now, updatedAt: now })
        .where(eq(contracts.id, contractId))
        .returning()
      return {
        status: "voided" as const,
        contract: updated ?? null,
        event:
          updated && buildContractLifecycleEvent(updated, contract.status, "void", "voided", now),
      }
    })
    if (result.status === "voided" && result.event) {
      await emitContractLifecycleEvent(runtime, result.event)
    }
    return result
  },
  listSignatures(db: PostgresJsDatabase, contractId: string) {
    return db
      .select()
      .from(contractSignatures)
      .where(eq(contractSignatures.contractId, contractId))
      .orderBy(desc(contractSignatures.signedAt))
  },
  async signContract(
    db: PostgresJsDatabase,
    contractId: string,
    data: CreateContractSignatureInput,
    runtime?: ContractLifecycleRuntimeOptions,
  ) {
    const result = await db.transaction(async (tx) => {
      const [contract] = await tx
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .for("update")
        .limit(1)
      if (!contract) return { status: "not_found" as const }
      const transition = checkContractLifecycleTransition(contract.status, "signed")
      if (!transition.ok) return { status: "not_signable" as const }
      // Same cross-module existence guard as create/update: reject a signature
      // pointing at an unknown person (the dropped FK used to enforce this).
      await assertContractPartiesExist(tx, { personId: data.personId })
      const [signature] = await tx
        .insert(contractSignatures)
        .values({
          ...data,
          ...normalizeLegalTargetFields({
            ...contract,
            ...data,
          }),
          contractId,
        })
        .returning()
      const now = new Date()
      const stageHistory = appendContractStageHistory(
        contract.stageHistory,
        createContractStageHistoryEntry("signed", {
          previousStage: contract.status,
          transition: "signed",
          enteredAt: now,
        }),
      )
      const [updated] = await tx
        .update(contracts)
        .set({ status: "signed", stageHistory, updatedAt: now })
        .where(eq(contracts.id, contractId))
        .returning()
      return {
        status: "signed" as const,
        contract: updated ?? null,
        signature: signature ?? null,
        event:
          updated && buildContractLifecycleEvent(updated, contract.status, "signed", "signed", now),
      }
    })
    if (result.status === "signed" && result.event) {
      await emitContractLifecycleEvent(runtime, result.event)
    }
    return result
  },
  async executeContract(
    db: PostgresJsDatabase,
    contractId: string,
    runtime?: ContractLifecycleRuntimeOptions,
  ) {
    const result = await db.transaction(async (tx) => {
      const [contract] = await tx
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .for("update")
        .limit(1)
      if (!contract) return { status: "not_found" as const }
      const transition = checkContractLifecycleTransition(contract.status, "executed")
      if (!transition.ok) return { status: transition.reason }
      const now = new Date()
      const stageHistory = appendContractStageHistory(
        contract.stageHistory,
        createContractStageHistoryEntry("executed", {
          previousStage: contract.status,
          transition: "executed",
          enteredAt: now,
        }),
      )
      const [updated] = await tx
        .update(contracts)
        .set({ status: "executed", stageHistory, executedAt: now, updatedAt: now })
        .where(eq(contracts.id, contractId))
        .returning()
      return {
        status: "executed" as const,
        contract: updated ?? null,
        event:
          updated &&
          buildContractLifecycleEvent(updated, contract.status, "executed", "executed", now),
      }
    })
    if (result.status === "executed" && result.event) {
      await emitContractLifecycleEvent(runtime, result.event)
    }
    return result
  },
  listAttachments(db: PostgresJsDatabase, contractId: string) {
    return db
      .select()
      .from(contractAttachments)
      .where(eq(contractAttachments.contractId, contractId))
      .orderBy(desc(contractAttachments.createdAt))
  },
  async getAttachmentById(db: PostgresJsDatabase, attachmentId: string) {
    const [row] = await db
      .select()
      .from(contractAttachments)
      .where(eq(contractAttachments.id, attachmentId))
      .limit(1)
    return row ?? null
  },
  async createAttachment(
    db: PostgresJsDatabase,
    contractId: string,
    data: CreateContractAttachmentInput,
  ) {
    assertGenericAttachmentKind(data.kind)
    const [contract] = await db
      .select({
        id: contracts.id,
        bookingId: contracts.bookingId,
        targetKind: contracts.targetKind,
        targetId: contracts.targetId,
        targetProvider: contracts.targetProvider,
        targetSourceRef: contracts.targetSourceRef,
        legacyTransactionOfferId: contracts.legacyTransactionOfferId,
        legacyTransactionOrderId: contracts.legacyTransactionOrderId,
      })
      .from(contracts)
      .where(eq(contracts.id, contractId))
      .limit(1)
    if (!contract) return null
    const [row] = await db
      .insert(contractAttachments)
      .values({
        ...data,
        ...normalizeLegalTargetFields({
          ...contract,
          ...data,
        }),
        contractId,
      })
      .returning()
    return row ?? null
  },
  async updateAttachment(
    db: PostgresJsDatabase,
    attachmentId: string,
    data: UpdateContractAttachmentInput,
  ) {
    assertGenericAttachmentKind(data.kind)
    const [existing] = await db
      .select({ kind: contractAttachments.kind })
      .from(contractAttachments)
      .where(eq(contractAttachments.id, attachmentId))
      .limit(1)
    if (!existing) return null
    assertGenericAttachmentKind(existing.kind)
    const [row] = await db
      .update(contractAttachments)
      .set(data)
      .where(
        and(
          eq(contractAttachments.id, attachmentId),
          notInArray(contractAttachments.kind, [...DURABLE_CONTRACT_DOCUMENT_ATTACHMENT_KINDS]),
        ),
      )
      .returning()
    return row ?? null
  },
  async deleteAttachment(db: PostgresJsDatabase, attachmentId: string) {
    const [existing] = await db
      .select({ kind: contractAttachments.kind })
      .from(contractAttachments)
      .where(eq(contractAttachments.id, attachmentId))
      .limit(1)
    if (!existing) return null
    assertGenericAttachmentKind(existing.kind)
    const [row] = await db
      .delete(contractAttachments)
      .where(
        and(
          eq(contractAttachments.id, attachmentId),
          notInArray(contractAttachments.kind, [...DURABLE_CONTRACT_DOCUMENT_ATTACHMENT_KINDS]),
        ),
      )
      .returning()
    return row ?? null
  },
}
