import { bookingPiiAccessLog } from "@voyant-travel/bookings/schema"
import { createEventBus } from "@voyant-travel/core"
import { createDbClient } from "@voyant-travel/db"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { handleApiError } from "@voyant-travel/hono"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { getBookingContractReview } from "../../src/booking-contract-review.js"
import { createContractsAdminRoutes } from "../../src/contracts/routes.js"
import { contracts } from "../../src/schema.js"
import { createManagedDraft, seedBookingTemplate } from "./helpers/booking-contract-fixtures.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

/**
 * The operator's half of the booking-contract reviewed lifecycle (voyant#4706).
 *
 * Before this, a managed booking-contract revision could only complete its
 * lifecycle through the Tool-owned command, which has no admin route — so a
 * deployment whose agent is not wired for contracts had drafts it could never
 * issue. These cover the admin surface honouring the same review contract the
 * command does, and refusing for the same reasons.
 */
describe.skipIf(!DB_AVAILABLE)("admin booking contract lifecycle", () => {
  let db: ClosableTestDb

  beforeAll(() => {
    db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 4,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as ClosableTestDb
  })
  beforeEach(() => cleanupTestDb(db))
  afterAll(async () => {
    await db.$client.end({ timeout: 0 })
  })

  it("refuses a managed revision issued without the reviewed revision and fingerprint", async () => {
    const { booking, version } = await seedBookingTemplate(db, "BK-ADMIN-ISSUE-GUARD")
    const managed = await managedDraft(booking.id, version.id, "admin-issue-guard")
    const [ordinary] = await db
      .insert(contracts)
      .values({ title: "Ordinary draft", scope: "customer" })
      .returning()
    const [before] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, managed.value.id))
      .limit(1)
    const issuedEvents: unknown[] = []
    const eventBus = createEventBus()
    eventBus.subscribe("contract.issued", (event) => issuedEvents.push(event))
    const app = adminApp(eventBus)

    const rejected = await app.request(`/${managed.value.id}/issue`, { method: "POST" })
    expect(rejected.status).toBe(400)
    await expect(rejected.json()).resolves.toMatchObject({
      error: expect.stringContaining(
        "Booking contract revisions require the reviewed revision and content fingerprint",
      ),
    })
    await expect(
      db.select().from(contracts).where(eq(contracts.id, managed.value.id)).limit(1),
    ).resolves.toEqual([before])
    expect(issuedEvents).toHaveLength(0)

    // An ordinary contract has no reviewed revision, so it still issues with
    // no body at all — the gate is on the managed shape, not on every caller.
    const issued = await app.request(`/${ordinary!.id}/issue`, { method: "POST" })
    expect(issued.status).toBe(200)
    await expect(issued.json()).resolves.toMatchObject({
      data: { id: ordinary!.id, status: "issued" },
    })
    expect(issuedEvents).toHaveLength(1)
  })

  it("issues a managed revision against the content the operator reviewed", async () => {
    const { booking, version } = await seedBookingTemplate(db, "BK-ADMIN-ISSUE-REVIEWED")
    const managed = await managedDraft(booking.id, version.id, "admin-issue-reviewed")
    const review = (await getBookingContractReview(db, managed.value.id))!
    const issuedEvents: unknown[] = []
    const eventBus = createEventBus()
    eventBus.subscribe("contract.issued", (event) => issuedEvents.push(event))
    const app = adminApp(eventBus)

    // A stale fingerprint is refused even though the revision matches, so an
    // operator cannot approve content that moved after they read it.
    const stale = await postJson(app, `/${managed.value.id}/issue`, {
      revision: review.revision,
      contentFingerprint: "booking-contract-content:v1:sha256:stale",
    })
    expect(stale.status).toBe(400)
    await expect(stale.json()).resolves.toEqual({
      error: "The approved contract content is no longer the reviewed content.",
    })

    const wrongRevision = await postJson(app, `/${managed.value.id}/issue`, {
      revision: review.revision + 1,
      contentFingerprint: review.contentFingerprint,
    })
    expect(wrongRevision.status).toBe(400)
    await expect(wrongRevision.json()).resolves.toEqual({
      error: "The approved contract revision is no longer the selected revision.",
    })
    await expect(draftStatus(managed.value.id)).resolves.toEqual([{ status: "draft" }])
    expect(issuedEvents).toHaveLength(0)

    const accepted = await postJson(app, `/${managed.value.id}/issue`, {
      revision: review.revision,
      contentFingerprint: review.contentFingerprint,
    })
    expect(accepted.status).toBe(200)
    await expect(accepted.json()).resolves.toMatchObject({
      data: { id: managed.value.id, status: "issued" },
    })
    expect(issuedEvents).toHaveLength(1)

    // The reviewed content is promoted verbatim: issuing must not re-render the
    // body from the template or move the number the approval covered.
    const [issued] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, managed.value.id))
      .limit(1)
    expect(issued?.renderedBody).toBe(review.contract.renderedBody)
    expect(issued?.contractNumber).toBe(review.contract.contractNumber)
    expect(issued?.issuedAt).toBeInstanceOf(Date)
  })

  it("refuses to issue a managed revision a successor already supersedes", async () => {
    const { booking, version } = await seedBookingTemplate(db, "BK-ADMIN-ISSUE-SUPERSEDED")
    const managed = await managedDraft(booking.id, version.id, "admin-issue-superseded")
    const review = (await getBookingContractReview(db, managed.value.id))!
    const successor = await createManagedDraft(db, "admin-issue-superseded-revision", {
      title: "Customer agreement",
      revisionOfContractId: managed.value.id,
      variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 20_00 } },
    })
    expect(successor.value.id).not.toBe(managed.value.id)

    const response = await postJson(adminApp(), `/${managed.value.id}/issue`, {
      revision: review.revision,
      contentFingerprint: review.contentFingerprint,
    })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: "A successor revision already exists for this contract revision.",
    })
    await expect(draftStatus(managed.value.id)).resolves.toEqual([{ status: "draft" }])
  })

  it("sends an issued managed revision only against its reviewed content", async () => {
    const { booking, version } = await seedBookingTemplate(db, "BK-ADMIN-SEND-REVIEWED")
    const managed = await managedDraft(booking.id, version.id, "admin-send-reviewed")
    const review = (await getBookingContractReview(db, managed.value.id))!
    const app = adminApp()

    const issued = await postJson(app, `/${managed.value.id}/issue`, {
      revision: review.revision,
      contentFingerprint: review.contentFingerprint,
    })
    expect(issued.status).toBe(200)

    const withoutApproval = await postJson(app, `/${managed.value.id}/send`, {
      recipientEmail: "ana@example.test",
    })
    expect(withoutApproval.status).toBe(400)
    await expect(draftStatus(managed.value.id)).resolves.toEqual([{ status: "issued" }])

    // Issuing rewrote the row's timestamps, so the fingerprint the operator
    // sends against is the one the review reports now, not the pre-issue one.
    const afterIssue = (await getBookingContractReview(db, managed.value.id))!
    const sent = await postJson(app, `/${managed.value.id}/send`, {
      recipientEmail: "ana@example.test",
      subject: "Your contract",
      revision: afterIssue.revision,
      contentFingerprint: afterIssue.contentFingerprint,
    })
    expect(sent.status).toBe(200)
    await expect(draftStatus(managed.value.id)).resolves.toEqual([{ status: "sent" }])

    // The review surface reports what was actually delivered, so a revision
    // never carries a `sentAt` with no record of where it went.
    await expect(getBookingContractReview(db, managed.value.id)).resolves.toMatchObject({
      effectiveStatus: "sent",
      delivery: {
        recipient: "ana@example.test",
        channel: "email",
        sentRevision: afterIssue.revision,
        notificationsSuppressed: false,
      },
    })
  })

  it("serves the managed revision review only to a caller with booking PII scope", async () => {
    const { booking, version } = await seedBookingTemplate(db, "BK-ADMIN-REVIEW-READ")
    const managed = await managedDraft(booking.id, version.id, "admin-review-read")
    const [ordinary] = await db
      .insert(contracts)
      .values({ title: "Ordinary draft", scope: "customer" })
      .returning()

    const denied = await adminApp(undefined, ["legal:read"]).request(
      `/${managed.value.id}/booking-review`,
    )
    expect(denied.status).toBe(404)
    await expect(
      db.select().from(bookingPiiAccessLog).where(eq(bookingPiiAccessLog.bookingId, booking.id)),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "read",
          outcome: "denied",
          reason: "insufficient_scope",
          metadata: expect.objectContaining({ contractId: managed.value.id, reveal: false }),
        }),
      ]),
    )

    const allowed = await adminApp().request(`/${managed.value.id}/booking-review`)
    expect(allowed.status).toBe(200)
    await expect(allowed.json()).resolves.toMatchObject({
      data: {
        revision: 1,
        contentFingerprint: expect.stringContaining("booking-contract-content:v1:sha256:"),
        booking: { id: booking.id, reference: "BK-ADMIN-REVIEW-READ" },
        contract: { id: managed.value.id },
      },
    })

    // Only managed booking revisions have a review; everything else is not
    // there to read, which is how the UI knows the generic lifecycle applies.
    const ordinaryReview = await adminApp().request(`/${ordinary!.id}/booking-review`)
    expect(ordinaryReview.status).toBe(404)
  })

  function managedDraft(bookingId: string, templateVersionId: string, key: string) {
    return createManagedDraft(db, `${key}-create`, {
      title: "Customer agreement",
      bookingId,
      templateVersionId,
      variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 10_00 } },
    })
  }

  function draftStatus(contractId: string) {
    return db
      .select({ status: contracts.status })
      .from(contracts)
      .where(eq(contracts.id, contractId))
  }

  function adminApp(
    eventBus?: ReturnType<typeof createEventBus>,
    scopes: string[] = ["legal:read", "bookings-pii:read"],
  ) {
    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      c.set("actor" as never, "staff")
      c.set("callerType" as never, "session")
      c.set("userId" as never, "usr_legal_admin_review")
      c.set("scopes" as never, scopes)
      await next()
    })
    app.route("/", createContractsAdminRoutes(eventBus ? { eventBus } : {}))
    return app
  }

  function postJson(app: Hono, path: string, body: unknown) {
    return app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  }
})
