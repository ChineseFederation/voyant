import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import { bookingItems, bookings, bookingTravelers } from "@voyant-travel/bookings/schema"
import { createEventBus } from "@voyant-travel/core"
import { createDbClient } from "@voyant-travel/db"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { LEGAL_BOOKING_CONTRACT_CONFIRMED_ACTION_ID } from "../../src/booking-contract-confirmed.js"
import {
  createLegalBookingContractConfirmedSubscriber,
  type LegalBookingConfirmedPayload,
} from "../../src/booking-contract-confirmed-subscriber.js"
import { createCommerceLegalRuntime } from "../../src/commerce-runtime.js"
import {
  checksumLegalDocumentBytes,
  LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL,
  type LegalDocumentArtifactProvider,
} from "../../src/contracts/document-artifact-provider.js"
import {
  contractAttachments,
  contractDocumentOperations,
  contractNumberSeries,
  contractSignatures,
  contracts,
  contractTemplates,
  contractTemplateVersions,
} from "../../src/contracts/schema.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type TestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

function provider(): LegalDocumentArtifactProvider {
  const objects = new Map<string, Uint8Array>()
  return {
    identity: {
      id: "test.booking-confirmed-contract",
      version: "1",
      protocol: LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL,
    },
    async render(descriptor) {
      const bytes = new TextEncoder().encode(descriptor.body)
      return {
        bytes,
        checksumSha256: await checksumLegalDocumentBytes(bytes),
        name: "booking-contract.pdf",
        contentType: "application/pdf",
      }
    },
    async put(input) {
      objects.set(input.operationKey, input.artifact.bytes.slice())
      return {
        key: input.operationKey,
        checksumSha256: input.artifact.checksumSha256,
        byteLength: input.artifact.bytes.byteLength,
      }
    },
    async inspect(key) {
      const bytes = objects.get(key)
      return bytes
        ? {
            status: "present" as const,
            key,
            checksumSha256: await checksumLegalDocumentBytes(bytes),
            byteLength: bytes.byteLength,
          }
        : { status: "absent" as const }
    },
    async get(key) {
      return objects.get(key)?.slice() ?? null
    },
    async deleteIfPresent(key) {
      objects.delete(key)
    },
  }
}

describe.skipIf(!DB_AVAILABLE)("booking-confirmed contract generation", () => {
  let db: TestDb

  beforeAll(() => {
    db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 4,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as TestDb
  })
  beforeEach(() => cleanupTestDb(db))
  afterAll(async () => db.$client.end({ timeout: 0 }))

  it("turns booking.confirmed into one ledgered canonical contract document", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: "BK-AUTO-CONTRACT-1",
        status: "confirmed",
        contactFirstName: "Ana",
        contactLastName: "Pop",
        contactEmail: "ana@example.test",
        contactPreferredLanguage: "en",
        sellCurrency: "EUR",
        sellAmountCents: 120_00,
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        pax: 2,
      })
      .returning()
    await db.insert(bookingItems).values({
      bookingId: booking!.id,
      title: "Autumn tour",
      status: "confirmed",
      productNameSnapshot: "Autumn tour",
      quantity: 2,
      sellCurrency: "EUR",
      totalSellAmountCents: 120_00,
    })
    await db.insert(bookingTravelers).values([
      {
        bookingId: booking!.id,
        firstName: "Ana",
        lastName: "Pop",
        email: "ana@example.test",
        travelerCategory: "adult",
        isPrimary: true,
      },
      {
        bookingId: booking!.id,
        firstName: "Mara",
        lastName: "Pop",
        travelerCategory: "child",
      },
    ])
    const [template] = await db
      .insert(contractTemplates)
      .values({
        name: "Customer agreement",
        slug: "customer-agreement-auto",
        scope: "customer",
        language: "en",
        body: "Contract {{ contract.number }} for booking {{ booking.number }}, {{ leadTraveler.fullName }} and {{ travelers.size }} travellers: {{ booking.totalAmountCents | cents: booking.currency }} on {{ contract.date }}",
        active: true,
        isDefault: true,
      })
      .returning()
    const [version] = await db
      .insert(contractTemplateVersions)
      .values({
        templateId: template!.id,
        version: 1,
        body: "Contract {{ contract.number }} for booking {{ booking.number }}, {{ leadTraveler.fullName }} and {{ travelers.size }} travellers: {{ booking.totalAmountCents | cents: booking.currency }} on {{ contract.date }}",
        variableSchema: {
          required: [
            "booking.number",
            "leadTraveler.fullName",
            "booking.totalAmountCents",
            "booking.currency",
            "contract.date",
          ],
        },
      })
      .returning()
    await db
      .update(contractTemplates)
      .set({ currentVersionId: version!.id })
      .where(eq(contractTemplates.id, template!.id))
    const [series] = await db
      .insert(contractNumberSeries)
      .values({
        name: "Customer contracts",
        prefix: "CTR",
        scope: "customer",
        isDefault: true,
        active: true,
        currentSequence: 40,
        padLength: 5,
        separator: "-",
        resetStrategy: "never",
      })
      .returning()
    // Card completion can beat the queued booking.confirmed delivery. Persist
    // that checkpoint before any contract row exists; generation must recover
    // it and promote the accepted draft after producing the document.
    const legal = createCommerceLegalRuntime({} as never)
    await legal.recordBookingPaymentConfirmation(db, booking!.id, "pays_card_1")

    const [acceptedDraft] = await db
      .insert(contracts)
      .values({
        scope: "customer",
        status: "draft",
        title: `Customer agreement — ${booking!.bookingNumber}`,
        templateVersionId: version!.id,
        bookingId: booking!.id,
        language: "en",
        variables: {},
        metadata: {
          autoGenerated: true,
          trigger: "storefront.checkout-acceptance",
          acceptance: {
            templateId: template!.id,
            templateSlug: template!.slug,
            acceptedAt: "2026-08-10T10:00:00.000Z",
            acceptedMarketing: false,
            renderedHtmlLength: 100,
          },
        },
      })
      .returning()

    expect(acceptedDraft).toMatchObject({
      contractNumber: null,
      seriesId: null,
      status: "draft",
    })

    const eventBus = createEventBus({ handlerTimeoutMs: false })
    await createLegalBookingContractConfirmedSubscriber({
      resolveDb: async () => db,
      provider: provider(),
    }).register({ bindings: {}, container: {} as never, eventBus })
    const payload: LegalBookingConfirmedPayload = {
      bookingId: booking!.id,
      bookingNumber: booking!.bookingNumber,
      actorId: null,
    }

    await eventBus.emit("booking.confirmed", payload, {
      eventId: `evt_finance_booking_confirmed_${booking!.id}`,
      category: "domain",
      source: "service",
    })
    await eventBus.emit("booking.confirmed", payload, {
      eventId: `evt_finance_booking_confirmed_${booking!.id}`,
      category: "domain",
      source: "service",
    })

    const contractRows = await db
      .select()
      .from(contracts)
      .where(eq(contracts.bookingId, booking!.id))
    const attachmentRows = await db.select().from(contractAttachments)
    const operationRows = await db
      .select()
      .from(contractDocumentOperations)
      .where(eq(contractDocumentOperations.bookingId, booking!.id))
    const ledgerRows = await db
      .select()
      .from(actionLedgerEntries)
      .where(eq(actionLedgerEntries.actionName, LEGAL_BOOKING_CONTRACT_CONFIRMED_ACTION_ID))

    expect(contractRows).toHaveLength(1)
    expect(contractRows[0]).toMatchObject({
      id: acceptedDraft!.id,
      bookingId: booking!.id,
      templateVersionId: version!.id,
      seriesId: series!.id,
      contractNumber: "CTR-00041",
      status: "signed",
      renderedBody: expect.stringMatching(
        /^Contract CTR-00041 for booking BK-AUTO-CONTRACT-1, Ana Pop and 2 travellers: €120\.00 on \d{4}-\d{2}-\d{2}$/,
      ),
    })
    expect(attachmentRows).toHaveLength(1)
    expect(attachmentRows[0]).toMatchObject({
      contractId: contractRows[0]!.id,
      kind: "document",
      name: "booking-contract.pdf",
    })
    expect(operationRows).toHaveLength(1)
    expect(operationRows[0]).toMatchObject({
      status: "completed",
      principalType: "system",
      renderDescriptor: expect.objectContaining({
        contractNumber: "CTR-00041",
        body: expect.stringContaining("Contract CTR-00041"),
      }),
    })
    expect(ledgerRows).toHaveLength(1)
    expect(ledgerRows[0]).toMatchObject({
      targetType: "booking",
      targetId: booking!.id,
      principalType: "system",
      status: "requested",
      authorizationSource: "selected_graph_event",
    })

    const [signedContract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, contractRows[0]!.id))
    expect(signedContract).toMatchObject({
      status: "signed",
      contractNumber: "CTR-00041",
      seriesId: series!.id,
    })
    expect(
      await db
        .select()
        .from(contractSignatures)
        .where(eq(contractSignatures.contractId, contractRows[0]!.id)),
    ).toHaveLength(1)
  })
})
