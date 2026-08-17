import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { inquiries, people } from "../../src/schema.js"
import { type InquiryServiceError, inquiriesService } from "../../src/service/inquiries.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("inquiriesService", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test database follows existing integration fixture typing.
  let db: any

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
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
    const created = await inquiriesService.createInquiry(db, {
      subject: "Custom Japan itinerary",
      kind: "custom_trip",
      priority: "normal",
      contactSnapshot: { email: "ari@example.com" },
      source: "phone",
      tags: [],
      customFields: {},
    })

    expect(created.id).toMatch(/^inq_/)
    expect(created.status).toBe("new")
    expect((await inquiriesService.getInquiry(db, created.id))?.subject).toBe(
      "Custom Japan itinerary",
    )
  })

  it("enforces triage, follow-up, and qualification invariants", async () => {
    const person = await seedPerson()
    const created = await inquiriesService.createInquiry(db, {
      subject: "Known traveler",
      kind: "general",
      personId: person.id,
      priority: "normal",
      contactSnapshot: { email: "ari@example.com" },
      source: "admin",
      tags: [],
      customFields: {},
    })

    await expect(
      inquiriesService.transitionInquiry(db, created.id, { status: "triaged" }, "user_1"),
    ).rejects.toMatchObject<Partial<InquiryServiceError>>({ code: "INQUIRY_ASSIGNMENT_REQUIRED" })

    await inquiriesService.assignInquiry(db, created.id, { ownerId: "user_1" })
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
    const created = await inquiriesService.createInquiry(db, {
      subject: "Unsupported request",
      kind: "general",
      priority: "normal",
      contactSnapshot: { phone: "+40 123" },
      source: "phone",
      tags: [],
      customFields: {},
    })
    const closed = await inquiriesService.closeInquiry(db, created.id, {
      outcome: "not_serviceable",
      note: "Outside operating region",
    })
    expect(closed.status).toBe("closed")
    expect(closed.closedAt).toBeInstanceOf(Date)

    const reopened = await inquiriesService.reopenInquiry(db, created.id, {
      unassignedReason: "Needs reassessment",
    })
    expect(reopened.status).toBe("triaged")
    expect(reopened.closeOutcome).toBeNull()
    expect(reopened.closedAt).toBeNull()
  })

  it("applies saved views before pagination and composes explicit filters", async () => {
    const overdue = await inquiriesService.createInquiry(db, {
      subject: "Unassigned overdue",
      kind: "general",
      priority: "normal",
      contactSnapshot: { email: "overdue@example.com" },
      source: "admin",
      nextActionAt: "2020-01-01T00:00:00.000Z",
      tags: [],
      customFields: {},
    })
    const mine = await inquiriesService.createInquiry(db, {
      subject: "Mine",
      kind: "product",
      priority: "normal",
      ownerId: "user_1",
      contactSnapshot: { email: "mine@example.com" },
      source: "admin",
      tags: [],
      customFields: {},
    })
    const terminal = await inquiriesService.createInquiry(db, {
      subject: "Closed but historically overdue",
      kind: "general",
      priority: "normal",
      contactSnapshot: { email: "closed@example.com" },
      source: "admin",
      tags: [],
      customFields: {},
    })
    await inquiriesService.closeInquiry(db, terminal.id, { outcome: "spam" })
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
})
