import type {
  LegacyBookingInquiryReadRuntime,
  LegacyBookingInquiryRecord,
} from "@voyant-travel/bookings/legacy-inquiry-read-runtime-port"
import { createLinkService } from "@voyant-travel/db/links"
import type { InquiryTargetAuthorityRuntime } from "@voyant-travel/relationships-contracts/inquiry-target-authority/runtime-port"
import { and, asc, count, eq, gt, inArray, max } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { LegacyInquiryCutoverProgress } from "./legacy-inquiry-cutover-job-runtime-port.js"
import {
  customerSignals,
  inquiries,
  inquiryConversions,
  inquiryLegacyCutoverCursors,
  inquiryLegacySources,
  inquiryTargetSnapshots,
  people,
} from "./schema.js"
import { inquiryOptionUnitLink, inquiryProductLink } from "./standard-links.js"

const BOOKING_SOURCE = "booking_inquiries"
const SIGNAL_SOURCE = "customer_signals"
const BATCH_SIZE = 100

function bookingSnapshot(row: LegacyBookingInquiryRecord): Record<string, unknown> {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}

function signalSnapshot(row: typeof customerSignals.$inferSelect): Record<string, unknown> {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    followUpAt: row.followUpAt?.toISOString() ?? null,
  }
}

function signalLifecycle(row: typeof customerSignals.$inferSelect) {
  if (row.status === "contacted") {
    return { status: "in_progress" as const, firstRespondedAt: row.updatedAt }
  }
  if (row.status === "qualified") {
    return {
      status: "qualified" as const,
      firstRespondedAt: row.updatedAt,
      qualifiedAt: row.updatedAt,
    }
  }
  if (row.status === "converted" && row.resolvedBookingId) {
    return {
      status: "converted" as const,
      firstRespondedAt: row.updatedAt,
      qualifiedAt: row.updatedAt,
      convertedAt: row.updatedAt,
    }
  }
  if (row.status === "converted") {
    return {
      status: "qualified" as const,
      firstRespondedAt: row.updatedAt,
      qualifiedAt: row.updatedAt,
    }
  }
  if (row.status === "lost") {
    return {
      status: "closed" as const,
      closeOutcome: "lost" as const,
      closedAt: row.updatedAt,
    }
  }
  if (row.status === "expired") {
    return {
      status: "closed" as const,
      closeOutcome: "no_response" as const,
      closedAt: row.updatedAt,
    }
  }
  return { status: "new" as const }
}

function signalConsentSnapshot(metadata: Record<string, unknown> | null) {
  const consent = metadata?.consent
  return consent && typeof consent === "object" && !Array.isArray(consent)
    ? (consent as Record<string, unknown>)
    : null
}

async function ensureTarget(
  db: PostgresJsDatabase,
  authorities: readonly InquiryTargetAuthorityRuntime[],
  input: { inquiryId: string; kind: "product" | "option_unit"; targetId: string },
) {
  const matches = authorities.filter((authority) => authority.kind === input.kind)
  const authority = matches[0]
  if (matches.length !== 1 || !authority?.resolveSnapshot) {
    return { inserted: 0, issue: `${input.kind}:${input.targetId}:authority_unavailable` }
  }
  const snapshot = await authority.resolveSnapshot(db, input.targetId)
  if (!snapshot) return { inserted: 0, issue: `${input.kind}:${input.targetId}:not_found` }
  const definition = input.kind === "product" ? inquiryProductLink : inquiryOptionUnitLink
  const link = createLinkService(() => db, [inquiryProductLink, inquiryOptionUnitLink])
  const linked = await link.create(definition.tableName, input.inquiryId, input.targetId)
  const [stored] = await db
    .insert(inquiryTargetSnapshots)
    .values({ linkId: linked.id, ...input, snapshot })
    .onConflictDoNothing()
    .returning({ id: inquiryTargetSnapshots.linkId })
  return { inserted: stored ? 1 : 0 }
}

async function recordReconciliation(
  db: PostgresJsDatabase,
  sourceTable: string,
  sourceId: string,
  issues: string[],
) {
  await db
    .update(inquiryLegacySources)
    .set({
      reconciliationStatus: issues.length ? "pending" : "complete",
      reconciliationIssues: issues,
      reconciledAt: issues.length ? null : new Date(),
    })
    .where(
      and(
        eq(inquiryLegacySources.sourceTable, sourceTable),
        eq(inquiryLegacySources.sourceId, sourceId),
      ),
    )
}

async function reconcileTargets(
  db: PostgresJsDatabase,
  authorities: readonly InquiryTargetAuthorityRuntime[],
  input: {
    sourceTable: string
    sourceId: string
    inquiryId: string
    productId?: string | null
    optionUnitId?: string | null
    extraIssues?: string[]
  },
) {
  let inserted = 0
  const issues = [...(input.extraIssues ?? [])]
  for (const target of [
    ...(input.productId ? [{ kind: "product" as const, targetId: input.productId }] : []),
    ...(input.optionUnitId ? [{ kind: "option_unit" as const, targetId: input.optionUnitId }] : []),
  ]) {
    const result = await ensureTarget(db, authorities, { inquiryId: input.inquiryId, ...target })
    inserted += result.inserted
    if (result.issue) issues.push(result.issue)
  }
  await recordReconciliation(db, input.sourceTable, input.sourceId, issues)
  return { inserted, unresolved: issues.length }
}

export async function adoptLegacyBookingInquiry(
  db: PostgresJsDatabase,
  authorities: readonly InquiryTargetAuthorityRuntime[],
  row: LegacyBookingInquiryRecord,
) {
  return db.transaction(async (tx) => {
    const sourceRef = `legacy:booking_inquiries:${row.id}`
    const name = [row.contactFirstName, row.contactLastName].filter(Boolean).join(" ") || undefined
    const [created] = await tx
      .insert(inquiries)
      .values({
        subject: row.message.trim().slice(0, 300) || "Product inquiry",
        kind: "product",
        status: row.status === "closed" ? "closed" : "new",
        closeOutcome: row.status === "closed" ? "other" : null,
        closeNote:
          row.status === "closed"
            ? "Legacy Booking Inquiry was closed before canonical Inquiry cutover."
            : null,
        priority: "normal",
        contactSnapshot: {
          ...(name ? { name } : {}),
          ...(row.contactEmail ? { email: row.contactEmail } : {}),
          ...(row.contactPhone ? { phone: row.contactPhone } : {}),
        },
        customerMessage: row.message,
        internalSummary: row.message,
        source: "import",
        sourceRef,
        locale: row.locale,
        customFields: {
          relationships: {
            legacySourceTable: BOOKING_SOURCE,
            legacySourceId: row.id,
            legacyChannelId: row.channelId,
            legacyIdempotencyKey: row.idempotencyKey,
            legacyRequestFingerprint: row.requestFingerprint,
            legacyProductId: row.productId,
            legacyDepartureId: row.departureId,
          },
        },
        lastActivityAt: row.updatedAt,
        closedAt: row.status === "closed" ? row.updatedAt : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
      .onConflictDoNothing()
      .returning({ id: inquiries.id })
    const inquiry =
      created ??
      (
        await tx
          .select({ id: inquiries.id })
          .from(inquiries)
          .where(and(eq(inquiries.source, "import"), eq(inquiries.sourceRef, sourceRef)))
          .limit(1)
      )[0]
    if (!inquiry) throw new Error(`Could not adopt legacy Booking Inquiry ${row.id}`)
    const [provenance] = await tx
      .insert(inquiryLegacySources)
      .values({
        sourceTable: BOOKING_SOURCE,
        sourceId: row.id,
        inquiryId: inquiry.id,
        sourceSnapshot: bookingSnapshot(row),
      })
      .onConflictDoNothing()
      .returning({ inquiryId: inquiryLegacySources.inquiryId })
    const inquiryId =
      provenance?.inquiryId ??
      (
        await tx
          .select({ inquiryId: inquiryLegacySources.inquiryId })
          .from(inquiryLegacySources)
          .where(
            and(
              eq(inquiryLegacySources.sourceTable, BOOKING_SOURCE),
              eq(inquiryLegacySources.sourceId, row.id),
            ),
          )
          .limit(1)
      )[0]?.inquiryId
    if (!inquiryId) throw new Error(`Missing provenance for Booking Inquiry ${row.id}`)
    const reconciliation = await reconcileTargets(tx, authorities, {
      sourceTable: BOOKING_SOURCE,
      sourceId: row.id,
      inquiryId,
      productId: row.productId,
      optionUnitId: row.departureId,
    })
    return {
      migrated: provenance ? 1 : 0,
      replayed: provenance ? 0 : 1,
      ...reconciliation,
    }
  })
}

async function ensureSignalBookingConversion(
  db: PostgresJsDatabase,
  input: {
    inquiryId: string
    signalId: string
    bookingId: string | null
  },
) {
  if (!input.bookingId) return 0
  const [created] = await db
    .insert(inquiryConversions)
    .values({
      inquiryId: input.inquiryId,
      kind: "booking",
      targetId: input.bookingId,
      targetSnapshot: {
        kind: "booking",
        legacySourceTable: SIGNAL_SOURCE,
        legacySourceId: input.signalId,
      },
      idempotencyKey: `legacy:${SIGNAL_SOURCE}:${input.signalId}`,
      mode: "attached_existing",
      actorId: "system:legacy-inquiry-cutover",
      inquiryStatus: "converted",
    })
    .onConflictDoNothing()
    .returning({ id: inquiryConversions.id })
  return created ? 1 : 0
}

async function adoptSignalRow(
  db: PostgresJsDatabase,
  authorities: readonly InquiryTargetAuthorityRuntime[],
  row: typeof customerSignals.$inferSelect,
  person: typeof people.$inferSelect,
) {
  return db.transaction(async (tx) => {
    const sourceRef = `legacy:${SIGNAL_SOURCE}:${row.id}`
    const lifecycle = signalLifecycle(row)
    const [created] = await tx
      .insert(inquiries)
      .values({
        subject:
          row.notes?.trim().slice(0, 300) ||
          `${person.firstName} ${person.lastName}`.trim().slice(0, 300),
        kind: row.productId ? "product" : row.kind === "request_offer" ? "custom_trip" : "general",
        ...lifecycle,
        priority: row.priority,
        personId: row.personId,
        organizationId: person.organizationId,
        contactSnapshot: { name: `${person.firstName} ${person.lastName}`.trim() },
        ownerId: row.assignedToUserId,
        nextActionAt: row.followUpAt,
        customerMessage: row.notes,
        internalSummary: row.notes,
        source: "import",
        sourceRef,
        consentSnapshot: signalConsentSnapshot(row.metadata),
        tags: row.tags,
        customFields: {
          relationships: {
            legacySourceTable: SIGNAL_SOURCE,
            legacySourceId: row.id,
            legacySignalKind: row.kind,
            legacySignalSource: row.source,
            legacySubmissionId: row.sourceSubmissionId,
            legacyMetadata: row.metadata,
            legacyProductId: row.productId,
            legacyOptionUnitId: row.optionUnitId,
            legacyResolvedBookingId: row.resolvedBookingId,
          },
        },
        lastActivityAt: row.updatedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
      .onConflictDoNothing()
      .returning({ id: inquiries.id })
    const inquiry =
      created ??
      (
        await tx
          .select({ id: inquiries.id })
          .from(inquiries)
          .where(and(eq(inquiries.source, "import"), eq(inquiries.sourceRef, sourceRef)))
          .limit(1)
      )[0]
    if (!inquiry) throw new Error(`Could not adopt legacy Customer Signal ${row.id}`)
    const [provenance] = await tx
      .insert(inquiryLegacySources)
      .values({
        sourceTable: SIGNAL_SOURCE,
        sourceId: row.id,
        inquiryId: inquiry.id,
        sourceSnapshot: signalSnapshot(row),
      })
      .onConflictDoNothing()
      .returning({ inquiryId: inquiryLegacySources.inquiryId })
    const inquiryId =
      provenance?.inquiryId ??
      (
        await tx
          .select({ inquiryId: inquiryLegacySources.inquiryId })
          .from(inquiryLegacySources)
          .where(
            and(
              eq(inquiryLegacySources.sourceTable, SIGNAL_SOURCE),
              eq(inquiryLegacySources.sourceId, row.id),
            ),
          )
          .limit(1)
      )[0]?.inquiryId
    if (!inquiryId) throw new Error(`Missing provenance for Customer Signal ${row.id}`)
    const reconciliation = await reconcileTargets(tx, authorities, {
      sourceTable: SIGNAL_SOURCE,
      sourceId: row.id,
      inquiryId,
      productId: row.productId,
      optionUnitId: row.optionUnitId,
      extraIssues:
        row.status === "converted" && !row.resolvedBookingId
          ? ["booking_conversion:missing_booking_id"]
          : [],
    })
    const conversionInserted = await ensureSignalBookingConversion(tx, {
      inquiryId,
      signalId: row.id,
      bookingId: row.status === "converted" ? row.resolvedBookingId : null,
    })
    return {
      migrated: provenance ? 1 : 0,
      replayed: provenance ? 0 : 1,
      conversionInserted,
      ...reconciliation,
    }
  })
}

async function retryPendingSignals(
  db: PostgresJsDatabase,
  authorities: readonly InquiryTargetAuthorityRuntime[],
  limit: number,
) {
  const pending = await db
    .select({ sourceId: inquiryLegacySources.sourceId, inquiryId: inquiryLegacySources.inquiryId })
    .from(inquiryLegacySources)
    .where(
      and(
        eq(inquiryLegacySources.sourceTable, SIGNAL_SOURCE),
        eq(inquiryLegacySources.reconciliationStatus, "pending"),
      ),
    )
    .orderBy(asc(inquiryLegacySources.sourceId))
    .limit(limit)
  const sourceRows = pending.length
    ? await db
        .select()
        .from(customerSignals)
        .where(
          inArray(
            customerSignals.id,
            pending.map((row) => row.sourceId),
          ),
        )
    : []
  const byId = new Map(sourceRows.map((row) => [row.id, row]))
  let inserted = 0
  let conversions = 0
  let unresolved = 0
  for (const source of pending) {
    const row = byId.get(source.sourceId)
    if (!row) {
      await recordReconciliation(db, SIGNAL_SOURCE, source.sourceId, ["legacy_source_missing"])
      unresolved += 1
      continue
    }
    const result = await db.transaction(async (tx) => {
      const reconciliation = await reconcileTargets(tx, authorities, {
        sourceTable: SIGNAL_SOURCE,
        sourceId: row.id,
        inquiryId: source.inquiryId,
        productId: row.productId,
        optionUnitId: row.optionUnitId,
        extraIssues:
          row.status === "converted" && !row.resolvedBookingId
            ? ["booking_conversion:missing_booking_id"]
            : [],
      })
      const conversionInserted = await ensureSignalBookingConversion(tx, {
        inquiryId: source.inquiryId,
        signalId: row.id,
        bookingId: row.status === "converted" ? row.resolvedBookingId : null,
      })
      return { ...reconciliation, conversionInserted }
    })
    inserted += result.inserted
    conversions += result.conversionInserted
    unresolved += result.unresolved
  }
  return { scanned: pending.length, inserted, conversions, unresolved }
}

async function retryPendingBookings(
  db: PostgresJsDatabase,
  reader: LegacyBookingInquiryReadRuntime,
  authorities: readonly InquiryTargetAuthorityRuntime[],
  limit: number,
) {
  const pending = await db
    .select({ sourceId: inquiryLegacySources.sourceId, inquiryId: inquiryLegacySources.inquiryId })
    .from(inquiryLegacySources)
    .where(
      and(
        eq(inquiryLegacySources.sourceTable, BOOKING_SOURCE),
        eq(inquiryLegacySources.reconciliationStatus, "pending"),
      ),
    )
    .orderBy(asc(inquiryLegacySources.sourceId))
    .limit(limit)
  const sourceRows = await reader.getByIds(
    db,
    pending.map((row) => row.sourceId),
  )
  const byId = new Map(sourceRows.map((row) => [row.id, row]))
  let inserted = 0
  let unresolved = 0
  for (const source of pending) {
    const row = byId.get(source.sourceId)
    if (!row) {
      await recordReconciliation(db, BOOKING_SOURCE, source.sourceId, ["legacy_source_missing"])
      unresolved += 1
      continue
    }
    const result = await db.transaction((tx) =>
      reconcileTargets(tx, authorities, {
        sourceTable: BOOKING_SOURCE,
        sourceId: row.id,
        inquiryId: source.inquiryId,
        productId: row.productId,
        optionUnitId: row.departureId,
      }),
    )
    inserted += result.inserted
    unresolved += result.unresolved
  }
  return { scanned: pending.length, inserted, unresolved }
}

async function adoptSignalBatch(
  db: PostgresJsDatabase,
  authorities: readonly InquiryTargetAuthorityRuntime[],
  limit: number,
) {
  const [cursor] = await db
    .select({ sourceId: max(inquiryLegacySources.sourceId) })
    .from(inquiryLegacySources)
    .where(eq(inquiryLegacySources.sourceTable, SIGNAL_SOURCE))
  const rows = await db
    .select()
    .from(customerSignals)
    .where(
      and(
        inArray(customerSignals.kind, ["inquiry", "request_offer"]),
        cursor?.sourceId ? gt(customerSignals.id, cursor.sourceId) : undefined,
      ),
    )
    .orderBy(asc(customerSignals.id))
    .limit(limit)
  const personRows = rows.length
    ? await db
        .select()
        .from(people)
        .where(
          inArray(
            people.id,
            rows.map((row) => row.personId),
          ),
        )
    : []
  const peopleById = new Map(personRows.map((person) => [person.id, person]))
  let migrated = 0
  let replayed = 0
  let inserted = 0
  let conversions = 0
  let unresolved = 0
  for (const row of rows) {
    const person = peopleById.get(row.personId)
    if (!person) throw new Error(`Missing Person ${row.personId} for Customer Signal ${row.id}`)
    const result = await adoptSignalRow(db, authorities, row, person)
    migrated += result.migrated
    replayed += result.replayed
    inserted += result.inserted
    conversions += result.conversionInserted
    unresolved += result.unresolved
  }
  return {
    scanned: rows.length,
    migrated,
    replayed,
    inserted,
    conversions,
    unresolved,
  }
}

/**
 * One bounded, resumable pass across both legacy stores. Pending provenance is
 * revisited before the high-water mark advances, so a provider that appears
 * later can finish target materialization without duplicating the Inquiry.
 */
export async function runLegacyInquiryCutoverBatch(input: {
  db: PostgresJsDatabase
  reader?: LegacyBookingInquiryReadRuntime
  authorities: readonly InquiryTargetAuthorityRuntime[]
  limit?: number
}): Promise<LegacyInquiryCutoverProgress> {
  const limit = Math.min(Math.max(input.limit ?? BATCH_SIZE, 1), BATCH_SIZE)
  const pendingSignals = await retryPendingSignals(input.db, input.authorities, limit)
  const bookings = input.reader
    ? await retryPendingBookings(input.db, input.reader, input.authorities, limit)
    : { scanned: 0, inserted: 0, unresolved: 0 }
  const adoptedSignals = await adoptSignalBatch(input.db, input.authorities, limit)
  let scanned = pendingSignals.scanned + adoptedSignals.scanned + bookings.scanned
  let migrated = adoptedSignals.migrated
  let replayed = adoptedSignals.replayed
  let targetsMaterialized = pendingSignals.inserted + adoptedSignals.inserted + bookings.inserted
  const conversionsMaterialized = pendingSignals.conversions + adoptedSignals.conversions
  let unresolvedTargets =
    pendingSignals.unresolved + adoptedSignals.unresolved + bookings.unresolved

  if (input.reader) {
    const [cursor] = await input.db
      .select({ sourceId: inquiryLegacyCutoverCursors.lastSourceId })
      .from(inquiryLegacyCutoverCursors)
      .where(eq(inquiryLegacyCutoverCursors.sourceTable, BOOKING_SOURCE))
    const rows = await input.reader.listBatch(input.db, {
      ...(cursor?.sourceId ? { afterId: cursor.sourceId } : {}),
      limit,
    })
    scanned += rows.length
    for (const row of rows) {
      const result = await adoptLegacyBookingInquiry(input.db, input.authorities, row)
      migrated += result.migrated
      replayed += result.replayed
      targetsMaterialized += result.inserted
      unresolvedTargets += result.unresolved
      await input.db
        .insert(inquiryLegacyCutoverCursors)
        .values({ sourceTable: BOOKING_SOURCE, lastSourceId: row.id, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: inquiryLegacyCutoverCursors.sourceTable,
          set: { lastSourceId: row.id, updatedAt: new Date() },
        })
    }
  }

  const [remaining] = await input.db
    .select({ count: count() })
    .from(inquiryLegacySources)
    .where(eq(inquiryLegacySources.reconciliationStatus, "pending"))
  return {
    scanned,
    migrated,
    replayed,
    targetsMaterialized,
    conversionsMaterialized,
    unresolvedTargets,
    remaining: Number(remaining?.count ?? 0),
  }
}

export async function countMigratedLegacyInquirySources(db: PostgresJsDatabase) {
  const rows = await db
    .select({ sourceTable: inquiryLegacySources.sourceTable, count: count() })
    .from(inquiryLegacySources)
    .groupBy(inquiryLegacySources.sourceTable)
    .orderBy(asc(inquiryLegacySources.sourceTable))
  return rows.map((row) => ({ sourceTable: row.sourceTable, count: Number(row.count) }))
}

export { legacyInquiryCutoverJobRuntimePort } from "./legacy-inquiry-cutover-job-runtime-port.js"
