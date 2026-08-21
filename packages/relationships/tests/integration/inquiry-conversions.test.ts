import type { CatalogInquiryBookingSessionRuntime } from "@voyant-travel/catalog/inquiry-booking-session-runtime-port"
import type { LinkService } from "@voyant-travel/core"
import { eventOutboxTable } from "@voyant-travel/db/schema"
import type { ProposalInquiryConversionRuntime } from "@voyant-travel/proposals-contracts/inquiry-conversion"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createCatalogInquiryBookingSessionRuntime } from "../../../catalog/src/inquiry-booking-session-runtime.js"

import { createProposalInquiryConversionRuntime } from "../../../proposals/src/inquiry-conversion-runtime.js"
import { pipelines, proposals, stages } from "../../../proposals/src/schema.js"
import { inquiries, inquiryConversions, inquiryTargetSnapshots, people } from "../../src/schema.js"
import {
  convertInquiryToBookingTarget,
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

  async function productTarget(inquiryId: string) {
    await db.insert(inquiryTargetSnapshots).values({
      linkId: `link_${inquiryId}`,
      inquiryId,
      kind: "product",
      targetId: "prod_kyoto",
      snapshot: { title: "Kyoto discovery" },
    })
    return {
      targetLinkId: `link_${inquiryId}`,
      link: {
        list: vi.fn(async () => [{ id: `link_${inquiryId}`, leftId: inquiryId }]),
      } as unknown as LinkService,
    }
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

  // The Products the customer asked about are the Proposal's lines. The caller
  // always sent an empty list, so every conversion dropped them and staff had to
  // rebuild the selection by hand (RFC §11.3, Codex review on #4838).
  it("hands the Inquiry's Product targets to the Proposal owner", async () => {
    const inquiryId = await qualifiedInquiry()
    await productTarget(inquiryId)
    const proposals = runtime()

    await convertInquiryToProposal(
      db,
      proposals,
      inquiryId,
      { kind: "proposal" as const, idempotencyKey: "with-targets", keepInquiryOpen: false },
      "user_1",
    )

    const input = vi.mocked(proposals.convertInquiry).mock.calls[0]?.[1]
    expect(input?.productTargets).toEqual([
      { productId: "prod_kyoto", nameSnapshot: "Kyoto discovery" },
    ])
  })

  it("sends no Product lines when the Inquiry names none", async () => {
    const inquiryId = await qualifiedInquiry()
    const proposals = runtime()

    await convertInquiryToProposal(
      db,
      proposals,
      inquiryId,
      { kind: "proposal" as const, idempotencyKey: "no-targets", keepInquiryOpen: false },
      "user_1",
    )

    expect(vi.mocked(proposals.convertInquiry).mock.calls[0]?.[1]?.productTargets).toEqual([])
  })

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

  it("persists and replays one Booking Session conversion without recalling Catalog", async () => {
    const inquiryId = await qualifiedInquiry("Product booking")
    const { link, targetLinkId } = await productTarget(inquiryId)
    const createSession = vi.fn(async () => ({
      kind: "session_created" as const,
      session: { id: "bks_kyoto", scope: { locale: "en", market: "default" } },
    }))
    const runtime = createCatalogInquiryBookingSessionRuntime(
      async () => ({ createSession }) as never,
    )
    const command = {
      kind: "booking_session" as const,
      idempotencyKey: "primary-session",
      targetLinkId,
      selection: { partySize: 2 },
      keepInquiryOpen: false,
    }

    const created = await convertInquiryToBookingTarget(
      db,
      runtime,
      link,
      inquiryId,
      command,
      "user_1",
    )
    const replayed = await convertInquiryToBookingTarget(
      db,
      runtime,
      link,
      inquiryId,
      command,
      "user_2",
    )

    expect(created).toMatchObject({
      kind: "created",
      inquiryStatus: "converted",
      target: { kind: "booking_session", id: "bks_kyoto" },
    })
    expect(replayed).toEqual({ ...created, kind: "replayed" })
    expect(createSession).toHaveBeenCalledOnce()
    expect(await db.select().from(inquiryConversions)).toHaveLength(1)
    expect(
      (await db.select().from(eventOutboxTable)).filter(
        ({ name }: { name: string }) =>
          name === "inquiry.converted" || name === "catalog.booking-session.created",
      ),
    ).toHaveLength(2)
  })

  it("rejects an idempotency key replayed with a different Booking Session payload", async () => {
    const inquiryId = await qualifiedInquiry("Payload replay")
    const { link, targetLinkId } = await productTarget(inquiryId)
    const runtime: CatalogInquiryBookingSessionRuntime = {
      createForInquiry: vi.fn(async () => ({
        kind: "created" as const,
        bookingSessionId: "bks_payload",
      })),
    }
    const command = {
      kind: "booking_session" as const,
      idempotencyKey: "payload-key",
      targetLinkId,
      selection: { partySize: 2 },
      keepInquiryOpen: true,
      nextActionAt: "2030-01-02T10:00:00.000Z",
    }
    const assisted = await convertInquiryToBookingTarget(
      db,
      runtime,
      link,
      inquiryId,
      command,
      "user_1",
    )
    expect(assisted.inquiryStatus).toBe("in_progress")
    await expect(relationshipsService.getInquiry(db, inquiryId)).resolves.toMatchObject({
      status: "in_progress",
      nextActionAt: new Date("2030-01-02T10:00:00.000Z"),
    })

    await expect(
      convertInquiryToBookingTarget(
        db,
        runtime,
        link,
        inquiryId,
        { ...command, selection: { partySize: 4 } },
        "user_1",
      ),
    ).rejects.toMatchObject({ reason: "idempotency_conflict" })
  })

  it("requires a next action for an assisted Booking Session conversion", async () => {
    const inquiryId = await qualifiedInquiry("Assisted booking")
    const { link, targetLinkId } = await productTarget(inquiryId)
    const runtime: CatalogInquiryBookingSessionRuntime = {
      createForInquiry: vi.fn(async () => ({
        kind: "created" as const,
        bookingSessionId: "bks_assisted",
      })),
    }

    await expect(
      convertInquiryToBookingTarget(
        db,
        runtime,
        link,
        inquiryId,
        {
          kind: "booking_session",
          idempotencyKey: "assisted-session",
          targetLinkId,
          keepInquiryOpen: true,
        },
        "user_1",
      ),
    ).rejects.toMatchObject({ code: "INQUIRY_NEXT_ACTION_REQUIRED" })
    expect(runtime.createForInquiry).not.toHaveBeenCalled()
  })

  it("rolls back Booking Session provenance, status, and outbox as one transaction", async () => {
    const inquiryId = await qualifiedInquiry("Atomic booking session")
    const { link, targetLinkId } = await productTarget(inquiryId)
    const runtime = createCatalogInquiryBookingSessionRuntime(
      async () =>
        ({
          createSession: vi.fn(async () => ({
            kind: "session_created" as const,
            session: { id: "bks_atomic", scope: { locale: "en", market: "default" } },
          })),
        }) as never,
    )

    await expect(
      convertInquiryToBookingTarget(
        db,
        runtime,
        link,
        inquiryId,
        {
          kind: "booking_session",
          idempotencyKey: "atomic-session",
          targetLinkId,
          keepInquiryOpen: false,
        },
        "user_1",
        { beforeOutbox: async () => Promise.reject(new Error("outbox unavailable")) },
      ),
    ).rejects.toThrow("outbox unavailable")

    expect(await db.select().from(inquiryConversions)).toHaveLength(0)
    expect((await relationshipsService.getInquiry(db, inquiryId))?.status).toBe("qualified")
    expect(
      (await db.select().from(eventOutboxTable)).filter(
        ({ name }: { name: string }) =>
          name === "inquiry.converted" || name === "catalog.booking-session.created",
      ),
    ).toHaveLength(0)
  })
})
