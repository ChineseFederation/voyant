// agent-quality: file-size exception -- owner: legal; managed booking review workflow coverage stays co-located because revision, snapshot, delivery, and concurrency guards share the same database fixtures.
import { bookingItems, bookingPiiAccessLog, bookings } from "@voyant-travel/bookings/schema"
import { createEventBus } from "@voyant-travel/core"
import { createDbClient } from "@voyant-travel/db"
import { infraPublicDocumentDeliveryGrantsTable } from "@voyant-travel/db/schema/infra"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { handleApiError } from "@voyant-travel/hono"
import type { ToolContext } from "@voyant-travel/tools"
import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { getBookingContractReview } from "../../src/booking-contract-review.js"
import { createContractsAdminRoutes } from "../../src/contracts/routes.js"
import { contractsService } from "../../src/contracts/service.js"
import { LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION } from "../../src/created-target-policy.js"
import { createLegalToolServices, executeLegalContractDraftCreate } from "../../src/mcp-runtime.js"
import {
  contractAttachments,
  contracts,
  contractTemplates,
  contractTemplateVersions,
} from "../../src/schema.js"
import {
  getBookingContractReviewTool,
  listApplicableBookingContractTemplatesTool,
} from "../../src/tools.js"
import { legalVoyantModule } from "../../src/voyant.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("managed booking contract workflow", () => {
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

  it("binds review output and fingerprint to the frozen revision snapshot", async () => {
    const { booking, item, version } = await seedBookingTemplate()
    const first = await createDraft("snapshot-create", {
      title: "Customer agreement",
      bookingId: booking.id,
      templateVersionId: version.id,
      variables: {
        customer: { name: "Ana Pop", email: "ana@example.test" },
        commercial: { depositDueCents: 25_00, balanceDueDays: 30 },
      },
    })
    const originalReview = await getBookingContractReview(db, first.value.id)
    expect(originalReview).toMatchObject({
      booking: {
        id: booking.id,
        reference: "BK-SNAPSHOT-1",
        customerName: "Ana Pop",
        customerEmail: "ana@example.test",
        totalAmountCents: 100_00,
      },
      products: [{ title: "Original tour", quantity: 2, amountCents: 100_00 }],
      commercialTerms: { depositDueCents: 25_00, balanceDueDays: 30 },
    })
    const originalFingerprint = originalReview?.contentFingerprint
    expect(originalReview?.contract.variables).toMatchObject({
      customer: { name: "Ana Pop", email: "ana@example.test" },
    })

    const redactedService = createLegalToolServices(db).getContract(first.value.id)
    await expect(redactedService).resolves.toMatchObject({
      variables: null,
      metadata: {
        bookingContractWorkflow: {
          revision: 1,
          previousRevisionId: null,
          reviewOnly: true,
          piiRedacted: true,
        },
      },
    })
    expect((await redactedService)?.metadata).not.toHaveProperty(
      "bookingContractWorkflow.reviewSnapshot",
    )

    const adminApp = new Hono()
    adminApp.use("*", async (c, next) => {
      c.set("db" as never, db)
      await next()
    })
    adminApp.route("/", createContractsAdminRoutes())
    const detailRes = await adminApp.request(`/${first.value.id}`)
    expect(detailRes.status).toBe(200)
    const detailBody = (await detailRes.json()) as { data: Record<string, unknown> }
    expect(detailBody.data.variables).toBeNull()
    expect(detailBody.data.metadata).toEqual({
      bookingContractWorkflow: {
        revision: 1,
        previousRevisionId: null,
        reviewOnly: true,
        piiRedacted: true,
      },
    })

    await db
      .update(bookings)
      .set({
        contactFirstName: "Changed",
        contactLastName: "Customer",
        contactEmail: "changed@example.test",
        sellAmountCents: 200_00,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id))
    await db
      .update(bookingItems)
      .set({
        title: "Changed item",
        productNameSnapshot: "Changed product",
        totalSellAmountCents: 200_00,
        updatedAt: new Date(),
      })
      .where(eq(bookingItems.id, item.id))

    const afterMutation = await getBookingContractReview(db, first.value.id)
    expect(afterMutation).toEqual(originalReview)
    expect(afterMutation?.contentFingerprint).toBe(originalFingerprint)
  })

  it("keeps immutable review history and fingerprints after template deletion", async () => {
    const { booking, template, version } = await seedBookingTemplate("BK-TEMPLATE-DELETE-1")
    const created = await createDraft("template-delete-create", {
      title: "Customer agreement",
      bookingId: booking.id,
      templateVersionId: version.id,
      variables: {
        customer: { name: "Ana Pop", email: "ana@example.test" },
        commercial: { depositDueCents: 25_00, balanceDueDays: 30 },
      },
    })
    const beforeDelete = await getBookingContractReview(db, created.value.id)
    const fingerprint = beforeDelete?.contentFingerprint

    await expect(contractsService.deleteTemplate(db, template.id)).resolves.toMatchObject({
      id: template.id,
    })
    await expect(contractsService.getTemplateVersionById(db, version.id)).resolves.toBeNull()
    const [contractAfterDelete] = await db
      .select({ templateVersionId: contracts.templateVersionId })
      .from(contracts)
      .where(eq(contracts.id, created.value.id))
      .limit(1)
    expect(contractAfterDelete?.templateVersionId).toBeNull()

    const afterDelete = await getBookingContractReview(db, created.value.id)
    expect(afterDelete).toEqual(beforeDelete)
    expect(afterDelete?.contentFingerprint).toBe(fingerprint)
    expect(afterDelete?.template).toEqual({
      id: template.id,
      name: template.name,
      versionId: version.id,
      version: version.version,
      language: template.language,
    })
  })

  it("requires bookings-pii:read for applicability and audits allowed and denied probes", async () => {
    const { booking } = await seedBookingTemplate("BK-PII-1")
    const deniedContext = {
      db,
      actor: "staff",
      audience: "staff",
      tenantId: "tenant",
      scopes: ["legal:read"],
      resolverScope: { locale: "en", audience: "staff", market: "default", actor: "staff" },
    } satisfies ToolContext & { scopes: string[] }

    await expect(
      listApplicableBookingContractTemplatesTool.handler({ bookingId: booking.id }, deniedContext),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
    await expect(
      getBookingContractReviewTool.handler({ contractId: "contract_missing" }, deniedContext),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })

    const service = createLegalToolServices(db, undefined, {
      userId: "usr_allowed",
      callerType: "session",
      actor: "staff",
    })
    const allowed = await service.listApplicableBookingTemplates({ bookingId: booking.id })
    expect(allowed).toMatchObject({ bookingFound: true })
    const { version } = await seedBookingTemplate("BK-PII-2")
    const contract = await createDraft("review-audit-create", {
      title: "Customer agreement",
      bookingId: booking.id,
      templateVersionId: version.id,
      variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 10_00 } },
    })
    await expect(
      service.getBookingContractReview({ contractId: contract.value.id }),
    ).resolves.toMatchObject({
      booking: { id: booking.id },
    })

    const piiRows = await db
      .select()
      .from(bookingPiiAccessLog)
      .where(eq(bookingPiiAccessLog.bookingId, booking.id))
    const allPiiRows = await db.select().from(bookingPiiAccessLog)
    expect(piiRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "read",
          outcome: "denied",
          reason: "insufficient_scope",
        }),
        expect.objectContaining({
          action: "read",
          outcome: "allowed",
          reason: "contract_template_applicability_reveal",
          actorId: "usr_allowed",
        }),
        expect.objectContaining({
          action: "read",
          outcome: "allowed",
          reason: "contract_review_reveal",
          actorId: "usr_allowed",
        }),
      ]),
    )
    expect(allPiiRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: null,
          action: "read",
          outcome: "denied",
          reason: "insufficient_scope",
          metadata: expect.objectContaining({ contractId: "contract_missing" }),
        }),
      ]),
    )

    expect(listApplicableBookingContractTemplatesTool.requiredScopes).toEqual([
      "legal:read",
      "bookings-pii:read",
    ])
    const manifestTool = legalVoyantModule.tools?.find(
      ({ id }) => id === "@voyant-travel/legal#tool.list-applicable-booking-contract-templates",
    )
    const manifestAction = legalVoyantModule.actions?.find(
      ({ id }) =>
        id === "@voyant-travel/legal#action.inspect-booking-contract-template-applicability",
    )
    expect(manifestTool?.requiredScopes).toEqual(["legal:read", "bookings-pii:read"])
    expect(manifestAction).toMatchObject({
      requiredScopes: ["legal:read", "bookings-pii:read"],
      from: {
        tools: ["@voyant-travel/legal#tool.list-applicable-booking-contract-templates"],
      },
    })
  })

  // voyant#4650: the listing filtered templates on the booking's *preferred*
  // language, which resolves to "en" on a booking nothing ever wrote a language
  // to. A single-language deployment's only customer template was therefore
  // absent from the list of templates that apply to its own bookings.
  it("lists the deployment's own templates for a booking that carries no language", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: "BK-NO-LANGUAGE-1",
        status: "confirmed",
        contactFirstName: "Ana",
        contactLastName: "Pop",
        contactEmail: "ana@example.test",
        communicationLanguage: null,
        contactPreferredLanguage: null,
        sellCurrency: "RON",
        sellAmountCents: 500_00,
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      })
      .returning()
    await db.insert(bookingItems).values({
      bookingId: booking.id,
      title: "Excursie de toamnă",
      status: "confirmed",
      productNameSnapshot: "Excursie de toamnă",
      quantity: 2,
      sellCurrency: "RON",
      totalSellAmountCents: 500_00,
    })
    const [template] = await db
      .insert(contractTemplates)
      .values({
        name: "Contract de comercializare",
        slug: "contract-comercializare-listing",
        scope: "customer",
        language: "ro",
        body: "Contract pentru {{ customer.name }}",
        active: true,
        isDefault: true,
      })
      .returning()
    const [version] = await db
      .insert(contractTemplateVersions)
      .values({
        templateId: template.id,
        version: 1,
        body: "Contract pentru {{ customer.name }}",
        variableSchema: { required: ["customer.name"] },
      })
      .returning()
    await db
      .update(contractTemplates)
      .set({ currentVersionId: version.id })
      .where(eq(contractTemplates.id, template.id))

    const service = createLegalToolServices(db, undefined, {
      userId: "usr_listing",
      callerType: "session",
      actor: "staff",
    })
    await expect(
      service.listApplicableBookingTemplates({ bookingId: booking.id }),
    ).resolves.toMatchObject({
      bookingFound: true,
      data: [{ id: template.id, language: "ro", applicable: true, missingPrerequisites: [] }],
    })
    // A caller that names a language still gets exactly that language.
    await expect(
      service.listApplicableBookingTemplates({ bookingId: booking.id, language: "en" }),
    ).resolves.toMatchObject({ bookingFound: true, data: [] })
  })

  it("gates booking draft snapshots with trusted PII context and preserves generic drafts", async () => {
    const { booking, version } = await seedBookingTemplate("BK-DRAFT-PII-GATE")
    let snapshotSourceRead = false

    await expect(
      createDraftForContext(
        "draft-pii-denied",
        {
          title: "Denied customer agreement",
          bookingId: booking.id,
          templateVersionId: version.id,
          variables: { customer: { name: "Ana Pop" } },
        },
        {
          userId: "usr_denied_draft",
          callerType: "agent",
          actor: "staff",
          organizationId: "org_legal_booking_contract",
          scopes: ["legal:write"],
        },
        contractsService.createContract,
        {
          async afterBookingReviewSourceRead() {
            snapshotSourceRead = true
          },
        },
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
    expect(snapshotSourceRead).toBe(false)
    await expect(
      db.select().from(contracts).where(eq(contracts.bookingId, booking.id)),
    ).resolves.toHaveLength(0)

    const scoped = await createDraftForContext(
      "draft-pii-scoped",
      {
        title: "Scoped customer agreement",
        bookingId: booking.id,
        templateVersionId: version.id,
        variables: { customer: { name: "Ana Pop" } },
      },
      {
        userId: "usr_scoped_draft",
        callerType: "agent",
        actor: "staff",
        organizationId: "org_legal_booking_contract",
        scopes: ["legal:write", "bookings-pii:read"],
      },
    )
    expect(scoped.value.id).toEqual(expect.any(String))

    const internal = await createDraftForContext(
      "draft-pii-internal",
      {
        title: "Internal customer agreement",
        bookingId: booking.id,
        templateVersionId: version.id,
        variables: { customer: { name: "Ana Pop" } },
      },
      {
        userId: "svc_legal_draft",
        callerType: "internal",
        actor: "system",
        isInternalRequest: true,
        organizationId: "org_legal_booking_contract",
        scopes: ["legal:write"],
      },
    )
    expect(internal.value.id).toEqual(expect.any(String))

    const generic = await createDraftForContext(
      "draft-generic-unscoped",
      {
        title: "Generic supplier terms",
        scope: "supplier",
        language: "en",
      },
      {
        userId: "usr_generic_draft",
        callerType: "agent",
        actor: "staff",
        organizationId: "org_legal_booking_contract",
        scopes: ["legal:write"],
      },
    )
    expect(generic.value.id).toEqual(expect.any(String))

    const piiRows = await db
      .select()
      .from(bookingPiiAccessLog)
      .where(eq(bookingPiiAccessLog.bookingId, booking.id))
    expect(piiRows).toHaveLength(3)
    expect(piiRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "read",
          outcome: "denied",
          reason: "insufficient_scope",
          actorId: "usr_denied_draft",
          callerType: "agent",
          metadata: expect.objectContaining({
            routeOrToolName: "legal.create_legal_contract_draft",
            reveal: false,
          }),
        }),
        expect.objectContaining({
          action: "read",
          outcome: "allowed",
          reason: "contract_draft_booking_snapshot_reveal",
          actorId: "usr_scoped_draft",
          callerType: "agent",
          metadata: expect.objectContaining({
            routeOrToolName: "legal.create_legal_contract_draft",
            reveal: true,
          }),
        }),
        expect.objectContaining({
          action: "read",
          outcome: "allowed",
          reason: "contract_draft_booking_snapshot_reveal",
          actorId: "svc_legal_draft",
          callerType: "internal",
          metadata: expect.objectContaining({
            routeOrToolName: "legal.create_legal_contract_draft",
            reveal: true,
          }),
        }),
      ]),
    )
  })

  it("requires bookings-pii:read and audits generic managed document delivery", async () => {
    const { booking, version } = await seedBookingTemplate("BK-DOC-PII")
    const contract = await createDraft("document-delivery-create", {
      title: "Customer agreement",
      bookingId: booking.id,
      templateVersionId: version.id,
      variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 10_00 } },
    })
    const [managedAttachment] = await db
      .insert(contractAttachments)
      .values({
        contractId: contract.value.id,
        kind: "document",
        name: "managed.pdf",
        mimeType: "application/pdf",
        storageKey: "contracts/managed.pdf",
      })
      .returning()
    const [genericContract] = await db
      .insert(contracts)
      .values({ title: "Generic contract", scope: "customer" })
      .returning()
    const [genericAttachment] = await db
      .insert(contractAttachments)
      .values({
        contractId: genericContract!.id,
        kind: "document",
        name: "generic.pdf",
        mimeType: "application/pdf",
        storageKey: "contracts/generic.pdf",
      })
      .returning()

    function app(scopes: string[], userId: string, isInternalRequest = false) {
      const route = new Hono()
      route.onError(handleApiError)
      route.use("*", async (c, next) => {
        c.set("db" as never, db)
        c.set("scopes" as never, scopes)
        c.set("userId" as never, userId)
        c.set("actor" as never, "staff")
        c.set("callerType" as never, isInternalRequest ? "internal" : "session")
        c.set("isInternalRequest" as never, isInternalRequest)
        await next()
      })
      route.route(
        "/",
        createContractsAdminRoutes({
          resolveDocumentDownloadUrl: (_bindings, key) => `https://signed.example.test/${key}`,
        }),
      )
      return route
    }

    const denied = await app(["legal:read"], "usr_denied").request(
      `/attachments/${managedAttachment!.id}/download`,
    )
    expect(denied.status).toBe(404)
    await expect(denied.json()).resolves.toEqual({ error: "Attachment not found" })

    const allowed = await app(["legal:read", "bookings-pii:read"], "usr_allowed").request(
      `/attachments/${managedAttachment!.id}/download`,
    )
    expect(allowed.status).toBe(302)
    expect(allowed.headers.get("location")).toBe(
      "https://signed.example.test/contracts/managed.pdf",
    )

    const internal = await app(["legal:read"], "svc_internal", true).request(
      `/attachments/${managedAttachment!.id}/download`,
    )
    expect(internal.status).toBe(302)
    expect(internal.headers.get("location")).toBe(
      "https://signed.example.test/contracts/managed.pdf",
    )

    const generic = await app(["legal:read"], "usr_generic").request(
      `/attachments/${genericAttachment!.id}/download`,
    )
    expect(generic.status).toBe(302)
    expect(generic.headers.get("location")).toBe(
      "https://signed.example.test/contracts/generic.pdf",
    )

    const piiRows = await db
      .select()
      .from(bookingPiiAccessLog)
      .where(eq(bookingPiiAccessLog.bookingId, booking.id))
    expect(piiRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "read",
          outcome: "denied",
          reason: "insufficient_scope",
          actorId: "usr_denied",
          metadata: expect.objectContaining({ attachmentId: managedAttachment!.id }),
        }),
        expect.objectContaining({
          action: "read",
          outcome: "allowed",
          reason: "contract_document_delivery_reveal",
          actorId: "usr_allowed",
          metadata: expect.objectContaining({ attachmentId: managedAttachment!.id }),
        }),
        expect.objectContaining({
          action: "read",
          outcome: "allowed",
          reason: "contract_document_delivery_reveal",
          actorId: "svc_internal",
          metadata: expect.objectContaining({ attachmentId: managedAttachment!.id }),
        }),
      ]),
    )
  })

  it("rejects admin standalone issue for managed review drafts without mutation or events", async () => {
    const { booking, version } = await seedBookingTemplate("BK-ADMIN-ISSUE-GUARD")
    const managed = await createDraft("admin-issue-managed-create", {
      title: "Customer agreement",
      bookingId: booking.id,
      templateVersionId: version.id,
      variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 10_00 } },
    })
    const [ordinary] = await db
      .insert(contracts)
      .values({ title: "Ordinary draft", scope: "customer" })
      .returning()
    const [beforeManagedIssue] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, managed.value.id))
      .limit(1)
    const lifecycleEvents: Array<Record<string, unknown>> = []
    const eventBus = createEventBus()
    eventBus.subscribe("contract.issued", (event) => {
      lifecycleEvents.push(event as Record<string, unknown>)
    })

    await expect(
      contractsService.issueContract(db, managed.value.id, { eventBus }),
    ).rejects.toMatchObject({
      name: "RequestValidationError",
    })
    await expect(
      db.select().from(contracts).where(eq(contracts.id, managed.value.id)).limit(1),
    ).resolves.toEqual([beforeManagedIssue])
    expect(lifecycleEvents).toHaveLength(0)

    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      await next()
    })
    app.route("/", createContractsAdminRoutes({ eventBus }))

    const rejected = await app.request(`/${managed.value.id}/issue`, { method: "POST" })
    expect(rejected.status).toBe(400)
    await expect(rejected.json()).resolves.toMatchObject({
      error: expect.stringContaining(
        "Booking contract revisions require the reviewed revision and content fingerprint",
      ),
    })
    await expect(
      db.select().from(contracts).where(eq(contracts.id, managed.value.id)).limit(1),
    ).resolves.toEqual([beforeManagedIssue])
    expect(lifecycleEvents).toHaveLength(0)

    const issued = await app.request(`/${ordinary!.id}/issue`, { method: "POST" })
    expect(issued.status).toBe(200)
    await expect(issued.json()).resolves.toMatchObject({
      data: { id: ordinary!.id, status: "issued" },
    })
    expect(lifecycleEvents).toHaveLength(1)
  })

  it("serializes template applicability with immutable draft creation", async () => {
    const { booking, template, version } = await seedBookingTemplate("BK-TEMPLATE-LOCK")

    let releaseCreate: () => void = () => undefined
    const holdCreate = new Promise<void>((resolve) => {
      releaseCreate = resolve
    })
    let createReached: () => void = () => undefined
    const reached = new Promise<void>((resolve) => {
      createReached = resolve
    })
    const createContract: NonNullable<
      Parameters<typeof executeLegalContractDraftCreate>[5]
    > = async (tx, data, options) => {
      createReached()
      await holdCreate
      return contractsService.createContract(tx, data, options)
    }

    const creating = createDraft(
      "template-lock-create",
      {
        title: "Template locked agreement",
        bookingId: booking.id,
        templateVersionId: version.id,
        variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 10_00 } },
      },
      createContract,
    )
    await reached

    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '100ms'`)
        await tx
          .update(contractTemplates)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(contractTemplates.id, template.id))
      }),
    ).rejects.toThrow()

    releaseCreate()
    await expect(creating).resolves.toMatchObject({ value: { id: expect.any(String) } })
    await expect(
      db.select().from(contractTemplates).where(eq(contractTemplates.id, template.id)),
    ).resolves.toEqual([expect.objectContaining({ active: true, currentVersionId: version.id })])
  })

  it("freezes booking review data from one source read while booking items mutate concurrently", async () => {
    const { booking, item, version } = await seedBookingTemplate("BK-SOURCE-SNAPSHOT")
    let releaseSnapshot: () => void = () => undefined
    const holdSnapshot = new Promise<void>((resolve) => {
      releaseSnapshot = resolve
    })
    let sourceRead: () => void = () => undefined
    const sourceWasRead = new Promise<void>((resolve) => {
      sourceRead = resolve
    })

    const creating = createDraft(
      "source-snapshot-create",
      {
        title: "Snapshot source agreement",
        bookingId: booking.id,
        templateVersionId: version.id,
        variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 10_00 } },
      },
      contractsService.createContract,
      {
        async afterBookingReviewSourceRead() {
          sourceRead()
          await holdSnapshot
        },
      },
    )
    await sourceWasRead

    await db
      .update(bookingItems)
      .set({
        title: "Concurrent item",
        productNameSnapshot: "Concurrent product",
        totalSellAmountCents: 200_00,
        updatedAt: new Date(),
      })
      .where(eq(bookingItems.id, item.id))
    releaseSnapshot()

    const created = await creating
    const review = await getBookingContractReview(db, created.value.id)
    expect(review).toMatchObject({
      booking: { id: booking.id, totalAmountCents: 100_00 },
      products: [{ title: "Original tour", quantity: 2, amountCents: 100_00 }],
    })
    await expect(
      db.select().from(bookingItems).where(eq(bookingItems.id, item.id)),
    ).resolves.toEqual([
      expect.objectContaining({
        productNameSnapshot: "Concurrent product",
        totalSellAmountCents: 200_00,
      }),
    ])
  })

  it("serializes same-parent successor creation and rejects the second successor", async () => {
    const { booking, version } = await seedBookingTemplate("BK-RACE-1")
    const parent = await createDraft("parent-create", {
      title: "Parent revision",
      bookingId: booking.id,
      templateVersionId: version.id,
      variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 10_00 } },
    })

    let releaseFirst: () => void = () => undefined
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let firstCreateReached: () => void = () => undefined
    const firstReached = new Promise<void>((resolve) => {
      firstCreateReached = resolve
    })
    const createContract: NonNullable<
      Parameters<typeof executeLegalContractDraftCreate>[5]
    > = async (tx, data) => {
      if (data.title === "Revision A") {
        firstCreateReached()
        await holdFirst
      }
      return contractsService.createContract(tx, data)
    }

    const first = createDraft(
      "successor-a",
      {
        title: "Revision A",
        revisionOfContractId: parent.value.id,
        variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 20_00 } },
      },
      createContract,
    )
    await firstReached
    let secondSettled = false
    const second = createDraft(
      "successor-b",
      {
        title: "Revision B",
        revisionOfContractId: parent.value.id,
        variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 30_00 } },
      },
      createContract,
    ).finally(() => {
      secondSettled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(secondSettled).toBe(false)
    releaseFirst()

    await expect(first).resolves.toMatchObject({ value: { id: expect.any(String) } })
    await expect(second).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "A successor revision already exists for this contract revision.",
    })
    const rows = await db.select().from(contracts).where(eq(contracts.bookingId, booking.id))
    const directSuccessors = rows.filter((row) => {
      const workflow = (
        row.metadata as { bookingContractWorkflow?: { previousRevisionId?: string } }
      ).bookingContractWorkflow
      return workflow?.previousRevisionId === parent.value.id
    })
    expect(directSuccessors).toHaveLength(1)
    const [successor] = directSuccessors
    expect(
      (successor.metadata as { bookingContractWorkflow: { revision: number } })
        .bookingContractWorkflow.revision,
    ).toBe(2)
  })

  it.each([
    ["sent", { sentAt: new Date("2026-07-29T12:00:00.000Z") }],
    ["signed", { sentAt: new Date("2026-07-29T12:00:00.000Z") }],
    [
      "executed",
      {
        sentAt: new Date("2026-07-29T12:00:00.000Z"),
        executedAt: new Date("2026-07-29T12:30:00.000Z"),
      },
    ],
  ] as const)("rejects %s predecessors without creating successors or mutating delivery grants", async (status, statusTimestamps) => {
    const { booking, version } = await seedBookingTemplate(
      `BK-${status.toUpperCase()}-REVISION-GUARD`,
    )
    const parent = await createDraft(`${status}-parent-create`, {
      title: `${status} parent revision`,
      bookingId: booking.id,
      templateVersionId: version.id,
      variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 10_00 } },
    })
    await db
      .update(contracts)
      .set({ status, ...statusTimestamps })
      .where(eq(contracts.id, parent.value.id))
    const [grant] = await db
      .insert(infraPublicDocumentDeliveryGrantsTable)
      .values({
        tokenHash: `${status}-predecessor-token-hash`,
        storageKey: `contracts/${parent.value.id}/document.pdf`,
        sourceModule: "legal",
        sourceEntity: "contract",
        sourceId: parent.value.id,
        expiresAt: new Date("2026-07-30T12:00:00.000Z"),
      })
      .returning()

    await expect(
      createDraft(`reject-${status}-successor-create`, {
        title: "Rejected successor",
        revisionOfContractId: parent.value.id,
        variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 20_00 } },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message:
        "Sent, signed, and executed contract revisions cannot be superseded by a draft revision.",
      meta: { revisionOfContractId: parent.value.id },
    })

    const rows = await db.select().from(contracts).where(eq(contracts.bookingId, booking.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(expect.objectContaining({ id: parent.value.id, status }))
    expect(
      rows.filter((row) => {
        const workflow = (
          row.metadata as { bookingContractWorkflow?: { previousRevisionId?: string } }
        ).bookingContractWorkflow
        return workflow?.previousRevisionId === parent.value.id
      }),
    ).toEqual([])
    await expect(
      db
        .select()
        .from(infraPublicDocumentDeliveryGrantsTable)
        .where(eq(infraPublicDocumentDeliveryGrantsTable.id, grant!.id)),
    ).resolves.toEqual([expect.objectContaining({ revokedAt: null, sourceId: parent.value.id })])
  })

  it("rejects unmanaged predecessors while preserving valid managed successor revisions", async () => {
    const { booking, version } = await seedBookingTemplate("BK-REVISION-GUARD")
    const [unmanaged] = await db
      .insert(contracts)
      .values({
        title: "Editable generic booking contract",
        scope: "customer",
        bookingId: booking.id,
        templateVersionId: version.id,
        metadata: { source: "legacy-admin" },
      })
      .returning()

    await expect(
      createDraft("reject-unmanaged-predecessor", {
        title: "Invalid successor",
        revisionOfContractId: unmanaged!.id,
        variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 10_00 } },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "A contract revision must continue a managed booking review workflow.",
    })
    await expect(
      db.select().from(contracts).where(eq(contracts.bookingId, booking.id)),
    ).resolves.toHaveLength(1)

    const parent = await createDraft("managed-parent-create", {
      title: "Managed parent",
      bookingId: booking.id,
      templateVersionId: version.id,
      variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 10_00 } },
    })
    const [newVersion] = await db
      .insert(contractTemplateVersions)
      .values({
        templateId: version.templateId,
        version: 2,
        body: "Updated hello {{ customer.name }}",
        variableSchema: { required: ["customer.name"] },
      })
      .returning()
    await db
      .update(contractTemplates)
      .set({ currentVersionId: newVersion!.id, updatedAt: new Date() })
      .where(eq(contractTemplates.id, version.templateId))

    const successor = await createDraft("managed-successor-create", {
      title: "Managed successor",
      revisionOfContractId: parent.value.id,
      templateVersionId: newVersion!.id,
      variables: { customer: { name: "Ana Pop" }, commercial: { depositDueCents: 20_00 } },
    })
    const [row] = await db.select().from(contracts).where(eq(contracts.id, successor.value.id))
    expect(row).toEqual(expect.objectContaining({ templateVersionId: newVersion!.id }))
    expect(row?.metadata).toEqual(
      expect.objectContaining({
        bookingContractWorkflow: expect.objectContaining({
          revision: 2,
          previousRevisionId: parent.value.id,
          reviewSnapshot: expect.objectContaining({
            booking: expect.objectContaining({ id: booking.id }),
            template: expect.objectContaining({ versionId: newVersion!.id }),
          }),
        }),
      }),
    )
  })

  async function seedBookingTemplate(bookingNumber = "BK-SNAPSHOT-1") {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber,
        status: "confirmed",
        contactFirstName: "Ana",
        contactLastName: "Pop",
        contactEmail: "ana@example.test",
        contactPhone: "+40700000000",
        contactPreferredLanguage: "en",
        sellCurrency: "EUR",
        sellAmountCents: 100_00,
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      })
      .returning()
    const [item] = await db
      .insert(bookingItems)
      .values({
        bookingId: booking.id,
        title: "Fallback title",
        status: "confirmed",
        productNameSnapshot: "Original tour",
        quantity: 2,
        sellCurrency: "EUR",
        totalSellAmountCents: 100_00,
      })
      .returning()
    const [template] = await db
      .insert(contractTemplates)
      .values({
        name: `Customer ${bookingNumber}`,
        slug: `customer-${bookingNumber.toLowerCase()}`,
        scope: "customer",
        language: "en",
        body: "Hello {{ customer.name }}",
        active: true,
      })
      .returning()
    const [version] = await db
      .insert(contractTemplateVersions)
      .values({
        templateId: template.id,
        version: 1,
        body: "Hello {{ customer.name }}",
        variableSchema: { required: ["customer.name"] },
      })
      .returning()
    await db
      .update(contractTemplates)
      .set({ currentVersionId: version.id })
      .where(eq(contractTemplates.id, template.id))
    return { booking, item, template, version }
  }

  function createDraft(
    idempotencyKey: string,
    input: Parameters<typeof executeLegalContractDraftCreate>[2],
    createContract: Parameters<
      typeof executeLegalContractDraftCreate
    >[5] = contractsService.createContract,
    testHooks?: Parameters<typeof executeLegalContractDraftCreate>[6],
  ) {
    return createDraftForContext(
      idempotencyKey,
      input,
      {
        userId: "usr_legal_booking_contract",
        callerType: "session",
        actor: "staff",
        organizationId: "org_legal_booking_contract",
        scopes: ["legal:write", "bookings-pii:read"],
      },
      createContract,
      testHooks,
    )
  }

  function createDraftForContext(
    idempotencyKey: string,
    input: Parameters<typeof executeLegalContractDraftCreate>[2],
    requestContext: Parameters<typeof executeLegalContractDraftCreate>[1],
    createContract: Parameters<
      typeof executeLegalContractDraftCreate
    >[5] = contractsService.createContract,
    testHooks?: Parameters<typeof executeLegalContractDraftCreate>[6],
  ) {
    return executeLegalContractDraftCreate(
      db,
      requestContext,
      { ...input, idempotencyKey },
      legalDraftAdmission(idempotencyKey),
      async (command, handlers) => {
        const mutation = await command.db.transaction((tx) => handlers.create(tx as never))
        return {
          replayed: false as const,
          value: mutation.value,
          result: {
            entry: {} as never,
            reference: {
              type: "legal-contract",
              id: mutation.targetId,
              value: `legal-contract:${mutation.targetId}` as const,
            },
          },
        }
      },
      createContract,
      testHooks,
    )
  }
})

function legalDraftAdmission(idempotencyKey: string) {
  const expected = LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION
  return {
    capabilityId: expected.capabilityId,
    capabilityVersion: expected.capabilityVersion,
    canonicalName: expected.canonicalName,
    actionPolicy: {
      ...expected.actionPolicy,
      enforcement: "handler" as const,
      invocation: {
        controlField: "_voyant" as const,
        requiredFields: ["confirmed"] as const,
        optionalFields: [] as const,
        fingerprintAlgorithm: "action-ledger-command-v1" as const,
      },
    },
    invocation: { confirmed: true, idempotencyKey },
  }
}
