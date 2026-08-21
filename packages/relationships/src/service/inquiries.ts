// agent-quality: file-size exception -- owner: relationships; Inquiry lifecycle, idempotency, target projection, and audit writes remain co-located behind one service contract.
import { generateEventId, type LinkService } from "@voyant-travel/core"
import { createLinkService } from "@voyant-travel/db/links"
import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import type { MediaInquiryAttachmentRuntime } from "@voyant-travel/media/runtime-port"
import type {
  AddInquiryTargetInput,
  AssignInquiryInput,
  AttachInquiryAssetInput,
  CloseInquiryInput,
  CreateInquiryInput,
  CreatePublicInquiryInput,
  EraseInquiryPrivacyInput,
  InquiryAttachmentRecord,
  InquiryListQueryInput,
  InquiryStatus,
  InquiryTargetRecord,
  RecordInquiryActivityInput,
  ReopenInquiryInput,
  TransitionInquiryInput,
  UpdateInquiryAttachmentInput,
  UpdateInquiryInput,
} from "@voyant-travel/relationships-contracts"
import type { InquiryMaterializedTargetKind } from "@voyant-travel/relationships-contracts/inquiry-target-authority/runtime-port"
import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  INQUIRY_ASSIGNED_EVENT,
  INQUIRY_CLOSED_EVENT,
  INQUIRY_CREATED_EVENT,
  INQUIRY_FIRST_RESPONSE_RECORDED_EVENT,
  INQUIRY_REOPENED_EVENT,
  INQUIRY_STATUS_CHANGED_EVENT,
  INQUIRY_TARGET_ADDED_EVENT,
  INQUIRY_TARGET_REMOVED_EVENT,
  INQUIRY_UPDATED_EVENT,
} from "../events.js"
import {
  firstResponseDueAtForInquiry,
  type InquiryFirstResponseSlaPolicy,
} from "../inquiry-sla-policy.js"
import type { InquiryTargetValidationRuntime } from "../route-runtime.js"
import {
  activities,
  activityLinks,
  type Inquiry,
  inquiries,
  inquiryAttachmentSnapshots,
  inquiryConversions,
  inquiryTargetSnapshots,
  organizations,
  people,
} from "../schema.js"
import {
  inquiryDepartureLink,
  inquiryMediaAssetLink,
  inquiryProductLink,
} from "../standard-links.js"
import { paginate } from "./helpers.js"

export type InquiryServiceErrorCode =
  | "INQUIRY_NOT_FOUND"
  | "INQUIRY_RELATED_RECORD_NOT_FOUND"
  | "INVALID_INQUIRY_TRANSITION"
  | "INQUIRY_ASSIGNMENT_REQUIRED"
  | "INQUIRY_NEXT_ACTION_REQUIRED"
  | "INQUIRY_CUSTOMER_REQUIRED"
  | "INQUIRY_ALREADY_RESOLVED"
  | "INQUIRY_CONVERSION_NOT_READY"
  | "INQUIRY_CONVERSION_REFUSED"
  | "INVALID_DUPLICATE_INQUIRY"
  | "INQUIRY_TARGET_NOT_FOUND"
  | "INQUIRY_TARGET_IN_USE"
  | "INQUIRY_TARGET_UNSUPPORTED"
  | "INQUIRY_TARGET_VALIDATION_UNAVAILABLE"
  | "INQUIRY_ATTACHMENT_AUTHORITY_UNAVAILABLE"

export class InquiryServiceError extends Error {
  constructor(
    readonly code: InquiryServiceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "InquiryServiceError"
  }
}

const transitions: Record<InquiryStatus, readonly InquiryStatus[]> = {
  new: ["triaged"],
  triaged: ["in_progress", "qualified"],
  in_progress: ["waiting_on_customer", "qualified"],
  waiting_on_customer: ["in_progress", "qualified"],
  qualified: [],
  converted: [],
  closed: [],
}

export function canTransitionInquiry(from: InquiryStatus, to: InquiryStatus): boolean {
  return transitions[from].includes(to)
}

function date(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  return value === null ? null : new Date(value)
}

async function assertRelatedRecords(
  db: PostgresJsDatabase,
  input: { personId?: string | null; organizationId?: string | null },
) {
  if (input.personId) {
    const [person] = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.id, input.personId))
    if (!person) {
      throw new InquiryServiceError("INQUIRY_RELATED_RECORD_NOT_FOUND", "Person not found")
    }
  }
  if (input.organizationId) {
    const [organization] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
    if (!organization) {
      throw new InquiryServiceError("INQUIRY_RELATED_RECORD_NOT_FOUND", "Organization not found")
    }
  }
}

function updateDates(input: { nextActionAt?: string | null; firstResponseDueAt?: string | null }) {
  return {
    ...(input.nextActionAt !== undefined ? { nextActionAt: date(input.nextActionAt) } : {}),
    ...(input.firstResponseDueAt !== undefined
      ? { firstResponseDueAt: date(input.firstResponseDueAt) }
      : {}),
  }
}

async function lockedInquiry(db: PostgresJsDatabase, id: string) {
  const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id)).for("update")
  if (!row) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
  return row
}

type InquiryMutationTestHooks = {
  /** Test-only rollback seam between the domain write and its outbox write. */
  beforeOutbox?: (tx: PostgresJsDatabase) => Promise<void>
  /** Deployment-resolved source × priority SLA policy. */
  slaPolicy?: InquiryFirstResponseSlaPolicy
}

type InquiryTargetMutationTestHooks = {
  /** Test-only rollback seam after link/snapshot mutation and before the outbox write. */
  beforeOutbox?: (tx: PostgresJsDatabase) => Promise<void>
}

function requireActor(actorId: string) {
  if (!actorId) {
    throw new InquiryServiceError("INQUIRY_CUSTOMER_REQUIRED", "A staff actor is required")
  }
}

function inquiryCreatedEventId(inquiryId: string) {
  return `evt_relationships_inquiry_created_${inquiryId}`
}

const targetLinks = {
  product: inquiryProductLink,
  departure: inquiryDepartureLink,
} as const

/** Refusals that concern one target, not the Inquiry that carries it. */
function isTargetRefusal(code: InquiryServiceErrorCode) {
  return (
    code === "INQUIRY_TARGET_NOT_FOUND" ||
    code === "INQUIRY_TARGET_UNSUPPORTED" ||
    code === "INQUIRY_TARGET_VALIDATION_UNAVAILABLE"
  )
}

function targetLinkFor(kind: AddInquiryTargetInput["kind"]) {
  if (kind === "catalog_item" || kind === "trip") {
    throw new InquiryServiceError(
      "INQUIRY_TARGET_UNSUPPORTED",
      `Inquiry target kind ${kind} has no selected owner linkable`,
    )
  }
  return targetLinks[kind]
}

function serializeTarget(row: typeof inquiryTargetSnapshots.$inferSelect): InquiryTargetRecord {
  return {
    linkId: row.linkId,
    inquiryId: row.inquiryId,
    kind: row.kind,
    targetId: row.targetId,
    snapshot: row.snapshot,
    createdAt: row.createdAt.toISOString(),
  }
}

function serializeAttachment(
  row: typeof inquiryAttachmentSnapshots.$inferSelect,
): InquiryAttachmentRecord {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    downloadPath: `/v1/admin/relationships/inquiries/${encodeURIComponent(row.inquiryId)}/attachments/${encodeURIComponent(row.linkId)}/download`,
  }
}

async function writeInquiryEvent(
  db: PostgresJsDatabase,
  name: string,
  data: Record<string, unknown>,
  eventId = generateEventId(),
) {
  await insertOutboxEvents(db, [
    {
      name,
      data,
      metadata: { category: "domain", source: "service", eventId },
    },
  ])
}

async function recordFirstResponseInTransaction(
  tx: PostgresJsDatabase,
  id: string,
  actorId: string,
  testHooks?: InquiryMutationTestHooks,
) {
  const current = await lockedInquiry(tx, id)
  if (current.firstRespondedAt) return current
  if (current.status === "closed" || current.status === "converted") {
    throw new InquiryServiceError(
      "INQUIRY_ALREADY_RESOLVED",
      "A resolved inquiry cannot record its first response",
    )
  }
  const now = new Date()
  const [row] = await tx
    .update(inquiries)
    .set({ firstRespondedAt: now, lastActivityAt: now, updatedAt: now })
    .where(and(eq(inquiries.id, id), isNull(inquiries.firstRespondedAt)))
    .returning()
  if (!row) {
    const replayed = await lockedInquiry(tx, id)
    if (replayed.firstRespondedAt) return replayed
    throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
  }
  await testHooks?.beforeOutbox?.(tx)
  await writeInquiryEvent(tx, INQUIRY_FIRST_RESPONSE_RECORDED_EVENT, {
    id,
    actorId,
    firstRespondedAt: now.toISOString(),
  })
  return row
}
/** Stable policy map consumed by export/erasure reviews and retention tooling. */
export const INQUIRY_PRIVACY_CLASSIFICATION = {
  "inquiry.contactSnapshot": "personal_data",
  "inquiry.customerMessage": "personal_data",
  "inquiry.travelBrief": "personal_data",
  "inquiry.internalSummary": "personal_data",
  "inquiry.customFields": "personal_data",
  "inquiry.lifecycle": "operational",
  "inquiry.privacyErasureReason": "audit_provenance",
  "inquiry.privacyPurgeAssetIds": "audit_provenance",
  "activities.freeText": "personal_data",
  "activities.customFields": "personal_data",
  "activities.identityAndTimestamps": "audit_provenance",
  "attachments.bytesAndCaption": "personal_data",
  "conversions.idsAndTargets": "legal_reference",
} as const

export const inquiriesService = {
  async exportInquiryPrivacy(db: PostgresJsDatabase, link: LinkService, inquiryId: string) {
    const inquiry = await this.getInquiry(db, inquiryId)
    if (!inquiry) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
    const [targets, attachments, conversions, activityRows] = await Promise.all([
      this.listInquiryTargets(db, link, inquiryId),
      this.listInquiryAttachments(db, link, inquiryId),
      db
        .select({
          id: inquiryConversions.id,
          kind: inquiryConversions.kind,
          targetId: inquiryConversions.targetId,
          createdAt: inquiryConversions.createdAt,
        })
        .from(inquiryConversions)
        .where(eq(inquiryConversions.inquiryId, inquiryId))
        .orderBy(asc(inquiryConversions.createdAt)),
      db
        .select({
          id: activities.id,
          subject: activities.subject,
          description: activities.description,
          location: activities.location,
          customFields: activities.customFields,
          type: activities.type,
          status: activities.status,
          ownerId: activities.ownerId,
          dueAt: activities.dueAt,
          completedAt: activities.completedAt,
          createdAt: activities.createdAt,
          updatedAt: activities.updatedAt,
        })
        .from(activityLinks)
        .innerJoin(activities, eq(activityLinks.activityId, activities.id))
        .where(and(eq(activityLinks.entityType, "inquiry"), eq(activityLinks.entityId, inquiryId)))
        .orderBy(asc(activities.createdAt)),
    ])
    return {
      inquiry: { ...inquiry, targets, attachments },
      conversionProvenance: conversions.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      activities: activityRows.map((activity) => ({
        ...activity,
        dueAt: activity.dueAt?.toISOString() ?? null,
        completedAt: activity.completedAt?.toISOString() ?? null,
        createdAt: activity.createdAt.toISOString(),
        updatedAt: activity.updatedAt.toISOString(),
      })),
      attachmentBinaryManifest: attachments.map((attachment) => ({
        linkId: attachment.linkId,
        assetId: attachment.assetId,
        name: attachment.name,
        mimeType: attachment.mimeType,
        downloadPath: attachment.downloadPath,
        authenticationRequired: true as const,
      })),
      activityIds: activityRows.map((row) => row.id),
      attachmentIds: attachments.map((attachment) => attachment.assetId),
      classification: INQUIRY_PRIVACY_CLASSIFICATION,
    }
  },

  async eraseInquiryPrivacy(
    db: PostgresJsDatabase,
    inquiryId: string,
    input: EraseInquiryPrivacyInput,
    actorId: string,
    _bindings?: unknown,
    authority?: MediaInquiryAttachmentRuntime,
    appendAudit?: (tx: PostgresJsDatabase) => Promise<unknown>,
  ) {
    requireActor(actorId)
    if (!authority) {
      throw new InquiryServiceError(
        "INQUIRY_ATTACHMENT_AUTHORITY_UNAVAILABLE",
        "Media attachment authority is unavailable",
      )
    }
    const result = await db.transaction(async (tx) => {
      const inquiry = await lockedInquiry(tx, inquiryId)
      if (inquiry.privacyErasedAt) {
        for (const assetId of inquiry.privacyPurgeAssetIds) {
          await authority.requestPrivateDocumentPurge(tx, assetId)
        }
        await appendAudit?.(tx as PostgresJsDatabase)
        return inquiry
      }
      const attachmentRows = await tx
        .select()
        .from(inquiryAttachmentSnapshots)
        .where(eq(inquiryAttachmentSnapshots.inquiryId, inquiryId))
      const transactionLink = createLinkService(() => tx, [inquiryMediaAssetLink])
      for (const attachment of attachmentRows) {
        await transactionLink.delete(inquiryMediaAssetLink.tableName, inquiryId, attachment.assetId)
        await authority.releasePrivateDocument(tx, attachment.assetId, attachment.linkId)
        await authority.requestPrivateDocumentPurge(tx, attachment.assetId)
      }
      await tx
        .delete(inquiryAttachmentSnapshots)
        .where(eq(inquiryAttachmentSnapshots.inquiryId, inquiryId))
      // Activity identity/timestamps remain audit evidence. Only an Activity
      // exclusively linked to this Inquiry can have its free text redacted;
      // shared Activity data belongs to its other Relationship contexts.
      await tx.execute(sql`UPDATE activities SET subject = 'Redacted inquiry activity', description = NULL, location = NULL, custom_fields = '{}'::jsonb, updated_at = now()
        WHERE id IN (SELECT activity_id FROM activity_links WHERE entity_type::text = 'inquiry' AND entity_id = ${inquiryId})
          AND NOT EXISTS (
            SELECT 1 FROM activity_links other
            WHERE other.activity_id = activities.id
              AND NOT (other.entity_type::text = 'inquiry' AND other.entity_id = ${inquiryId})
          )`)
      await tx.execute(sql`DELETE FROM activity_links inquiry_link
        WHERE inquiry_link.entity_type::text = 'inquiry'
          AND inquiry_link.entity_id = ${inquiryId}
          AND EXISTS (
            SELECT 1 FROM activity_links other
            WHERE other.activity_id = inquiry_link.activity_id AND other.id <> inquiry_link.id
          )`)
      const erasedAt = new Date()
      const [updated] = await tx
        .update(inquiries)
        .set({
          subject: "Redacted inquiry",
          personId: null,
          organizationId: null,
          contactSnapshot: { name: "Redacted" },
          travelBrief: null,
          customerMessage: null,
          internalSummary: null,
          sourceUrl: null,
          sourceRef: null,
          consentSnapshot: null,
          closeNote: null,
          unassignedReason: null,
          locale: null,
          tags: [],
          customFields: {},
          privacyErasedAt: erasedAt,
          privacyErasedBy: actorId,
          privacyErasureReason: input.reasonCode,
          privacyPurgeAssetIds: Array.from(
            new Set(attachmentRows.map((attachment) => attachment.assetId)),
          ),
          updatedAt: erasedAt,
        })
        .where(eq(inquiries.id, inquiryId))
        .returning()
      if (!updated) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
      await writeInquiryEvent(tx, INQUIRY_UPDATED_EVENT, {
        id: inquiryId,
        actorId,
        change: "privacy_erased",
        occurredAt: erasedAt.toISOString(),
      })
      await appendAudit?.(tx as PostgresJsDatabase)
      return updated
    })
    return result
  },

  async listInquiryAttachments(
    db: PostgresJsDatabase,
    link: LinkService,
    inquiryId: string,
  ): Promise<InquiryAttachmentRecord[]> {
    const rows = await db
      .select()
      .from(inquiryAttachmentSnapshots)
      .where(eq(inquiryAttachmentSnapshots.inquiryId, inquiryId))
      .orderBy(asc(inquiryAttachmentSnapshots.createdAt), asc(inquiryAttachmentSnapshots.linkId))
    const active = new Set(
      (await link.list(inquiryMediaAssetLink.tableName, { leftId: inquiryId })).map(
        (row) => row.id,
      ),
    )
    return rows.filter((row) => active.has(row.linkId)).map(serializeAttachment)
  },

  async resolveInquiryAttachment(
    db: PostgresJsDatabase,
    link: LinkService,
    inquiryId: string,
    linkId: string,
  ): Promise<InquiryAttachmentRecord | null> {
    const [row] = await db
      .select()
      .from(inquiryAttachmentSnapshots)
      .where(
        and(
          eq(inquiryAttachmentSnapshots.inquiryId, inquiryId),
          eq(inquiryAttachmentSnapshots.linkId, linkId),
        ),
      )
      .limit(1)
    if (!row) return null
    const active = await link.list(inquiryMediaAssetLink.tableName, { leftId: inquiryId })
    return active.some((candidate) => candidate.id === linkId) ? serializeAttachment(row) : null
  },

  async attachInquiryAsset(
    db: PostgresJsDatabase,
    inquiryId: string,
    input: AttachInquiryAssetInput,
    actorId: string,
    authority?: MediaInquiryAttachmentRuntime,
  ): Promise<InquiryAttachmentRecord> {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      await lockedInquiry(tx, inquiryId)
      if (!authority) {
        throw new InquiryServiceError(
          "INQUIRY_ATTACHMENT_AUTHORITY_UNAVAILABLE",
          "Media attachment authority is unavailable",
        )
      }
      const asset = await authority.resolvePrivateDocument(tx, input.assetId)
      if (!asset) {
        throw new InquiryServiceError("INQUIRY_TARGET_NOT_FOUND", "Private document not found")
      }
      const transactionLink = createLinkService(() => tx, [inquiryMediaAssetLink])
      const linked = await transactionLink.create(
        inquiryMediaAssetLink.tableName,
        inquiryId,
        input.assetId,
      )
      await authority.claimExistingPrivateDocument(tx, input.assetId, linked.id)
      const [created] = await tx
        .insert(inquiryAttachmentSnapshots)
        .values({
          linkId: linked.id,
          inquiryId,
          assetId: input.assetId,
          name: input.displayName,
          mimeType: asset.mimeType,
          caption: input.caption ?? null,
          attachedBy: actorId,
        })
        .onConflictDoNothing()
        .returning()
      const row =
        created ??
        (
          await tx
            .select()
            .from(inquiryAttachmentSnapshots)
            .where(eq(inquiryAttachmentSnapshots.linkId, linked.id))
            .limit(1)
        )[0]
      if (!row) throw new Error("Inquiry attachment metadata could not be persisted")
      if (created) {
        await writeInquiryEvent(tx, INQUIRY_UPDATED_EVENT, {
          id: inquiryId,
          actorId,
          change: "attachment_added",
          linkId: row.linkId,
          assetId: row.assetId,
          occurredAt: row.createdAt.toISOString(),
        })
      }
      return serializeAttachment(row)
    })
  },

  async uploadInquiryAttachment(
    db: PostgresJsDatabase,
    inquiryId: string,
    input: {
      operationKey: string
      name: string
      mimeType: string | null
      caption: string | null
      body: ArrayBuffer
    },
    actorId: string,
    bindings: unknown,
    authority?: MediaInquiryAttachmentRuntime,
  ): Promise<InquiryAttachmentRecord> {
    requireActor(actorId)
    if (!authority) {
      throw new InquiryServiceError(
        "INQUIRY_ATTACHMENT_AUTHORITY_UNAVAILABLE",
        "Media attachment authority is unavailable",
      )
    }
    const prepared = await authority.preparePrivateDocument(bindings, {
      operationKey: input.operationKey,
      name: input.name,
      mimeType: input.mimeType,
      body: input.body,
      createdBy: actorId,
    })
    let attachment: InquiryAttachmentRecord
    try {
      attachment = await db.transaction(async (tx) => {
        await lockedInquiry(tx, inquiryId)
        const transactionLink = createLinkService(() => tx, [inquiryMediaAssetLink])
        const linked = await transactionLink.create(
          inquiryMediaAssetLink.tableName,
          inquiryId,
          prepared.id,
        )
        await authority.claimPrivateDocument(tx, prepared, linked.id)
        const [row] = await tx
          .insert(inquiryAttachmentSnapshots)
          .values({
            linkId: linked.id,
            inquiryId,
            assetId: prepared.id,
            name: input.name,
            mimeType: prepared.mimeType,
            caption: input.caption,
            attachedBy: actorId,
          })
          .onConflictDoNothing()
          .returning()
        const stored =
          row ??
          (
            await tx
              .select()
              .from(inquiryAttachmentSnapshots)
              .where(eq(inquiryAttachmentSnapshots.linkId, linked.id))
              .limit(1)
          )[0]
        if (!stored) throw new Error("Inquiry attachment metadata could not be persisted")
        if (row) {
          await writeInquiryEvent(tx, INQUIRY_UPDATED_EVENT, {
            id: inquiryId,
            actorId,
            change: "attachment_added",
            linkId: row.linkId,
            assetId: row.assetId,
            occurredAt: row.createdAt.toISOString(),
          })
        }
        return serializeAttachment(stored)
      })
    } catch (error) {
      await authority.abortPrivateDocument(bindings, prepared)
      throw error
    }
    // The link, usage claim, snapshot, and outbox are committed. A finalize
    // failure must remain retryable and must never trigger abort/deletion.
    await authority.finalizePrivateDocument(bindings, prepared)
    return attachment
  },

  async updateInquiryAttachment(
    db: PostgresJsDatabase,
    inquiryId: string,
    linkId: string,
    input: UpdateInquiryAttachmentInput,
    actorId: string,
  ): Promise<InquiryAttachmentRecord> {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      await lockedInquiry(tx, inquiryId)
      const [updated] = await tx
        .update(inquiryAttachmentSnapshots)
        .set({ caption: input.caption, updatedAt: new Date() })
        .where(
          and(
            eq(inquiryAttachmentSnapshots.inquiryId, inquiryId),
            eq(inquiryAttachmentSnapshots.linkId, linkId),
          ),
        )
        .returning()
      if (!updated) {
        throw new InquiryServiceError("INQUIRY_TARGET_NOT_FOUND", "Inquiry attachment not found")
      }
      await writeInquiryEvent(tx, INQUIRY_UPDATED_EVENT, {
        id: inquiryId,
        actorId,
        change: "attachment_caption_updated",
        linkId,
        occurredAt: updated.updatedAt.toISOString(),
      })
      return serializeAttachment(updated)
    })
  },

  async removeInquiryAttachment(
    db: PostgresJsDatabase,
    inquiryId: string,
    linkId: string,
    actorId: string,
    authority?: MediaInquiryAttachmentRuntime,
  ): Promise<void> {
    requireActor(actorId)
    if (!authority) {
      throw new InquiryServiceError(
        "INQUIRY_ATTACHMENT_AUTHORITY_UNAVAILABLE",
        "Media attachment authority is unavailable",
      )
    }
    return db.transaction(async (tx) => {
      await lockedInquiry(tx, inquiryId)
      const [row] = await tx
        .select()
        .from(inquiryAttachmentSnapshots)
        .where(
          and(
            eq(inquiryAttachmentSnapshots.inquiryId, inquiryId),
            eq(inquiryAttachmentSnapshots.linkId, linkId),
          ),
        )
        .limit(1)
      if (!row) {
        throw new InquiryServiceError("INQUIRY_TARGET_NOT_FOUND", "Inquiry attachment not found")
      }
      const transactionLink = createLinkService(() => tx, [inquiryMediaAssetLink])
      await transactionLink.delete(inquiryMediaAssetLink.tableName, inquiryId, row.assetId)
      await authority.releasePrivateDocument(tx, row.assetId, row.linkId)
      await authority.requestPrivateDocumentPurge(tx, row.assetId)
      await tx
        .delete(inquiryAttachmentSnapshots)
        .where(eq(inquiryAttachmentSnapshots.linkId, linkId))
      await writeInquiryEvent(tx, INQUIRY_UPDATED_EVENT, {
        id: inquiryId,
        actorId,
        change: "attachment_removed",
        linkId,
        assetId: row.assetId,
        occurredAt: new Date().toISOString(),
      })
    })
  },

  async createPublicInquiry(
    db: PostgresJsDatabase,
    input: CreatePublicInquiryInput,
    context: {
      actorId: string
      channelId: string
      relationshipPersonId?: string | null
      targetValidation?: InquiryTargetValidationRuntime
      slaPolicy?: InquiryFirstResponseSlaPolicy
    },
  ) {
    // Targets are attached best-effort. Storefront intake is a capture path: a
    // reference the owner refuses is recorded against the Inquiry, never a
    // reason to roll back the customer's submission ([#4838]).
    const refusedTargets: { kind: string; targetId: string; reason: InquiryServiceErrorCode }[] = []
    return db.transaction(async (tx) => {
      const { targets, ...inquiryInput } = input
      const result = await this.createInquiry(
        tx,
        {
          ...inquiryInput,
          priority: "normal",
          source: "storefront",
          sourceRef: `${context.channelId}:${input.sourceRef}`,
          personId: context.relationshipPersonId ?? null,
          customFields: {
            ...input.customFields,
            relationships: {
              ...input.customFields.relationships,
              sourceChannelId: context.channelId,
            },
          },
        },
        context.actorId,
        { slaPolicy: context.slaPolicy },
      )
      if (!result.replayed) {
        for (const target of targets) {
          try {
            await this.addInquiryTarget(
              tx,
              result.inquiry.id,
              {
                ...target,
                snapshot: {
                  ...target.snapshot,
                  sourceChannel: context.channelId,
                },
              },
              context.actorId,
              context.targetValidation,
            )
          } catch (error) {
            if (!(error instanceof InquiryServiceError) || !isTargetRefusal(error.code)) throw error
            refusedTargets.push({
              kind: target.kind,
              targetId: target.targetId,
              reason: error.code,
            })
          }
        }
      }
      return { ...result, refusedTargets }
    })
  },

  async listInquiryTargets(
    db: PostgresJsDatabase,
    link: LinkService,
    inquiryId: string,
  ): Promise<InquiryTargetRecord[]> {
    return (await this.listInquiryTargetsForInquiries(db, link, [inquiryId])).get(inquiryId) ?? []
  },

  async listInquiryTargetsForInquiries(
    db: PostgresJsDatabase,
    link: LinkService,
    inquiryIds: string[],
  ): Promise<Map<string, InquiryTargetRecord[]>> {
    const grouped = new Map(inquiryIds.map((id) => [id, [] as InquiryTargetRecord[]]))
    if (inquiryIds.length === 0) return grouped
    const rows = await db
      .select()
      .from(inquiryTargetSnapshots)
      .where(
        and(
          inArray(inquiryTargetSnapshots.inquiryId, inquiryIds),
          isNull(inquiryTargetSnapshots.removedAt),
        ),
      )
      .orderBy(asc(inquiryTargetSnapshots.createdAt), asc(inquiryTargetSnapshots.linkId))
    const activeIds = new Set<string>()
    for (const definition of Object.values(targetLinks)) {
      const links = await link.list(definition.tableName, { leftIds: inquiryIds })
      for (const row of links) activeIds.add(row.id)
    }
    for (const row of rows) {
      if (activeIds.has(row.linkId)) grouped.get(row.inquiryId)?.push(serializeTarget(row))
    }
    return grouped
  },

  async resolveInquiryTarget(
    db: PostgresJsDatabase,
    link: LinkService,
    inquiryId: string,
    targetLinkId: string,
  ): Promise<InquiryTargetRecord | null> {
    const [snapshot] = await db
      .select()
      .from(inquiryTargetSnapshots)
      .where(
        and(
          eq(inquiryTargetSnapshots.inquiryId, inquiryId),
          eq(inquiryTargetSnapshots.linkId, targetLinkId),
          isNull(inquiryTargetSnapshots.removedAt),
        ),
      )
      .limit(1)
    if (!snapshot) return null
    const definition = targetLinkFor(snapshot.kind)
    const active = await link.list(definition.tableName, { leftId: inquiryId })
    return active.some((row) => row.id === targetLinkId) ? serializeTarget(snapshot) : null
  },

  async addInquiryTarget(
    db: PostgresJsDatabase,
    inquiryId: string,
    input: AddInquiryTargetInput,
    actorId: string,
    targetValidation?: InquiryTargetValidationRuntime,
    testHooks?: InquiryTargetMutationTestHooks,
  ): Promise<InquiryTargetRecord> {
    requireActor(actorId)
    const definition = targetLinkFor(input.kind)
    const materializedKind = input.kind as InquiryMaterializedTargetKind
    // Existence is the owning module's call, not a guess from the id's shape.
    // A prefix pre-check here duplicated `validateTarget` below and refused ids
    // the owner would have resolved, so it is deliberately absent.
    return db.transaction(async (tx) => {
      const inquiry = await lockedInquiry(tx, inquiryId)
      if (inquiry.status === "closed" || inquiry.status === "converted") {
        throw new InquiryServiceError(
          "INQUIRY_ALREADY_RESOLVED",
          "A resolved inquiry cannot gain targets",
        )
      }
      if (!targetValidation) {
        throw new InquiryServiceError(
          "INQUIRY_TARGET_VALIDATION_UNAVAILABLE",
          `No owner authority is available to validate ${input.kind} targets`,
        )
      }
      const validation = await targetValidation.validateTarget(tx, materializedKind, input.targetId)
      if (validation === "unavailable") {
        throw new InquiryServiceError(
          "INQUIRY_TARGET_VALIDATION_UNAVAILABLE",
          `No owner authority is available to validate ${input.kind} targets`,
        )
      }
      if (validation === "not_found") {
        throw new InquiryServiceError("INQUIRY_TARGET_NOT_FOUND", `${input.kind} target not found`)
      }
      const transactionLink = createLinkService(() => tx, Object.values(targetLinks))
      const linked = await transactionLink.create(definition.tableName, inquiryId, input.targetId)
      const [stored] = await tx
        .insert(inquiryTargetSnapshots)
        .values({
          linkId: linked.id,
          inquiryId,
          kind: materializedKind,
          targetId: input.targetId,
          snapshot: input.snapshot,
        })
        .onConflictDoNothing()
        .returning()
      const row =
        stored ??
        (
          await tx
            .select()
            .from(inquiryTargetSnapshots)
            .where(eq(inquiryTargetSnapshots.linkId, linked.id))
            .limit(1)
        )[0]
      if (!row) throw new Error("Inquiry target snapshot could not be persisted")
      if (!stored && !row.removedAt) return serializeTarget(row)
      const activeRow = row.removedAt
        ? (
            await tx
              .update(inquiryTargetSnapshots)
              .set({ removedAt: null, removedByActorId: null })
              .where(eq(inquiryTargetSnapshots.linkId, row.linkId))
              .returning()
          )[0]
        : row
      if (!activeRow) throw new Error("Inquiry target snapshot could not be reactivated")
      await testHooks?.beforeOutbox?.(tx)
      const occurredAt = new Date().toISOString()
      await writeInquiryEvent(tx, INQUIRY_TARGET_ADDED_EVENT, {
        id: inquiryId,
        actorId,
        linkId: row.linkId,
        kind: row.kind,
        targetId: row.targetId,
        occurredAt,
      })
      return serializeTarget(activeRow)
    })
  },

  async deleteInquiryTarget(
    db: PostgresJsDatabase,
    inquiryId: string,
    targetLinkId: string,
    actorId: string,
    testHooks?: InquiryTargetMutationTestHooks,
  ): Promise<void> {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      const inquiry = await lockedInquiry(tx, inquiryId)
      if (inquiry.status === "closed" || inquiry.status === "converted") {
        throw new InquiryServiceError(
          "INQUIRY_ALREADY_RESOLVED",
          "A resolved inquiry cannot lose targets",
        )
      }
      const [snapshot] = await tx
        .select()
        .from(inquiryTargetSnapshots)
        .where(
          and(
            eq(inquiryTargetSnapshots.inquiryId, inquiryId),
            eq(inquiryTargetSnapshots.linkId, targetLinkId),
            isNull(inquiryTargetSnapshots.removedAt),
          ),
        )
        .limit(1)
      if (!snapshot) {
        throw new InquiryServiceError("INQUIRY_TARGET_NOT_FOUND", "Inquiry target not found")
      }
      const [conversion] = await tx
        .select({ id: inquiryConversions.id })
        .from(inquiryConversions)
        .where(
          and(
            eq(inquiryConversions.inquiryId, inquiryId),
            sql`${inquiryConversions.targetSnapshot}->>'targetLinkId' = ${targetLinkId}`,
          ),
        )
        .limit(1)
      if (conversion) {
        throw new InquiryServiceError(
          "INQUIRY_TARGET_IN_USE",
          "An Inquiry target used by a conversion cannot be removed",
        )
      }
      const definition = targetLinkFor(snapshot.kind)
      const transactionLink = createLinkService(() => tx, Object.values(targetLinks))
      await transactionLink.dismiss(definition.tableName, inquiryId, snapshot.targetId)
      const occurredAt = new Date()
      await tx
        .update(inquiryTargetSnapshots)
        .set({ removedAt: occurredAt, removedByActorId: actorId })
        .where(eq(inquiryTargetSnapshots.linkId, targetLinkId))
      await testHooks?.beforeOutbox?.(tx)
      await writeInquiryEvent(tx, INQUIRY_TARGET_REMOVED_EVENT, {
        id: inquiryId,
        actorId,
        linkId: snapshot.linkId,
        kind: snapshot.kind,
        targetId: snapshot.targetId,
        occurredAt: occurredAt.toISOString(),
      })
    })
  },

  async listInquiries(
    db: PostgresJsDatabase,
    query: InquiryListQueryInput,
    currentUserId?: string,
  ) {
    const conditions = []
    const actionable = notInArray(inquiries.status, ["converted", "closed"])
    const view = query.view ?? "actionable"
    if (view === "actionable") conditions.push(actionable)
    if (view === "new") conditions.push(eq(inquiries.status, "new"))
    if (view === "mine") {
      if (!currentUserId) {
        throw new InquiryServiceError(
          "INQUIRY_CUSTOMER_REQUIRED",
          "The mine view requires a current staff user",
        )
      }
      conditions.push(eq(inquiries.ownerId, currentUserId))
    }
    if (view === "unassigned") conditions.push(isNull(inquiries.ownerId), actionable)
    if (view === "overdue") {
      conditions.push(
        isNotNull(inquiries.nextActionAt),
        lt(inquiries.nextActionAt, new Date()),
        actionable,
      )
    }
    if (view === "waiting") conditions.push(eq(inquiries.status, "waiting_on_customer"))
    if (view === "qualified") conditions.push(eq(inquiries.status, "qualified"))
    if (view === "converted") conditions.push(eq(inquiries.status, "converted"))
    if (view === "closed") conditions.push(eq(inquiries.status, "closed"))
    if (query.status) conditions.push(eq(inquiries.status, query.status))
    if (query.ownerId) conditions.push(eq(inquiries.ownerId, query.ownerId))
    if (query.teamId) conditions.push(eq(inquiries.teamId, query.teamId))
    if (query.priority) conditions.push(eq(inquiries.priority, query.priority))
    if (query.kind) conditions.push(eq(inquiries.kind, query.kind))
    if (query.source) conditions.push(eq(inquiries.source, query.source))
    if (query.personId) conditions.push(eq(inquiries.personId, query.personId))
    if (query.organizationId) conditions.push(eq(inquiries.organizationId, query.organizationId))
    if (query.overdue) {
      conditions.push(
        and(isNotNull(inquiries.nextActionAt), lt(inquiries.nextActionAt, new Date()), actionable),
      )
    }
    if (query.search) {
      const term = `%${query.search}%`
      conditions.push(
        or(
          ilike(inquiries.subject, term),
          ilike(inquiries.customerMessage, term),
          ilike(inquiries.internalSummary, term),
          sql`${inquiries.contactSnapshot}::text ilike ${term}`,
        ),
      )
    }

    const where = conditions.length ? and(...conditions) : undefined
    const priorityOrder = sql`case ${inquiries.priority}
      when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`
    const overdueOrder = sql`case
      when ${inquiries.nextActionAt} is not null and ${inquiries.nextActionAt} < now() then 0 else 1 end`
    return paginate(
      db
        .select()
        .from(inquiries)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(
          asc(overdueOrder),
          asc(priorityOrder),
          asc(inquiries.createdAt),
          asc(inquiries.id),
        ),
      db.select({ count: sql<number>`count(*)::int` }).from(inquiries).where(where),
      query.limit,
      query.offset,
    )
  },

  async getInquiry(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1)
    return row ?? null
  },

  async recordInquiryActivity(
    db: PostgresJsDatabase,
    id: string,
    input: RecordInquiryActivityInput,
    actorId: string,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      const inquiry = await lockedInquiry(tx, id)
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date()
      const meaningfulOutbound = input.communicationDirection === "outbound"
      const customFields = input.communicationDirection
        ? {
            relationships: {
              inquiryCommunication: { direction: input.communicationDirection },
            },
          }
        : { relationships: { inquiryActivity: { visibility: "internal" } } }
      const [activity] = await tx
        .insert(activities)
        .values({
          subject: input.subject,
          type: input.type,
          ownerId: actorId,
          status: "done",
          completedAt: occurredAt,
          description: input.description ?? null,
          customFields,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        })
        .returning()
      if (!activity) throw new Error("Inquiry activity could not be created")
      await tx.insert(activityLinks).values({
        activityId: activity.id,
        entityType: "inquiry",
        entityId: id,
        role: "primary",
      })
      const firstResponseStamped = meaningfulOutbound && inquiry.firstRespondedAt === null
      if (meaningfulOutbound) await recordFirstResponseInTransaction(tx, id, actorId)
      const occurredAtIso = occurredAt.toISOString()
      const [updatedInquiry] = await tx
        .update(inquiries)
        .set({
          lastActivityAt: sql`greatest(coalesce(${inquiries.lastActivityAt}, ${occurredAtIso}::timestamptz), ${occurredAtIso}::timestamptz)`,
          updatedAt: new Date(),
        })
        .where(eq(inquiries.id, id))
        .returning({
          id: inquiries.id,
          firstRespondedAt: inquiries.firstRespondedAt,
          lastActivityAt: inquiries.lastActivityAt,
        })
      if (!updatedInquiry) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
      await writeInquiryEvent(tx, INQUIRY_UPDATED_EVENT, { id, actorId })
      return { data: activity, inquiry: updatedInquiry, firstResponseStamped }
    })
  },

  async createInquiry(
    db: PostgresJsDatabase,
    input: CreateInquiryInput,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      await assertRelatedRecords(tx, input)
      const { nextActionAt, ...values } = input
      const createdAt = new Date()
      const firstResponseDueAt = firstResponseDueAtForInquiry({
        source: input.source,
        priority: input.priority ?? "normal",
        createdAt,
        policy: testHooks?.slaPolicy,
      })
      const [created] = await tx
        .insert(inquiries)
        .values({
          ...values,
          ...updateDates({ nextActionAt }),
          createdAt,
          firstResponseDueAt,
          personId: input.personId ?? null,
          organizationId: input.organizationId ?? null,
          ownerId: input.ownerId ?? null,
          teamId: input.teamId ?? null,
          unassignedReason: input.ownerId ? null : (input.unassignedReason ?? null),
        })
        .onConflictDoNothing({
          target: [inquiries.source, inquiries.sourceRef],
          where: sql`${inquiries.sourceRef} is not null`,
        })
        .returning()
      if (created) {
        await testHooks?.beforeOutbox?.(tx)
        await writeInquiryEvent(
          tx,
          INQUIRY_CREATED_EVENT,
          { id: created.id, actorId },
          inquiryCreatedEventId(created.id),
        )
        return { inquiry: created, replayed: false as const }
      }
      if (!input.sourceRef) throw new Error("Inquiry insert returned no row")
      const [replayed] = await tx
        .select()
        .from(inquiries)
        .where(and(eq(inquiries.source, input.source), eq(inquiries.sourceRef, input.sourceRef)))
        .limit(1)
      if (!replayed) throw new Error("Inquiry idempotency replay returned no row")
      return { inquiry: replayed, replayed: true as const }
    })
  },

  async updateInquiry(
    db: PostgresJsDatabase,
    id: string,
    input: UpdateInquiryInput,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      const current = await lockedInquiry(tx, id)
      if (current.status === "closed" || current.status === "converted") {
        throw new InquiryServiceError(
          "INQUIRY_ALREADY_RESOLVED",
          "A resolved inquiry cannot be edited",
        )
      }
      await assertRelatedRecords(tx, input)
      const personId = input.personId === undefined ? current.personId : input.personId
      const organizationId =
        input.organizationId === undefined ? current.organizationId : input.organizationId
      if (current.status === "qualified" && !personId && !organizationId) {
        throw new InquiryServiceError(
          "INQUIRY_CUSTOMER_REQUIRED",
          "A qualified inquiry must retain a Person or Organization",
        )
      }
      const { nextActionAt, ...values } = input
      const now = new Date()
      const [row] = await tx
        .update(inquiries)
        .set({ ...values, ...updateDates({ nextActionAt }), updatedAt: now })
        .where(eq(inquiries.id, id))
        .returning()
      if (!row) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
      await testHooks?.beforeOutbox?.(tx)
      await writeInquiryEvent(tx, INQUIRY_UPDATED_EVENT, { id: row.id, actorId })
      return row
    })
  },

  /** Record the first meaningful outbound response exactly once using server time. */
  async recordFirstResponse(
    db: PostgresJsDatabase,
    id: string,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction((tx) => recordFirstResponseInTransaction(tx, id, actorId, testHooks))
  },

  async transitionInquiry(
    db: PostgresJsDatabase,
    id: string,
    input: TransitionInquiryInput,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      const current = await lockedInquiry(tx, id)
      if (!canTransitionInquiry(current.status, input.status)) {
        throw new InquiryServiceError(
          "INVALID_INQUIRY_TRANSITION",
          `Inquiry cannot transition from ${current.status} to ${input.status}`,
        )
      }
      const nextActionAt =
        input.nextActionAt === undefined ? current.nextActionAt : date(input.nextActionAt)
      const unassignedReason =
        input.unassignedReason === undefined ? current.unassignedReason : input.unassignedReason
      if (input.status === "triaged" && !current.ownerId && !unassignedReason) {
        throw new InquiryServiceError(
          "INQUIRY_ASSIGNMENT_REQUIRED",
          "Triage requires an owner or an unassigned reason",
        )
      }
      if (
        (input.status === "in_progress" || input.status === "waiting_on_customer") &&
        !nextActionAt &&
        !input.noFollowUpExpected
      ) {
        throw new InquiryServiceError(
          "INQUIRY_NEXT_ACTION_REQUIRED",
          "This status requires a next action or an explicit no-follow-up decision",
        )
      }
      if (input.status === "qualified" && !current.personId && !current.organizationId) {
        throw new InquiryServiceError(
          "INQUIRY_CUSTOMER_REQUIRED",
          "Qualification requires a Person or Organization",
        )
      }
      const now = new Date()
      const [row] = await tx
        .update(inquiries)
        .set({
          status: input.status,
          nextActionAt: input.noFollowUpExpected ? null : nextActionAt,
          unassignedReason,
          qualifiedAt: input.status === "qualified" ? now : current.qualifiedAt,
          updatedAt: now,
        })
        .where(eq(inquiries.id, id))
        .returning()
      if (!row) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
      await testHooks?.beforeOutbox?.(tx)
      await writeInquiryEvent(tx, INQUIRY_STATUS_CHANGED_EVENT, {
        id: row.id,
        actorId,
        from: current.status,
        to: row.status,
      })
      return row
    })
  },

  async assignInquiry(
    db: PostgresJsDatabase,
    id: string,
    input: AssignInquiryInput,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      const current = await lockedInquiry(tx, id)
      if (current.status === "closed" || current.status === "converted") {
        throw new InquiryServiceError(
          "INQUIRY_ALREADY_RESOLVED",
          "A resolved inquiry cannot be reassigned",
        )
      }
      const now = new Date()
      const [row] = await tx
        .update(inquiries)
        .set({
          ownerId: input.ownerId,
          teamId: input.teamId === undefined ? current.teamId : input.teamId,
          unassignedReason: input.ownerId ? null : input.unassignedReason,
          updatedAt: now,
        })
        .where(eq(inquiries.id, id))
        .returning()
      if (!row) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
      await testHooks?.beforeOutbox?.(tx)
      await writeInquiryEvent(tx, INQUIRY_ASSIGNED_EVENT, {
        id: row.id,
        actorId,
        ownerId: row.ownerId,
        teamId: row.teamId,
      })
      return row
    })
  },

  async closeInquiry(
    db: PostgresJsDatabase,
    id: string,
    input: CloseInquiryInput,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      let current: Inquiry | undefined
      let duplicate: Inquiry | undefined
      if (input.outcome === "duplicate") {
        const duplicateId = input.duplicateOfInquiryId ?? ""
        if (duplicateId === id) {
          throw new InquiryServiceError(
            "INVALID_DUPLICATE_INQUIRY",
            "An inquiry cannot duplicate itself",
          )
        }
        const rows = await tx
          .select()
          .from(inquiries)
          .where(inArray(inquiries.id, [id, duplicateId]))
          .orderBy(asc(inquiries.id))
          .for("update")
        current = rows.find((row) => row.id === id)
        duplicate = rows.find((row) => row.id === duplicateId)
        if (!current) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
        if (!duplicate) {
          throw new InquiryServiceError("INVALID_DUPLICATE_INQUIRY", "Duplicate inquiry not found")
        }
      } else {
        current = await lockedInquiry(tx, id)
      }
      if (current.status === "closed" || current.status === "converted") {
        throw new InquiryServiceError("INQUIRY_ALREADY_RESOLVED", "Inquiry is already resolved")
      }
      if (input.outcome === "duplicate") {
        if (duplicate?.duplicateOfInquiryId || duplicate?.closeOutcome === "duplicate") {
          throw new InquiryServiceError(
            "INVALID_DUPLICATE_INQUIRY",
            "A duplicate inquiry must point directly to a canonical inquiry",
          )
        }
      }
      const now = new Date()
      const [row] = await tx
        .update(inquiries)
        .set({
          status: "closed",
          closeOutcome: input.outcome,
          closeNote: input.note ?? null,
          duplicateOfInquiryId:
            input.outcome === "duplicate" ? (input.duplicateOfInquiryId ?? null) : null,
          closedAt: now,
          nextActionAt: null,
          updatedAt: now,
        })
        .where(eq(inquiries.id, id))
        .returning()
      if (!row) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
      await testHooks?.beforeOutbox?.(tx)
      await writeInquiryEvent(tx, INQUIRY_CLOSED_EVENT, {
        id: row.id,
        actorId,
        outcome: row.closeOutcome,
      })
      return row
    })
  },

  async reopenInquiry(
    db: PostgresJsDatabase,
    id: string,
    input: ReopenInquiryInput,
    actorId: string,
    testHooks?: InquiryMutationTestHooks,
  ) {
    requireActor(actorId)
    return db.transaction(async (tx) => {
      const current = await lockedInquiry(tx, id)
      if (current.status !== "closed") {
        throw new InquiryServiceError(
          "INVALID_INQUIRY_TRANSITION",
          "Only a closed inquiry can be reopened",
        )
      }
      const unassignedReason =
        input.unassignedReason === undefined ? current.unassignedReason : input.unassignedReason
      if (!current.ownerId && !unassignedReason) {
        throw new InquiryServiceError(
          "INQUIRY_ASSIGNMENT_REQUIRED",
          "Reopening to triage requires an owner or an unassigned reason",
        )
      }
      const now = new Date()
      const [row] = await tx
        .update(inquiries)
        .set({
          status: "triaged",
          closeOutcome: null,
          closeNote: null,
          duplicateOfInquiryId: null,
          closedAt: null,
          nextActionAt: date(input.nextActionAt),
          unassignedReason,
          updatedAt: now,
        })
        .where(eq(inquiries.id, id))
        .returning()
      if (!row) throw new InquiryServiceError("INQUIRY_NOT_FOUND", "Inquiry not found")
      await testHooks?.beforeOutbox?.(tx)
      await writeInquiryEvent(tx, INQUIRY_REOPENED_EVENT, { id: row.id, actorId })
      return row
    })
  },
}
