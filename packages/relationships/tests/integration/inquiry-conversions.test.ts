import { eventOutboxTable } from "@voyant-travel/db/schema"
import type { ProposalInquiryConversionRuntime } from "@voyant-travel/proposals-contracts/inquiry-conversion"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { createProposalInquiryConversionRuntime } from "../../../proposals/src/inquiry-conversion-runtime.js"
import { pipelines, proposals, stages } from "../../../proposals/src/schema.js"
import { inquiries, inquiryConversions, people } from "../../src/schema.js"
import {
  convertInquiryToProposal,
  type InquiryServiceError,
  relationshipsService,
} from "../../src/service/index.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("Inquiry Proposal conversion coordinator", () => {
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

  async function qualifiedInquiry(subject = "Qualified request") {
    const [person] = await db
      .insert(people)
      .values({ firstName: "Ari", lastName: "Traveler", tags: [], status: "active" })
      .returning()
    const { inquiry } = await relationshipsService.createInquiry(
      db,
      {
        subject,
        kind: "custom_trip",
        priority: "normal",
        personId: person.id,
        ownerId: "user_1",
        contactSnapshot: { email: "ari@example.com" },
        source: "admin",
        tags: ["bespoke"],
        customFields: {},
      },
      "user_1",
    )
    await relationshipsService.transitionInquiry(db, inquiry.id, { status: "triaged" }, "user_1")
    await relationshipsService.transitionInquiry(db, inquiry.id, { status: "qualified" }, "user_1")
    return inquiry.id
  }

  function runtime(): ProposalInquiryConversionRuntime {
    return {
      convertInquiry: vi.fn(async (_database, input) => ({
        kind: "created" as const,
        proposalId: `prp_${input.idempotencyKey}`,
        pipelineId: input.pipeline?.pipelineId ?? "pipeline_default",
        stageId: input.pipeline?.stageId ?? "stage_initial",
      })),
    }
  }

  it("persists one stable conversion and replays it after the Inquiry becomes terminal", async () => {
    const inquiryId = await qualifiedInquiry()
    const proposals = runtime()
    const command = {
      kind: "proposal" as const,
      idempotencyKey: "proposal-primary",
      keepInquiryOpen: false,
    }

    const created = await convertInquiryToProposal(db, proposals, inquiryId, command, "user_1")
    await db.update(inquiries).set({ status: "closed" }).where(eq(inquiries.id, inquiryId))
    const replayed = await convertInquiryToProposal(db, proposals, inquiryId, command, "user_2")

    expect(created).toMatchObject({
      kind: "created",
      inquiryStatus: "converted",
      target: { kind: "proposal", id: "prp_proposal-primary" },
    })
    expect(replayed).toEqual({ ...created, kind: "replayed" })
    expect(proposals.convertInquiry).toHaveBeenCalledTimes(1)
    expect(await db.select().from(inquiryConversions)).toHaveLength(1)
    expect(
      (await db.select().from(eventOutboxTable)).filter(
        ({ name }: { name: string }) => name === "inquiry.converted",
      ),
    ).toHaveLength(1)
  })

  it("atomically emits both owner events through the real nested Proposal provider", async () => {
    const inquiryId = await qualifiedInquiry("Real provider transaction")
    const [pipeline] = await db
      .insert(pipelines)
      .values({ entityType: "proposal", name: "Inquiry proposals", isDefault: true })
      .returning()
    const [stage] = await db
      .insert(stages)
      .values({ pipelineId: pipeline.id, name: "Draft", isClosed: false })
      .returning()
    const command = {
      kind: "proposal" as const,
      idempotencyKey: "real-provider",
      keepInquiryOpen: false,
    }

    const created = await convertInquiryToProposal(
      db,
      createProposalInquiryConversionRuntime(),
      inquiryId,
      command,
      "user_1",
    )
    const replayed = await convertInquiryToProposal(
      db,
      createProposalInquiryConversionRuntime(),
      inquiryId,
      command,
      "user_1",
    )

    expect(created).toMatchObject({
      kind: "created",
      target: { kind: "proposal", pipelineId: pipeline.id, stageId: stage.id },
    })
    expect(replayed).toEqual({ ...created, kind: "replayed" })
    expect(await db.select().from(proposals)).toHaveLength(1)
    const events = await db.select().from(eventOutboxTable)
    expect(events.filter(({ name }: { name: string }) => name === "proposal.created")).toHaveLength(
      1,
    )
    expect(
      events.filter(({ name }: { name: string }) => name === "inquiry.converted"),
    ).toHaveLength(1)
  })

  it("allows multiple Proposal conversions with distinct keys while the Inquiry stays open", async () => {
    const inquiryId = await qualifiedInquiry("Alternative proposals")
    const proposals = runtime()

    const first = await convertInquiryToProposal(
      db,
      proposals,
      inquiryId,
      { kind: "proposal", idempotencyKey: "alternative-a", keepInquiryOpen: true },
      "user_1",
    )
    const second = await convertInquiryToProposal(
      db,
      proposals,
      inquiryId,
      { kind: "proposal", idempotencyKey: "alternative-b", keepInquiryOpen: true },
      "user_1",
    )

    expect(first.target.id).not.toBe(second.target.id)
    expect(first.inquiryStatus).toBe("qualified")
    expect(second.inquiryStatus).toBe("qualified")
    expect(await db.select().from(inquiryConversions)).toHaveLength(2)
    expect((await relationshipsService.getInquiry(db, inquiryId))?.status).toBe("qualified")
  })

  it("rolls back provenance and Inquiry finalization when outbox persistence cannot proceed", async () => {
    const inquiryId = await qualifiedInquiry("Atomic conversion")
    const proposals = runtime()

    await expect(
      convertInquiryToProposal(
        db,
        proposals,
        inquiryId,
        { kind: "proposal", idempotencyKey: "atomic", keepInquiryOpen: false },
        "user_1",
        {
          beforeOutbox: async () => {
            throw new Error("outbox unavailable")
          },
        },
      ),
    ).rejects.toThrow("outbox unavailable")

    expect(await db.select().from(inquiryConversions)).toHaveLength(0)
    expect((await relationshipsService.getInquiry(db, inquiryId))?.status).toBe("qualified")
  })

  it("keeps a refused conversion qualified and rejects a new operation after conversion", async () => {
    const inquiryId = await qualifiedInquiry("Lifecycle gates")
    const refused: ProposalInquiryConversionRuntime = {
      convertInquiry: vi.fn(async () => ({ kind: "refused", reason: "stage_closed" })),
    }
    await expect(
      convertInquiryToProposal(
        db,
        refused,
        inquiryId,
        { kind: "proposal", idempotencyKey: "refused", keepInquiryOpen: false },
        "user_1",
      ),
    ).rejects.toMatchObject({ reason: "stage_closed" })
    expect((await relationshipsService.getInquiry(db, inquiryId))?.status).toBe("qualified")
    expect(await db.select().from(inquiryConversions)).toHaveLength(0)

    await convertInquiryToProposal(
      db,
      runtime(),
      inquiryId,
      { kind: "proposal", idempotencyKey: "accepted", keepInquiryOpen: false },
      "user_1",
    )
    await expect(
      convertInquiryToProposal(
        db,
        runtime(),
        inquiryId,
        { kind: "proposal", idempotencyKey: "different", keepInquiryOpen: false },
        "user_1",
      ),
    ).rejects.toMatchObject<Partial<InquiryServiceError>>({ code: "INQUIRY_ALREADY_RESOLVED" })
  })
})
