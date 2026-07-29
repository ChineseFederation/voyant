import { bookingItems, bookingPiiAccessLog, bookings } from "@voyant-travel/bookings/schema"
import { createDbClient } from "@voyant-travel/db"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import type { ToolContext } from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { getBookingContractReview } from "../../src/booking-contract-review.js"
import { contractsService } from "../../src/contracts/service.js"
import { LEGAL_CONTRACT_DRAFT_HANDLER_EXPECTATION } from "../../src/created-target-policy.js"
import { createLegalToolServices, executeLegalContractDraftCreate } from "../../src/mcp-runtime.js"
import { contracts, contractTemplates, contractTemplateVersions } from "../../src/schema.js"
import { listApplicableBookingContractTemplatesTool } from "../../src/tools.js"
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

    const service = createLegalToolServices(db, undefined, {
      userId: "usr_allowed",
      callerType: "session",
      actor: "staff",
    })
    const allowed = await service.listApplicableBookingTemplates({ bookingId: booking.id })
    expect(allowed).toMatchObject({ bookingFound: true })

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
        }),
        expect.objectContaining({
          action: "read",
          outcome: "allowed",
          reason: "contract_template_applicability_reveal",
          actorId: "usr_allowed",
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

  async function seedBookingTemplate(bookingNumber = "BK-SNAPSHOT-1") {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber,
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
  ) {
    return executeLegalContractDraftCreate(
      db,
      {
        userId: "usr_legal_booking_contract",
        callerType: "session",
        actor: "staff",
        organizationId: "org_legal_booking_contract",
      },
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
