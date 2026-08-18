import { generateLinkTableSql } from "@voyant-travel/core"
import { createLinkService } from "@voyant-travel/db/links"
import { eventOutboxTable } from "@voyant-travel/db/schema"
import { inquiryListQuerySchema } from "@voyant-travel/relationships-contracts"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  activities,
  activityLinks,
  inquiries,
  inquiryTargetSnapshots,
  people,
} from "../../src/schema.js"
import { type InquiryServiceError, inquiriesService } from "../../src/service/inquiries.js"
import { inquiryOptionUnitLink, inquiryProductLink } from "../../src/standard-links.js"

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
    for (const definition of [inquiryProductLink, inquiryOptionUnitLink]) {
      const ddl = generateLinkTableSql(definition)
      await db.execute(sql.raw(ddl.createTable))
      for (const index of ddl.indexes) await db.execute(sql.raw(index))
    }
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    for (const definition of [inquiryProductLink, inquiryOptionUnitLink]) {
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
    expect(targetEvents[0]?.data).toMatchObject({
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
