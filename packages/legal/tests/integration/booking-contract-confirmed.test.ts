import { actionLedgerEntries, actionMutationDetails } from "@voyant-travel/action-ledger/schema"
import { bookingItems, bookings, bookingTravelers } from "@voyant-travel/bookings/schema"
import { createEventBus } from "@voyant-travel/core"
import { createDbClient } from "@voyant-travel/db"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { bookingPaymentSchedules, invoices, payments } from "@voyant-travel/finance/schema"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  generateBookingContractOnConfirmation,
  LEGAL_BOOKING_CONTRACT_CONFIRMED_ACTION_ID,
} from "../../src/booking-contract-confirmed.js"
import {
  createLegalBookingContractConfirmedSubscriber,
  type LegalBookingConfirmedPayload,
} from "../../src/booking-contract-confirmed-subscriber.js"
import { createCommerceLegalRuntime } from "../../src/commerce-runtime.js"
import { bookingContractAcceptanceContentDigest } from "../../src/contract-acceptance.js"
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
          trigger: "public-api.checkout-acceptance",
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

  // voyant#4688: an operator told the agent not to issue a proforma, invoice or
  // contract. The contract was generated ~5s after booking creation anyway,
  // because generation follows from confirmation rather than from a call anyone
  // makes — there was nothing at any layer the instruction could reach.
  it("generates nothing for a booking the operator suppressed documents on", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: "BK-AUTO-CONTRACT-SUPPRESSED",
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
        documentsSuppressed: true,
      })
      .returning()

    const result = await generateBookingContractOnConfirmation({
      db,
      provider: provider(),
      event: {
        data: {
          bookingId: booking!.id,
          bookingNumber: booking!.bookingNumber,
          actorId: null,
        },
        metadata: {
          eventId: `evt_finance_booking_confirmed_${booking!.id}`,
          category: "domain",
          source: "service",
        },
      } as never,
    })

    // Specifically suppression, not "no template" — the refusal happens before
    // any template or series is looked at, so the same booking without a
    // template would have skipped for a different reason.
    expect(result).toEqual({ status: "skipped", reason: "documents_suppressed" })
    expect(
      await db.select().from(contracts).where(eq(contracts.bookingId, booking!.id)),
    ).toHaveLength(0)
    // And no `failed` ledger entry: nothing failed. The booking row carries the
    // reason, so the absence is explained without misreporting a decision.
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.targetId, booking!.id)),
    ).toHaveLength(0)
  })

  // voyant#4634: with no template to render, generation used to return a
  // `skipped` result the subscriber threw away. The booking ended up with no
  // contract, no contract row, an empty Documents tab, and nothing in the
  // action ledger — indistinguishable from a deployment where it works.
  it("records a failed ledger entry when no template can produce the contract", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: "BK-AUTO-CONTRACT-2",
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
    const metadata = {
      eventId: `evt_finance_booking_confirmed_${booking!.id}`,
      category: "domain" as const,
      source: "service" as const,
    }

    await eventBus.emit("booking.confirmed", payload, metadata)
    // Redelivery must replay the entry rather than append a second one.
    await eventBus.emit("booking.confirmed", payload, metadata)
    // And so must a *fresh* confirmation of the same booking failing the same
    // way — `overrideBookingStatus` re-emits `booking.confirmed` on a
    // correction back to confirmed, with a new event id. That id must not
    // reach the fingerprint: the key is booking-and-reason, so a fingerprint
    // that moved under it would throw instead of replaying, and durable
    // delivery would retry a legitimate confirmation into a dead letter.
    await eventBus.emit("booking.confirmed", payload, {
      ...metadata,
      eventId: `evt_finance_booking_reconfirmed_${booking!.id}`,
    })

    const ledgerRows = await db
      .select()
      .from(actionLedgerEntries)
      .where(eq(actionLedgerEntries.targetId, booking!.id))
    expect(ledgerRows).toHaveLength(1)
    expect(ledgerRows[0]).toMatchObject({
      actionName: LEGAL_BOOKING_CONTRACT_CONFIRMED_ACTION_ID,
      targetType: "booking",
      targetId: booking!.id,
      principalType: "system",
      status: "failed",
      authorizationSource: "selected_graph_event",
      idempotencyKey: `booking-confirmed-unfulfilled:${booking!.id}:template_not_found`,
    })
    expect(
      await db
        .select()
        .from(actionMutationDetails)
        .where(eq(actionMutationDetails.actionId, ledgerRows[0]!.id)),
    ).toMatchObject([{ summary: expect.stringContaining("no active customer contract template") }])
    expect(
      await db.select().from(contracts).where(eq(contracts.bookingId, booking!.id)),
    ).toHaveLength(0)
  })

  // voyant#4650: this is the shape of a real Romanian deployment — one market,
  // one active Romanian customer template, an active series, and 311 bookings
  // whose `communication_language` is null because no creation path writes it.
  // Template *selection* already falls back to the deployment's own template;
  // the applicability re-check then discarded it for not being English, so
  // contract generation had never once succeeded through the ordinary path.
  it("generates from the deployment's own template when the booking carries no language", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: "BK-AUTO-CONTRACT-RO",
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
        pax: 2,
      })
      .returning()
    await db.insert(bookingItems).values({
      bookingId: booking!.id,
      title: "Excursie de toamnă",
      status: "confirmed",
      productNameSnapshot: "Excursie de toamnă",
      quantity: 2,
      sellCurrency: "RON",
      totalSellAmountCents: 500_00,
    })
    const body = "Contract {{ contract.number }} pentru rezervarea {{ booking.number }}"
    const [template] = await db
      .insert(contractTemplates)
      .values({
        name: "Contract de comercializare",
        slug: "contract-comercializare",
        scope: "customer",
        language: "ro",
        body,
        active: true,
        isDefault: true,
      })
      .returning()
    const [version] = await db
      .insert(contractTemplateVersions)
      .values({ templateId: template!.id, version: 1, body, variableSchema: {} })
      .returning()
    await db
      .update(contractTemplates)
      .set({ currentVersionId: version!.id })
      .where(eq(contractTemplates.id, template!.id))
    await db.insert(contractNumberSeries).values({
      name: "Contracte clienți",
      prefix: "CTR",
      scope: "customer",
      isDefault: true,
      active: true,
      currentSequence: 0,
      padLength: 5,
      separator: "-",
      resetStrategy: "never",
    })

    const eventBus = createEventBus({ handlerTimeoutMs: false })
    await createLegalBookingContractConfirmedSubscriber({
      resolveDb: async () => db,
      provider: provider(),
    }).register({ bindings: {}, container: {} as never, eventBus })
    await eventBus.emit(
      "booking.confirmed",
      {
        bookingId: booking!.id,
        bookingNumber: booking!.bookingNumber,
        actorId: null,
      } satisfies LegalBookingConfirmedPayload,
      {
        eventId: `evt_finance_booking_confirmed_${booking!.id}`,
        category: "domain",
        source: "service",
      },
    )

    const contractRows = await db
      .select()
      .from(contracts)
      .where(eq(contracts.bookingId, booking!.id))
    expect(contractRows).toHaveLength(1)
    // The document is labelled with the language it is actually written in —
    // the template's — never the "en" the booking's absent fields resolve to.
    expect(contractRows[0]).toMatchObject({
      templateVersionId: version!.id,
      language: "ro",
      contractNumber: "CTR-00001",
      renderedBody: "Contract CTR-00001 pentru rezervarea BK-AUTO-CONTRACT-RO",
    })
    expect(await db.select().from(contractAttachments)).toMatchObject([
      { contractId: contractRows[0]!.id, kind: "document" },
    ])
    const ledgerRows = await db
      .select()
      .from(actionLedgerEntries)
      .where(eq(actionLedgerEntries.targetId, booking!.id))
    expect(ledgerRows).toMatchObject([{ status: "requested" }])
  })

  // voyant#4650: `template.applicableCurrentVersion` names a category, not a
  // comparison. Establishing which comparison failed took a database query
  // against the deployment; the entry now carries it.
  it("records what the template selection compared when prerequisites are missing", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: "BK-AUTO-CONTRACT-DETAIL",
        status: "confirmed",
        contactFirstName: "Ana",
        contactLastName: "Pop",
        contactEmail: "ana@example.test",
        sellCurrency: "RON",
        sellAmountCents: 500_00,
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      })
      .returning()
    const body = "Contract {{ contract.number }}"
    const [template] = await db
      .insert(contractTemplates)
      .values({
        name: "Contract de comercializare",
        slug: "contract-comercializare-detail",
        scope: "customer",
        language: "ro",
        body,
        active: true,
        isDefault: true,
      })
      .returning()
    const [version] = await db
      .insert(contractTemplateVersions)
      .values({ templateId: template!.id, version: 1, body, variableSchema: {} })
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
    await eventBus.emit(
      "booking.confirmed",
      {
        bookingId: booking!.id,
        bookingNumber: booking!.bookingNumber,
        actorId: null,
      } satisfies LegalBookingConfirmedPayload,
      {
        eventId: `evt_finance_booking_confirmed_${booking!.id}`,
        category: "domain",
        source: "service",
      },
    )

    const [ledgerRow] = await db
      .select()
      .from(actionLedgerEntries)
      .where(eq(actionLedgerEntries.targetId, booking!.id))
    expect(ledgerRow).toMatchObject({
      status: "failed",
      idempotencyKey: `booking-confirmed-unfulfilled:${booking!.id}:missing_prerequisites`,
    })
    const [detail] = await db
      .select()
      .from(actionMutationDetails)
      .where(eq(actionMutationDetails.actionId, ledgerRow!.id))
    expect(detail!.summary).toContain("Missing: booking.items")
    expect(detail!.summary).toContain('preferred language "en"')
    expect(detail!.summary).toContain('selected template "Contract de comercializare" in "ro"')
    expect(detail!.summary).toContain("booking channel none")
  })

  // voyant#4690: the auto-generated bag carried the booking's list price and
  // nothing about settlement, so a payment clause branching on
  // `booking.isPaidInFull` took the `else` arm on every contract and printed
  // the missing-value placeholder for each amount — telling a customer who had
  // paid in full that they owed "-". Drive the real subscriber so the
  // assertion is on the persisted rendered body, not on a hand-built bag.
  it("renders the payment clause from settlement on a booking paid in full", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: "BK-AUTO-CONTRACT-PAID",
        status: "confirmed",
        contactFirstName: "Ana",
        contactLastName: "Pop",
        contactEmail: "ana@example.test",
        contactPreferredLanguage: "en",
        sellCurrency: "EUR",
        sellAmountCents: 500_00,
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        pax: 1,
      })
      .returning()
    await db.insert(bookingItems).values({
      bookingId: booking!.id,
      title: "Autumn tour",
      status: "confirmed",
      productNameSnapshot: "Autumn tour",
      quantity: 1,
      sellCurrency: "EUR",
      totalSellAmountCents: 500_00,
    })
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber: "INV-4690-1",
        bookingId: booking!.id,
        status: "paid",
        currency: "EUR",
        subtotalCents: 500_00,
        totalCents: 500_00,
        paidCents: 500_00,
        balanceDueCents: 0,
        issueDate: "2026-08-01",
        dueDate: "2026-08-10",
      })
      .returning()
    // A voided invoice must not resurrect a balance the customer has settled.
    await db.insert(invoices).values({
      invoiceNumber: "PRO-4690-1",
      bookingId: booking!.id,
      invoiceType: "proforma",
      status: "void",
      currency: "EUR",
      subtotalCents: 500_00,
      totalCents: 500_00,
      balanceDueCents: 500_00,
      issueDate: "2026-07-20",
      dueDate: "2026-08-10",
    })
    await db.insert(payments).values([
      {
        invoiceId: invoice!.id,
        amountCents: 200_00,
        currency: "EUR",
        paymentMethod: "bank_transfer",
        status: "completed",
        paymentDate: "2026-08-02",
      },
      {
        invoiceId: invoice!.id,
        amountCents: 300_00,
        currency: "EUR",
        paymentMethod: "credit_card",
        status: "completed",
        paymentDate: "2026-08-05",
      },
      // Not completed, so it must not count toward what has been paid.
      {
        invoiceId: invoice!.id,
        amountCents: 999_00,
        currency: "EUR",
        paymentMethod: "cash",
        status: "pending",
        paymentDate: "2026-08-06",
      },
    ])
    await db.insert(bookingPaymentSchedules).values([
      {
        bookingId: booking!.id,
        scheduleType: "deposit",
        status: "paid",
        dueDate: "2026-08-01",
        currency: "EUR",
        amountCents: 200_00,
      },
      {
        bookingId: booking!.id,
        scheduleType: "balance",
        status: "paid",
        dueDate: "2026-08-05",
        currency: "EUR",
        amountCents: 300_00,
      },
      // Withdrawn obligations are not something a contract may present.
      {
        bookingId: booking!.id,
        scheduleType: "installment",
        status: "cancelled",
        dueDate: "2026-08-09",
        currency: "EUR",
        amountCents: 100_00,
      },
    ])

    const body =
      "{% if booking.isPaidInFull %}Paid in full: {{ booking.paidAmountCents | cents: booking.currency }}" +
      "{% else %}Deposit {{ booking.paidAmountCents | cents: booking.currency }}, " +
      "balance {{ booking.balanceDueCents | cents: booking.currency }} by {{ booking.balanceDueDate }}" +
      "{% endif %} via {{ payment.method }} on {{ payment.latestCompleted.date }}" +
      " over {{ payment.schedule.size }} installments"
    const [template] = await db
      .insert(contractTemplates)
      .values({
        name: "Customer agreement",
        slug: "customer-agreement-settlement",
        scope: "customer",
        language: "en",
        body,
        active: true,
        isDefault: true,
      })
      .returning()
    const [version] = await db
      .insert(contractTemplateVersions)
      .values({ templateId: template!.id, version: 1, body, variableSchema: {} })
      .returning()
    await db
      .update(contractTemplates)
      .set({ currentVersionId: version!.id })
      .where(eq(contractTemplates.id, template!.id))
    await db.insert(contractNumberSeries).values({
      name: "Customer contracts",
      prefix: "CTR",
      scope: "customer",
      isDefault: true,
      active: true,
      currentSequence: 0,
      padLength: 5,
      separator: "-",
      resetStrategy: "never",
    })

    const eventBus = createEventBus({ handlerTimeoutMs: false })
    await createLegalBookingContractConfirmedSubscriber({
      resolveDb: async () => db,
      provider: provider(),
    }).register({ bindings: {}, container: {} as never, eventBus })
    await eventBus.emit(
      "booking.confirmed",
      {
        bookingId: booking!.id,
        bookingNumber: booking!.bookingNumber,
        actorId: null,
      } satisfies LegalBookingConfirmedPayload,
      {
        eventId: `evt_finance_booking_confirmed_${booking!.id}`,
        category: "domain",
        source: "service",
      },
    )

    const contractRows = await db
      .select()
      .from(contracts)
      .where(eq(contracts.bookingId, booking!.id))
    expect(contractRows).toHaveLength(1)
    // Two completed payments, the pending one excluded; the cancelled
    // installment excluded from the schedule; the void proforma excluded from
    // the balance.
    expect(contractRows[0]!.renderedBody).toBe(
      "Paid in full: €500.00 via Credit Card on 2026-08-05 over 2 installments",
    )
  })

  // Review of #4700: a credit note is a NEGATIVE receivable — the
  // profitability rollup signs it the same way. Summing its balance as debt
  // would tell a customer whose invoice was credited that they owe the
  // credited amount back.
  it("nets a credit note out of the balance the contract states", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: "BK-AUTO-CONTRACT-CREDIT",
        status: "confirmed",
        contactFirstName: "Ana",
        contactLastName: "Pop",
        contactEmail: "ana@example.test",
        contactPreferredLanguage: "en",
        sellCurrency: "EUR",
        sellAmountCents: 500_00,
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        pax: 1,
      })
      .returning()
    await db.insert(bookingItems).values({
      bookingId: booking!.id,
      title: "Autumn tour",
      status: "confirmed",
      productNameSnapshot: "Autumn tour",
      quantity: 1,
      sellCurrency: "EUR",
      totalSellAmountCents: 500_00,
    })
    await db.insert(invoices).values({
      invoiceNumber: "INV-4700-1",
      bookingId: booking!.id,
      status: "issued",
      currency: "EUR",
      subtotalCents: 500_00,
      totalCents: 500_00,
      paidCents: 0,
      balanceDueCents: 500_00,
      issueDate: "2026-08-01",
      dueDate: "2026-08-10",
    })
    await db.insert(invoices).values({
      invoiceNumber: "CN-4700-1",
      bookingId: booking!.id,
      invoiceType: "credit_note",
      status: "issued",
      currency: "EUR",
      subtotalCents: 200_00,
      totalCents: 200_00,
      paidCents: 0,
      balanceDueCents: 200_00,
      issueDate: "2026-08-02",
      dueDate: "2026-08-10",
    })

    const body = "Outstanding {{ booking.balanceDueCents | cents: booking.currency }}"
    const [template] = await db
      .insert(contractTemplates)
      .values({
        name: "Customer agreement",
        slug: "customer-agreement-credit-note",
        scope: "customer",
        language: "en",
        body,
        active: true,
        isDefault: true,
      })
      .returning()
    const [version] = await db
      .insert(contractTemplateVersions)
      .values({ templateId: template!.id, version: 1, body, variableSchema: {} })
      .returning()
    await db
      .update(contractTemplates)
      .set({ currentVersionId: version!.id })
      .where(eq(contractTemplates.id, template!.id))
    await db.insert(contractNumberSeries).values({
      name: "Customer contracts",
      prefix: "CTR",
      scope: "customer",
      isDefault: true,
      active: true,
      currentSequence: 0,
      padLength: 5,
      separator: "-",
      resetStrategy: "never",
    })

    const eventBus = createEventBus({ handlerTimeoutMs: false })
    await createLegalBookingContractConfirmedSubscriber({
      resolveDb: async () => db,
      provider: provider(),
    }).register({ bindings: {}, container: {} as never, eventBus })
    await eventBus.emit(
      "booking.confirmed",
      {
        bookingId: booking!.id,
        bookingNumber: booking!.bookingNumber,
        actorId: null,
      } satisfies LegalBookingConfirmedPayload,
      {
        eventId: `evt_finance_booking_confirmed_${booking!.id}`,
        category: "domain",
        source: "service",
      },
    )

    const contractRows = await db
      .select()
      .from(contracts)
      .where(eq(contracts.bookingId, booking!.id))
    // 500 owed less a 200 credit note, not 700.
    expect(contractRows[0]!.renderedBody).toBe("Outstanding €300.00")
  })

  // Review of #4700: the acceptance evidence is a digest over the body the
  // shopper reviewed at checkout, and the shopper reviewed it before paying.
  // A card booking is settled by the time `booking.confirmed` lands, so
  // without a preview-shaped candidate the digest stops matching for exactly
  // the bookings the storefront settles up front — and the accepted contract
  // never passes the promotion gate.
  it("recovers a checkout acceptance whose preview predates the payment", async () => {
    const body =
      "{% if booking.isPaidInFull %}Paid in full{% else %}" +
      "Balance {{ booking.balanceDueCents | cents: booking.currency }}{% endif %}"
    const [template] = await db
      .insert(contractTemplates)
      .values({
        name: "Customer agreement",
        slug: "customer-agreement-acceptance",
        scope: "customer",
        language: "en",
        body,
        active: true,
        isDefault: true,
      })
      .returning()
    const [version] = await db
      .insert(contractTemplateVersions)
      .values({ templateId: template!.id, version: 1, body, variableSchema: {} })
      .returning()
    await db
      .update(contractTemplates)
      .set({ currentVersionId: version!.id })
      .where(eq(contractTemplates.id, template!.id))
    await db.insert(contractNumberSeries).values({
      name: "Customer contracts",
      prefix: "CTR",
      scope: "customer",
      isDefault: true,
      active: true,
      currentSequence: 0,
      padLength: 5,
      separator: "-",
      resetStrategy: "never",
    })

    // What the storefront rendered and the shopper accepted: nothing paid yet.
    const acceptedBody = "Balance €500.00"
    const contentDigest = await bookingContractAcceptanceContentDigest({
      templateId: template!.id,
      templateVersionId: version!.id,
      renderedBody: acceptedBody,
    })
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: "BK-AUTO-CONTRACT-ACCEPT",
        status: "confirmed",
        contactFirstName: "Ana",
        contactLastName: "Pop",
        contactEmail: "ana@example.test",
        contactPreferredLanguage: "en",
        sellCurrency: "EUR",
        sellAmountCents: 500_00,
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        pax: 1,
        internalNotes: `__contract_acceptance__:${JSON.stringify({
          acceptedAt: "2026-08-01T09:00:00.000Z",
          acceptedMarketing: false,
          templateId: template!.id,
          templateVersionId: version!.id,
          contentDigest,
        })}`,
      })
      .returning()
    await db.insert(bookingItems).values({
      bookingId: booking!.id,
      title: "Autumn tour",
      status: "confirmed",
      productNameSnapshot: "Autumn tour",
      quantity: 1,
      sellCurrency: "EUR",
      totalSellAmountCents: 500_00,
    })
    // …and then the card settled, before the confirmation was delivered.
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber: "INV-4700-2",
        bookingId: booking!.id,
        status: "paid",
        currency: "EUR",
        subtotalCents: 500_00,
        totalCents: 500_00,
        paidCents: 500_00,
        balanceDueCents: 0,
        issueDate: "2026-08-01",
        dueDate: "2026-08-10",
      })
      .returning()
    await db.insert(payments).values({
      invoiceId: invoice!.id,
      amountCents: 500_00,
      currency: "EUR",
      paymentMethod: "credit_card",
      status: "completed",
      paymentDate: "2026-08-01",
    })

    const eventBus = createEventBus({ handlerTimeoutMs: false })
    await createLegalBookingContractConfirmedSubscriber({
      resolveDb: async () => db,
      provider: provider(),
    }).register({ bindings: {}, container: {} as never, eventBus })
    await eventBus.emit(
      "booking.confirmed",
      {
        bookingId: booking!.id,
        bookingNumber: booking!.bookingNumber,
        actorId: null,
      } satisfies LegalBookingConfirmedPayload,
      {
        eventId: `evt_finance_booking_confirmed_${booking!.id}`,
        category: "domain",
        source: "service",
      },
    )

    const [contract] = await db.select().from(contracts).where(eq(contracts.bookingId, booking!.id))
    // The canonical document states the truth at confirmation…
    expect(contract!.renderedBody).toBe("Paid in full")
    // …and the acceptance the shopper gave before paying is still recovered.
    expect((contract!.metadata as Record<string, unknown>).acceptance).toMatchObject({
      acceptedAt: "2026-08-01T09:00:00.000Z",
      templateId: template!.id,
      templateVersionId: version!.id,
      contentDigest,
    })
  })
})
