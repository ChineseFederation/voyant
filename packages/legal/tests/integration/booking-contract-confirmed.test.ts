import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import { bookingItems, bookings } from "@voyant-travel/bookings/schema"
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
import {
  checksumLegalDocumentBytes,
  LEGAL_DOCUMENT_ARTIFACT_PROVIDER_PROTOCOL,
  type LegalDocumentArtifactProvider,
} from "../../src/contracts/document-artifact-provider.js"
import {
  contractAttachments,
  contractDocumentOperations,
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
    const [template] = await db
      .insert(contractTemplates)
      .values({
        name: "Customer agreement",
        slug: "customer-agreement-auto",
        scope: "customer",
        language: "en",
        body: "Hello {{ customer.name }}, booking {{ booking.reference }}",
        active: true,
        isDefault: true,
      })
      .returning()
    const [version] = await db
      .insert(contractTemplateVersions)
      .values({
        templateId: template!.id,
        version: 1,
        body: "Hello {{ customer.name }}, booking {{ booking.reference }}",
        variableSchema: { required: ["customer.name", "booking.reference"] },
      })
      .returning()
    await db
      .update(contractTemplates)
      .set({ currentVersionId: version!.id })
      .where(eq(contractTemplates.id, template!.id))

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
      bookingId: booking!.id,
      templateVersionId: version!.id,
      renderedBody: "Hello Ana Pop, booking BK-AUTO-CONTRACT-1",
    })
    expect(attachmentRows).toHaveLength(1)
    expect(attachmentRows[0]).toMatchObject({
      contractId: contractRows[0]!.id,
      kind: "document",
      name: "booking-contract.pdf",
    })
    expect(operationRows).toHaveLength(1)
    expect(operationRows[0]).toMatchObject({ status: "completed", principalType: "system" })
    expect(ledgerRows).toHaveLength(1)
    expect(ledgerRows[0]).toMatchObject({
      targetType: "booking",
      targetId: booking!.id,
      principalType: "system",
      status: "requested",
      authorizationSource: "selected_graph_event",
    })
  })
})
