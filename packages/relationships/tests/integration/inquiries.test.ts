import { appendActionLedgerMutation } from "@voyant-travel/action-ledger"
import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import { generateLinkTableSql } from "@voyant-travel/core"
import { createLinkService } from "@voyant-travel/db/links"
import { eventOutboxTable } from "@voyant-travel/db/schema"
import { mediaAsset } from "@voyant-travel/media/schema"
import { inquiryListQuerySchema } from "@voyant-travel/relationships-contracts"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  activities,
  activityLinks,
  inquiries,
  inquiryAttachmentSnapshots,
  inquiryConversions,
  inquiryTargetSnapshots,
  people,
} from "../../src/schema.js"
import { type InquiryServiceError, inquiriesService } from "../../src/service/inquiries.js"
import {
  inquiryMediaAssetLink,
  inquiryOptionUnitLink,
  inquiryProductLink,
} from "../../src/standard-links.js"

const inquiryLinks = [inquiryProductLink, inquiryOptionUnitLink, inquiryMediaAssetLink]

const validTargetValidation = {
  validateTarget: async () => "valid" as const,
}

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("inquiriesService", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test database follows existing integration fixture typing.
  let db: any

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
    for (const definition of inquiryLinks) {
      const ddl = generateLinkTableSql(definition)
      await db.execute(sql.raw(ddl.createTable))
      for (const index of ddl.indexes) await db.execute(sql.raw(index))
    }
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    for (const definition of inquiryLinks) {
      await db.execute(sql.raw(`DELETE FROM "${definition.tableName}"`))
    }
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  async function seedPerson() {
    const [person] = await db
      .insert(people)
      .values({ firstName: "Ari", lastName: "Traveler", tags: [], status: "active" })
      .returning()
    return person
  }

  it("creates and retrieves an unqualified custom inquiry", async () => {
    const { inquiry: created } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Custom Japan itinerary",
        kind: "custom_trip",
        priority: "normal",
        contactSnapshot: { email: "ari@example.com" },
        source: "phone",
        tags: [],
        customFields: {},
      },
      "user_1",
    )

    expect(created.id).toMatch(/^inq_/)
    expect(created.status).toBe("new")
    expect((await inquiriesService.getInquiry(db, created.id))?.subject).toBe(
      "Custom Japan itinerary",
    )
  })

  it("aborts a preparation on link failure and replays one claimed attachment", async () => {
    const abortPrivateDocument = vi.fn(async () => undefined)
    const finalizePrivateDocument = vi.fn(async () => undefined)
    const missingAuthority = {
      preparePrivateDocument: vi.fn(async () => ({
        id: "mast_missing",
        name: "brief.pdf",
        mimeType: "application/pdf",
        operationKey: "test_missing_operation",
        ownerToken: "test_missing_owner_token",
        created: true,
      })),
      finalizePrivateDocument,
      abortPrivateDocument,
      claimPrivateDocument: vi.fn(async () => undefined),
      claimExistingPrivateDocument: vi.fn(async () => undefined),
      releasePrivateDocument: vi.fn(async () => undefined),
      requestPrivateDocumentPurge: vi.fn(async () => undefined),
      resolvePrivateDocument: vi.fn(),
      downloadPrivateDocument: vi.fn(),
    }
    await expect(
      inquiriesService.uploadInquiryAttachment(
        db,
        "inq_missing",
        {
          operationKey: "test_missing_operation",
          name: "brief.pdf",
          mimeType: "application/pdf",
          caption: null,
          body: new ArrayBuffer(1),
        },
        "user_1",
        {},
        missingAuthority,
      ),
    ).rejects.toMatchObject({ code: "INQUIRY_NOT_FOUND" })
    expect(abortPrivateDocument).toHaveBeenCalledOnce()
    expect(finalizePrivateDocument).not.toHaveBeenCalled()

    const { inquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Attachment replay",
        kind: "general",
        contactSnapshot: { email: "attachments@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    const [asset] = await db
      .insert(mediaAsset)
      .values({
        type: "document",
        storageClass: "documents",
        name: "brief.pdf",
        storageKey: "private/brief.pdf",
        checksum: "attachment-replay-checksum",
      })
      .returning()
    if (!asset) throw new Error("Failed to seed private document")
    const authority = {
      ...missingAuthority,
      preparePrivateDocument: vi.fn(async () => ({
        id: asset.id,
        name: asset.name,
        mimeType: asset.mimeType,
        operationKey: "test_replay_operation",
        ownerToken: "test_replay_owner_token",
        created: false,
      })),
    }
    const input = {
      operationKey: "test_replay_operation",
      name: "brief.pdf",
      mimeType: "application/pdf",
      caption: "Customer brief",
      body: new ArrayBuffer(1),
    }
    const first = await inquiriesService.uploadInquiryAttachment(
      db,
      inquiry.id,
      input,
      "user_1",
      {},
      authority,
    )
    const replay = await inquiriesService.uploadInquiryAttachment(
      db,
      inquiry.id,
      input,
      "user_1",
      {},
      authority,
    )
    expect(replay).toEqual(first)
    expect(
      await db
        .select()
        .from(inquiryAttachmentSnapshots)
        .where(eq(inquiryAttachmentSnapshots.inquiryId, inquiry.id)),
    ).toHaveLength(1)

    const { inquiry: secondInquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Second attachment owner",
        kind: "general",
        contactSnapshot: { email: "second@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    const second = await inquiriesService.uploadInquiryAttachment(
      db,
      secondInquiry.id,
      { ...input, name: "second-customer-name.pdf", caption: "Second caption" },
      "user_1",
      {},
      authority,
    )
    expect(second).toMatchObject({
      assetId: asset.id,
      name: "second-customer-name.pdf",
      caption: "Second caption",
    })

    abortPrivateDocument.mockClear()
    authority.finalizePrivateDocument.mockRejectedValueOnce(new Error("finalize unavailable"))
    await expect(
      inquiriesService.uploadInquiryAttachment(db, inquiry.id, input, "user_1", {}, authority),
    ).rejects.toThrow("finalize unavailable")
    expect(abortPrivateDocument).not.toHaveBeenCalled()
    expect(
      await db
        .select()
        .from(inquiryAttachmentSnapshots)
        .where(eq(inquiryAttachmentSnapshots.inquiryId, inquiry.id)),
    ).toHaveLength(1)
  })

  it("exports attachment and activity PII, then erases it while retaining conversion provenance", async () => {
    const { inquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Private anniversary trip",
        kind: "custom_trip",
        contactSnapshot: { name: "Ari", email: "ari@example.com" },
        customerMessage: "Dietary details",
        travelBrief: { version: 1, accessibilityOrDietaryNotes: "Private note" },
        source: "admin",
        sourceRef: "private-customer-reference",
        locale: "ro-RO",
        unassignedReason: "Customer requested a specialist",
        tags: ["vip"],
        customFields: { relationships: { passportHint: "private" } },
      },
      "user_1",
    )
    const [conversion] = await db
      .insert(inquiryConversions)
      .values({
        inquiryId: inquiry.id,
        kind: "proposal",
        targetId: "prps_preserved",
        targetSnapshot: { kind: "proposal", pipelineId: "pipe_1", stageId: "stage_1" },
        idempotencyKey: "privacy-provenance",
        mode: "created",
        actorId: "user_1",
        inquiryStatus: "qualified",
      })
      .returning()
    await db
      .update(inquiries)
      .set({ closeNote: "Customer disclosed private circumstances" })
      .where(eq(inquiries.id, inquiry.id))
    const [activity] = await db
      .insert(activities)
      .values({
        subject: "Call with Ari",
        type: "call",
        status: "done",
        description: "Discussed dietary details",
        location: "Private address",
        customFields: { relationships: { privateNote: "sensitive" } },
      })
      .returning()
    if (!conversion || !activity) throw new Error("Failed to seed privacy provenance")
    await db.insert(activityLinks).values({
      activityId: activity.id,
      entityType: "inquiry",
      entityId: inquiry.id,
    })
    const [attachmentAsset] = await db
      .insert(mediaAsset)
      .values({
        type: "document",
        storageClass: "documents",
        name: "private-brief.pdf",
        storageKey: "private/private-brief.pdf",
        checksum: "privacy-attachment-checksum",
      })
      .returning()
    if (!attachmentAsset) throw new Error("Failed to seed attachment")
    const link = createLinkService(() => db, inquiryLinks)
    const attachmentLink = await link.create(
      inquiryMediaAssetLink.tableName,
      inquiry.id,
      attachmentAsset.id,
    )
    await db.insert(inquiryAttachmentSnapshots).values({
      linkId: attachmentLink.id,
      inquiryId: inquiry.id,
      assetId: attachmentAsset.id,
      name: attachmentAsset.name,
      mimeType: attachmentAsset.mimeType,
      caption: "Passport and dietary details",
      attachedBy: "user_1",
    })

    const exported = await inquiriesService.exportInquiryPrivacy(db, link, inquiry.id)
    expect(exported.activities).toEqual([
      expect.objectContaining({
        id: activity.id,
        subject: "Call with Ari",
        customFields: { relationships: { privateNote: "sensitive" } },
      }),
    ])
    expect(exported.inquiry.attachments).toEqual([
      expect.objectContaining({
        assetId: attachmentAsset.id,
        caption: "Passport and dietary details",
      }),
    ])

    const requestPrivateDocumentPurge = vi.fn(async () => undefined)
    await inquiriesService.eraseInquiryPrivacy(
      db,
      inquiry.id,
      { reasonCode: "data_subject_request" },
      "privacy_officer",
      {},
      {
        preparePrivateDocument: vi.fn(),
        finalizePrivateDocument: vi.fn(),
        abortPrivateDocument: vi.fn(),
        claimPrivateDocument: vi.fn(),
        claimExistingPrivateDocument: vi.fn(),
        releasePrivateDocument: vi.fn(),
        requestPrivateDocumentPurge,
        resolvePrivateDocument: vi.fn(),
        downloadPrivateDocument: vi.fn(),
      },
    )
    expect(requestPrivateDocumentPurge).toHaveBeenCalledWith(expect.anything(), attachmentAsset.id)
    expect(await inquiriesService.getInquiry(db, inquiry.id)).toMatchObject({
      sourceRef: null,
      locale: null,
      unassignedReason: null,
      closeNote: null,
      privacyErasureReason: "data_subject_request",
    })
    expect(
      await db
        .select({ subject: activities.subject, customFields: activities.customFields })
        .from(activities)
        .where(eq(activities.id, activity.id)),
    ).toEqual([{ subject: "Redacted inquiry activity", customFields: {} }])
    expect(
      await db
        .select({ id: inquiryConversions.id, targetId: inquiryConversions.targetId })
        .from(inquiryConversions)
        .where(eq(inquiryConversions.inquiryId, inquiry.id)),
    ).toEqual([{ id: conversion.id, targetId: "prps_preserved" }])
  })

  it("detaches a shared Activity without redacting data owned by its Person link", async () => {
    const person = await seedPerson()
    const { inquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Shared activity privacy",
        kind: "general",
        contactSnapshot: { email: "shared@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    const [activity] = await db
      .insert(activities)
      .values({
        subject: "Person-owned consultation",
        type: "call",
        status: "done",
        description: "Text that belongs to the Person timeline",
        customFields: { relationships: { personContext: "preserve" } },
      })
      .returning()
    if (!activity) throw new Error("Failed to seed shared Activity")
    await db.insert(activityLinks).values([
      { activityId: activity.id, entityType: "inquiry", entityId: inquiry.id },
      { activityId: activity.id, entityType: "person", entityId: person.id },
    ])

    await inquiriesService.eraseInquiryPrivacy(
      db,
      inquiry.id,
      { reasonCode: "data_subject_request" },
      "privacy_officer",
      {},
      {
        preparePrivateDocument: vi.fn(),
        finalizePrivateDocument: vi.fn(),
        abortPrivateDocument: vi.fn(),
        claimPrivateDocument: vi.fn(),
        claimExistingPrivateDocument: vi.fn(),
        releasePrivateDocument: vi.fn(),
        requestPrivateDocumentPurge: vi.fn(),
        resolvePrivateDocument: vi.fn(),
        downloadPrivateDocument: vi.fn(),
      },
    )

    expect(await db.select().from(activities).where(eq(activities.id, activity.id))).toEqual([
      expect.objectContaining({
        subject: "Person-owned consultation",
        description: "Text that belongs to the Person timeline",
        customFields: { relationships: { personContext: "preserve" } },
      }),
    ])
    expect(
      await db
        .select({ entityType: activityLinks.entityType, entityId: activityLinks.entityId })
        .from(activityLinks)
        .where(eq(activityLinks.activityId, activity.id)),
    ).toEqual([{ entityType: "person", entityId: person.id }])
  })

  it("rolls privacy erasure back when its Action Ledger append fails and retries atomically", async () => {
    const { inquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Atomic privacy erasure",
        kind: "general",
        contactSnapshot: { email: "atomic@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    const authority = {
      preparePrivateDocument: vi.fn(),
      finalizePrivateDocument: vi.fn(),
      abortPrivateDocument: vi.fn(),
      claimPrivateDocument: vi.fn(),
      claimExistingPrivateDocument: vi.fn(),
      releasePrivateDocument: vi.fn(),
      requestPrivateDocumentPurge: vi.fn(),
      resolvePrivateDocument: vi.fn(),
      downloadPrivateDocument: vi.fn(),
    }
    let failAfterAppend = true
    const appendAudit = async (tx: typeof db) => {
      await appendActionLedgerMutation(tx, {
        context: { userId: "privacy_officer" },
        actionName: "relationships.inquiry.privacy_erasure",
        actionKind: "delete",
        evaluatedRisk: "high",
        targetType: "inquiry",
        targetId: inquiry.id,
        mutationDetail: { summary: "Privacy erasure", reversalKind: "none" },
      })
      if (failAfterAppend) throw new Error("ledger unavailable")
    }

    await expect(
      inquiriesService.eraseInquiryPrivacy(
        db,
        inquiry.id,
        { reasonCode: "data_subject_request" },
        "privacy_officer",
        {},
        authority,
        appendAudit,
      ),
    ).rejects.toThrow("ledger unavailable")
    expect(await inquiriesService.getInquiry(db, inquiry.id)).toMatchObject({
      subject: "Atomic privacy erasure",
      privacyErasedAt: null,
    })
    expect(
      await db
        .select({ id: actionLedgerEntries.id })
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.targetId, inquiry.id)),
    ).toEqual([])

    failAfterAppend = false
    await inquiriesService.eraseInquiryPrivacy(
      db,
      inquiry.id,
      { reasonCode: "data_subject_request" },
      "privacy_officer",
      {},
      authority,
      appendAudit,
    )
    expect(await inquiriesService.getInquiry(db, inquiry.id)).toMatchObject({
      subject: "Redacted inquiry",
      privacyErasureReason: "data_subject_request",
    })
    expect(
      await db
        .select({ id: actionLedgerEntries.id })
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.targetId, inquiry.id)),
    ).toHaveLength(1)
  })

  it("records an owned chronological activity and advances last activity atomically", async () => {
    const { inquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Activity owner",
        kind: "general",
        contactSnapshot: { email: "activity@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    const first = await inquiriesService.recordInquiryActivity(
      db,
      inquiry.id,
      {
        subject: "Internal qualification note",
        type: "note",
        description: "Needs a private transfer",
        occurredAt: "2026-08-18T09:00:00.000Z",
      },
      "user_1",
    )
    expect(first.data).toMatchObject({
      subject: "Internal qualification note",
      status: "done",
      ownerId: "user_1",
    })
    expect(first.inquiry.lastActivityAt).toEqual(new Date("2026-08-18T09:00:00.000Z"))
    expect(first.inquiry.firstRespondedAt).toBeNull()
    expect(first.firstResponseStamped).toBe(false)
    expect(await db.select().from(activities)).toHaveLength(1)
    expect(await db.select().from(activityLinks)).toEqual([
      expect.objectContaining({
        activityId: first.data.id,
        entityType: "inquiry",
        entityId: inquiry.id,
        role: "primary",
      }),
    ])

    await inquiriesService.recordInquiryActivity(
      db,
      inquiry.id,
      {
        subject: "Older imported note",
        type: "note",
        occurredAt: "2026-08-17T09:00:00.000Z",
      },
      "user_1",
    )
    expect((await inquiriesService.getInquiry(db, inquiry.id))?.lastActivityAt).toEqual(
      new Date("2026-08-18T09:00:00.000Z"),
    )
  })

  it("stamps only the first outbound activity through the dedicated response event", async () => {
    const { inquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Outbound response",
        kind: "general",
        contactSnapshot: { email: "outbound@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    const first = await inquiriesService.recordInquiryActivity(
      db,
      inquiry.id,
      { subject: "Sent itinerary", type: "email", communicationDirection: "outbound" },
      "user_2",
    )
    const replay = await inquiriesService.recordInquiryActivity(
      db,
      inquiry.id,
      { subject: "Sent follow-up", type: "email", communicationDirection: "outbound" },
      "user_3",
    )
    expect(first.firstResponseStamped).toBe(true)
    expect(first.inquiry.firstRespondedAt).toBeInstanceOf(Date)
    expect(replay.firstResponseStamped).toBe(false)
    expect(replay.inquiry.firstRespondedAt).toEqual(first.inquiry.firstRespondedAt)
    const events = (await db.select().from(eventOutboxTable)).filter(
      ({ name, payload }: { name: string; payload: { id?: string } }) =>
        name === "inquiry.first_response_recorded" && payload.id === inquiry.id,
    )
    expect(events).toHaveLength(1)
    expect(events[0]?.payload).toMatchObject({ id: inquiry.id, actorId: "user_2" })
    const updatedEvents = (await db.select().from(eventOutboxTable)).filter(
      ({ name, payload }: { name: string; payload: { id?: string } }) =>
        name === "inquiry.updated" && payload.id === inquiry.id,
    )
    expect(updatedEvents.map(({ payload }: { payload: unknown }) => payload)).toEqual([
      { id: inquiry.id, actorId: "user_2" },
      { id: inquiry.id, actorId: "user_3" },
    ])
  })

  it("rolls back neutral target links with snapshot and outbox failures", async () => {
    const { inquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Atomic product target",
        kind: "product",
        contactSnapshot: { email: "ari@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    const link = createLinkService(() => db, [inquiryProductLink, inquiryOptionUnitLink])
    const input = {
      kind: "product" as const,
      targetId: "prod_atomic",
      snapshot: { title: "Atomic product" },
    }

    await expect(
      inquiriesService.addInquiryTarget(db, inquiry.id, input, "user_1", validTargetValidation, {
        beforeOutbox: async () => {
          throw new Error("rollback target")
        },
      }),
    ).rejects.toThrow("rollback target")
    expect(await link.list(inquiryProductLink.tableName, { leftId: inquiry.id })).toEqual([])
    expect(
      await db
        .select()
        .from(inquiryTargetSnapshots)
        .where(eq(inquiryTargetSnapshots.inquiryId, inquiry.id)),
    ).toEqual([])

    const added = await inquiriesService.addInquiryTarget(
      db,
      inquiry.id,
      input,
      "user_1",
      validTargetValidation,
    )
    await expect(
      inquiriesService.deleteInquiryTarget(db, inquiry.id, added.linkId, "user_1", {
        beforeOutbox: async () => {
          throw new Error("rollback removal")
        },
      }),
    ).rejects.toThrow("rollback removal")
    expect(await link.list(inquiryProductLink.tableName, { leftId: inquiry.id })).toHaveLength(1)
    expect(
      await db
        .select()
        .from(inquiryTargetSnapshots)
        .where(eq(inquiryTargetSnapshots.linkId, added.linkId)),
    ).toHaveLength(1)
    const targetEvents = await db
      .select()
      .from(eventOutboxTable)
      .where(eq(eventOutboxTable.name, "inquiry.target_added"))
    expect(targetEvents).toHaveLength(1)
    expect(targetEvents[0]?.payload).toMatchObject({
      actorId: "user_1",
      linkId: added.linkId,
      kind: "product",
      targetId: "prod_atomic",
      occurredAt: expect.stringMatching(/^2026-|^20\d\d-/),
    })
    const replayed = await inquiriesService.addInquiryTarget(
      db,
      inquiry.id,
      input,
      "user_2",
      validTargetValidation,
    )
    expect(replayed).toEqual(added)
    expect(
      await db
        .select()
        .from(eventOutboxTable)
        .where(eq(eventOutboxTable.name, "inquiry.target_added")),
    ).toHaveLength(1)

    await inquiriesService.deleteInquiryTarget(db, inquiry.id, added.linkId, "user_2")
    expect(await link.list(inquiryProductLink.tableName, { leftId: inquiry.id })).toEqual([])
    expect(await inquiriesService.listInquiryTargets(db, link, inquiry.id)).toEqual([])
    const [tombstone] = await db
      .select()
      .from(inquiryTargetSnapshots)
      .where(eq(inquiryTargetSnapshots.linkId, added.linkId))
    expect(tombstone).toMatchObject({
      linkId: added.linkId,
      snapshot: { title: "Atomic product" },
      removedByActorId: "user_2",
    })
    expect(tombstone?.removedAt).toBeInstanceOf(Date)

    const restored = await inquiriesService.addInquiryTarget(
      db,
      inquiry.id,
      { ...input, snapshot: { title: "Changed product title" } },
      "user_3",
      validTargetValidation,
    )
    expect(restored).toEqual(added)
    expect(await link.list(inquiryProductLink.tableName, { leftId: inquiry.id })).toMatchObject([
      { id: added.linkId },
    ])
    expect(await inquiriesService.listInquiryTargets(db, link, inquiry.id)).toEqual([added])
    const [restoredSnapshot] = await db
      .select()
      .from(inquiryTargetSnapshots)
      .where(eq(inquiryTargetSnapshots.linkId, added.linkId))
    expect(restoredSnapshot).toMatchObject({
      linkId: added.linkId,
      snapshot: { title: "Atomic product" },
      removedAt: null,
      removedByActorId: null,
    })
    const targetLifecycleEvents = (await db.select().from(eventOutboxTable)).filter((event) =>
      event.name.startsWith("inquiry.target_"),
    )
    const addedEvents = targetLifecycleEvents.filter(
      (event) => event.name === "inquiry.target_added",
    )
    const removedEvents = targetLifecycleEvents.filter(
      (event) => event.name === "inquiry.target_removed",
    )
    expect(addedEvents).toHaveLength(2)
    expect(removedEvents).toHaveLength(1)
    expect(addedEvents.map((event) => event.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actorId: "user_1", linkId: added.linkId }),
        expect.objectContaining({ actorId: "user_3", linkId: added.linkId }),
      ]),
    )
    expect(removedEvents[0]?.payload).toMatchObject({
      actorId: "user_2",
      linkId: added.linkId,
    })
  })

  it("refuses target removal after conversion provenance references its immutable snapshot", async () => {
    const { inquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Converted target provenance",
        kind: "product",
        contactSnapshot: { email: "provenance@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    const link = createLinkService(() => db, [inquiryProductLink, inquiryOptionUnitLink])
    const target = await inquiriesService.addInquiryTarget(
      db,
      inquiry.id,
      {
        kind: "product",
        targetId: "prod_provenance",
        snapshot: { title: "Immutable product title" },
      },
      "user_1",
      validTargetValidation,
    )
    await db.insert(inquiryConversions).values({
      inquiryId: inquiry.id,
      kind: "booking_session",
      targetId: "bks_provenance",
      targetSnapshot: {
        kind: "booking_session",
        targetLinkId: target.linkId,
        commandFingerprint: "fingerprint",
      },
      idempotencyKey: "provenance-test",
      mode: "created",
      actorId: "user_1",
      inquiryStatus: "converted",
    })

    await expect(
      inquiriesService.deleteInquiryTarget(db, inquiry.id, target.linkId, "user_2"),
    ).rejects.toMatchObject({ code: "INQUIRY_TARGET_IN_USE" })
    expect(await link.list(inquiryProductLink.tableName, { leftId: inquiry.id })).toHaveLength(1)
    expect(
      await inquiriesService.resolveInquiryTarget(db, link, inquiry.id, target.linkId),
    ).toEqual(target)
  })

  it("fails closed when the selected target owner cannot validate the target", async () => {
    const { inquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Target validation",
        kind: "product",
        contactSnapshot: { email: "validation@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )

    await expect(
      inquiriesService.addInquiryTarget(
        db,
        inquiry.id,
        {
          kind: "product",
          targetId: "prod_missing_owner",
          snapshot: { title: "Missing owner" },
        },
        "user_1",
      ),
    ).rejects.toMatchObject({ code: "INQUIRY_TARGET_VALIDATION_UNAVAILABLE" })
    await expect(
      inquiriesService.addInquiryTarget(
        db,
        inquiry.id,
        {
          kind: "product",
          targetId: "prod_not_found",
          snapshot: { title: "Not found" },
        },
        "user_1",
        { validateTarget: async () => "not_found" },
      ),
    ).rejects.toMatchObject({ code: "INQUIRY_TARGET_NOT_FOUND" })

    const link = createLinkService(() => db, [inquiryProductLink, inquiryOptionUnitLink])
    expect(await link.list(inquiryProductLink.tableName, { leftId: inquiry.id })).toEqual([])
    expect(
      await db
        .select()
        .from(inquiryTargetSnapshots)
        .where(eq(inquiryTargetSnapshots.inquiryId, inquiry.id)),
    ).toEqual([])
  })

  it("records the first response once with a durable actor event", async () => {
    const { inquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Response marker",
        kind: "general",
        priority: "normal",
        contactSnapshot: { email: "response@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    const first = await inquiriesService.recordFirstResponse(db, inquiry.id, "user_2")
    expect(inquiry.firstResponseDueAt?.getTime() - inquiry.createdAt.getTime()).toBe(
      8 * 60 * 60 * 1_000,
    )
    const replay = await inquiriesService.recordFirstResponse(db, inquiry.id, "user_3")
    expect(first.firstRespondedAt).toBeInstanceOf(Date)
    expect(replay.firstRespondedAt).toEqual(first.firstRespondedAt)
    const events = (await db.select().from(eventOutboxTable)).filter(
      ({ name, payload }: { name: string; payload: { id?: string } }) =>
        name === "inquiry.first_response_recorded" && payload.id === inquiry.id,
    )
    expect(events).toHaveLength(1)
    expect(events[0]?.payload).toEqual({
      id: inquiry.id,
      actorId: "user_2",
      firstRespondedAt: first.firstRespondedAt?.toISOString(),
    })
  })

  it("freezes default public and deployment-configured admin SLA deadlines", async () => {
    const publicResult = await inquiriesService.createPublicInquiry(
      db,
      {
        sourceRef: "public-sla",
        subject: "Public SLA",
        kind: "general",
        contactSnapshot: { email: "public-sla@example.com" },
        targets: [],
        tags: [],
        customFields: {},
      },
      { actorId: "storefront:channel-1", channelId: "channel-1" },
    )
    expect(
      publicResult.inquiry.firstResponseDueAt!.getTime() - publicResult.inquiry.createdAt.getTime(),
    ).toBe(24 * 60 * 60 * 1_000)

    const adminResult = await inquiriesService.createInquiry(
      db,
      {
        subject: "Configured SLA",
        kind: "general",
        priority: "normal",
        contactSnapshot: { email: "configured-sla@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
      { slaPolicy: () => 45 },
    )
    expect(
      adminResult.inquiry.firstResponseDueAt!.getTime() - adminResult.inquiry.createdAt.getTime(),
    ).toBe(45 * 60 * 1_000)
  })

  it("enforces triage, follow-up, and qualification invariants", async () => {
    const person = await seedPerson()
    const { inquiry: created } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Known traveler",
        kind: "general",
        personId: person.id,
        priority: "normal",
        contactSnapshot: { email: "ari@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )

    await expect(
      inquiriesService.transitionInquiry(db, created.id, { status: "triaged" }, "user_1"),
    ).rejects.toMatchObject<Partial<InquiryServiceError>>({ code: "INQUIRY_ASSIGNMENT_REQUIRED" })

    await inquiriesService.assignInquiry(db, created.id, { ownerId: "user_1" }, "user_1")
    await inquiriesService.transitionInquiry(db, created.id, { status: "triaged" }, "user_1")
    await expect(
      inquiriesService.transitionInquiry(db, created.id, { status: "in_progress" }, "user_1"),
    ).rejects.toMatchObject<Partial<InquiryServiceError>>({ code: "INQUIRY_NEXT_ACTION_REQUIRED" })

    await inquiriesService.transitionInquiry(
      db,
      created.id,
      { status: "in_progress", noFollowUpExpected: true },
      "user_1",
    )
    const qualified = await inquiriesService.transitionInquiry(
      db,
      created.id,
      { status: "qualified" },
      "user_1",
    )
    expect(qualified.qualifiedAt).toBeInstanceOf(Date)
  })

  it("closes with evidence and reopens to triage", async () => {
    const { inquiry: created } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Unsupported request",
        kind: "general",
        priority: "normal",
        contactSnapshot: { phone: "+40 123" },
        source: "phone",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    const closed = await inquiriesService.closeInquiry(
      db,
      created.id,
      { outcome: "not_serviceable", note: "Outside operating region" },
      "user_1",
    )
    expect(closed.status).toBe("closed")
    expect(closed.closedAt).toBeInstanceOf(Date)

    const reopened = await inquiriesService.reopenInquiry(
      db,
      created.id,
      { unassignedReason: "Needs reassessment" },
      "user_1",
    )
    expect(reopened.status).toBe("triaged")
    expect(reopened.closeOutcome).toBeNull()
    expect(reopened.closedAt).toBeNull()
  })

  it("applies saved views before pagination and composes explicit filters", async () => {
    const { inquiry: overdue } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Unassigned overdue",
        kind: "general",
        priority: "normal",
        contactSnapshot: { email: "overdue@example.com" },
        source: "admin",
        nextActionAt: "2020-01-01T00:00:00.000Z",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    const { inquiry: mine } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Mine",
        kind: "product",
        priority: "normal",
        ownerId: "user_1",
        contactSnapshot: { email: "mine@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    const { inquiry: terminal } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Closed but historically overdue",
        kind: "general",
        priority: "normal",
        contactSnapshot: { email: "closed@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    await inquiriesService.closeInquiry(db, terminal.id, { outcome: "spam" }, "user_1")
    const { inquiry: converted } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Converted",
        kind: "general",
        priority: "normal",
        contactSnapshot: { email: "converted@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    await db.update(inquiries).set({ status: "converted" }).where(eq(inquiries.id, converted.id))
    await db
      .update(inquiries)
      .set({ nextActionAt: new Date("2020-01-01T00:00:00.000Z") })
      .where(eq(inquiries.id, terminal.id))

    const actionable = await inquiriesService.listInquiries(
      db,
      { view: "actionable", limit: 50, offset: 0 },
      "user_1",
    )
    expect(actionable.data.map(({ id }) => id)).toEqual(
      expect.arrayContaining([overdue.id, mine.id]),
    )
    expect(actionable.data.map(({ id }) => id)).not.toContain(terminal.id)

    const defaultView = await inquiriesService.listInquiries(
      db,
      inquiryListQuerySchema.parse({ limit: 50, offset: 0 }),
      "user_1",
    )
    expect(defaultView.data.map(({ id }) => id)).not.toContain(terminal.id)
    expect(defaultView.data.map(({ id }) => id)).not.toContain(converted.id)

    const unassigned = await inquiriesService.listInquiries(
      db,
      { view: "unassigned", limit: 50, offset: 0 },
      "user_1",
    )
    expect(unassigned.data.map(({ id }) => id)).toEqual([overdue.id])

    const overdueView = await inquiriesService.listInquiries(
      db,
      { view: "overdue", limit: 50, offset: 0 },
      "user_1",
    )
    expect(overdueView.data.map(({ id }) => id)).toEqual([overdue.id])

    const mineAndClosed = await inquiriesService.listInquiries(
      db,
      { view: "mine", status: "closed", limit: 50, offset: 0 },
      "user_1",
    )
    expect(mineAndClosed.total).toBe(0)
  })

  it("replays source idempotency keys, including concurrent creates", async () => {
    const input = {
      subject: "Storefront replay",
      kind: "general" as const,
      priority: "normal" as const,
      contactSnapshot: { email: "replay@example.com" },
      source: "api" as const,
      sourceRef: "submission-123",
      tags: [],
      customFields: {},
    }

    const [first, second] = await Promise.all([
      inquiriesService.createInquiry(db, input, "user_1"),
      inquiriesService.createInquiry(db, { ...input, subject: "Ignored duplicate" }, "user_2"),
    ])

    expect([first.replayed, second.replayed].sort()).toEqual([false, true])
    expect(first.inquiry.id).toBe(second.inquiry.id)
    expect(first.inquiry.subject).toBe(second.inquiry.subject)
    expect(["Storefront replay", "Ignored duplicate"]).toContain(first.inquiry.subject)
    const replay = await inquiriesService.createInquiry(db, input, "user_3")
    expect(replay).toMatchObject({ replayed: true, inquiry: { id: first.inquiry.id } })
    expect(await db.select().from(inquiries)).toHaveLength(1)
    const createdEvents = (await db.select().from(eventOutboxTable)).filter(
      ({ name }: { name: string }) => name === "inquiry.created",
    )
    expect(createdEvents).toHaveLength(1)
  })

  it("writes mutation events atomically and captures the locked previous status", async () => {
    const { inquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Atomic lifecycle",
        kind: "general",
        priority: "normal",
        contactSnapshot: { email: "atomic@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    await inquiriesService.assignInquiry(db, inquiry.id, { ownerId: "user_1" }, "user_1")
    await inquiriesService.transitionInquiry(db, inquiry.id, { status: "triaged" }, "user_1")

    const statusEvent = (await db.select().from(eventOutboxTable)).find(
      ({ name }: { name: string }) => name === "inquiry.status_changed",
    )
    expect(statusEvent).toMatchObject({
      payload: { id: inquiry.id, actorId: "user_1", from: "new", to: "triaged" },
      metadata: expect.objectContaining({
        eventId: expect.stringMatching(/^evt_[0-9a-f-]+$/),
      }),
    })

    await expect(
      inquiriesService.updateInquiry(db, inquiry.id, { subject: "Must roll back" }, "user_1", {
        beforeOutbox: async () => {
          throw new Error("outbox unavailable")
        },
      }),
    ).rejects.toThrow("outbox unavailable")
    expect((await inquiriesService.getInquiry(db, inquiry.id))?.subject).toBe("Atomic lifecycle")
    expect(
      (await db.select().from(eventOutboxTable)).filter(
        ({ name }: { name: string }) => name === "inquiry.updated",
      ),
    ).toHaveLength(0)
  })

  it("retains repeated same-type mutation events within the same millisecond", async () => {
    const { inquiry } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Rapid assignments",
        kind: "general",
        priority: "normal",
        contactSnapshot: { email: "rapid@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )

    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"))
    try {
      await inquiriesService.assignInquiry(db, inquiry.id, { ownerId: "user_1" }, "user_1")
      await inquiriesService.assignInquiry(db, inquiry.id, { ownerId: "user_2" }, "user_2")
    } finally {
      vi.useRealTimers()
    }

    const assignmentEvents = (await db.select().from(eventOutboxTable)).filter(
      ({ name }: { name: string }) => name === "inquiry.assigned",
    )
    expect(assignmentEvents).toHaveLength(2)
    expect(new Set(assignmentEvents.map(({ eventId }: { eventId: string }) => eventId)).size).toBe(
      2,
    )
  })

  it("rejects terminal edits and removing the final customer from a qualified inquiry", async () => {
    const person = await seedPerson()
    const { inquiry: qualified } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Qualified traveler",
        kind: "general",
        priority: "normal",
        personId: person.id,
        ownerId: "user_1",
        contactSnapshot: { email: "qualified@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    await inquiriesService.transitionInquiry(db, qualified.id, { status: "triaged" }, "user_1")
    await inquiriesService.transitionInquiry(db, qualified.id, { status: "qualified" }, "user_1")
    await expect(
      inquiriesService.updateInquiry(db, qualified.id, { personId: null }, "user_1"),
    ).rejects.toMatchObject<Partial<InquiryServiceError>>({ code: "INQUIRY_CUSTOMER_REQUIRED" })

    const { inquiry: terminal } = await inquiriesService.createInquiry(
      db,
      {
        subject: "Closed inquiry",
        kind: "general",
        priority: "normal",
        contactSnapshot: { email: "closed-edit@example.com" },
        source: "admin",
        tags: [],
        customFields: {},
      },
      "user_1",
    )
    await inquiriesService.closeInquiry(db, terminal.id, { outcome: "spam" }, "user_1")
    await expect(
      inquiriesService.updateInquiry(db, terminal.id, { subject: "No edit" }, "user_1"),
    ).rejects.toMatchObject<Partial<InquiryServiceError>>({ code: "INQUIRY_ALREADY_RESOLVED" })
  })

  it("rejects duplicate chains so reciprocal duplicate cycles cannot form", async () => {
    const create = async (subject: string) =>
      (
        await inquiriesService.createInquiry(
          db,
          {
            subject,
            kind: "general",
            priority: "normal",
            contactSnapshot: { email: `${subject.toLowerCase()}@example.com` },
            source: "admin",
            tags: [],
            customFields: {},
          },
          "user_1",
        )
      ).inquiry
    const a = await create("A")
    const b = await create("B")
    const c = await create("C")

    await inquiriesService.closeInquiry(
      db,
      a.id,
      { outcome: "duplicate", duplicateOfInquiryId: b.id },
      "user_1",
    )
    await expect(
      inquiriesService.closeInquiry(
        db,
        c.id,
        { outcome: "duplicate", duplicateOfInquiryId: a.id },
        "user_1",
      ),
    ).rejects.toMatchObject<Partial<InquiryServiceError>>({ code: "INVALID_DUPLICATE_INQUIRY" })
  })
})
