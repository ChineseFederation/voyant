// agent-quality: file-size exception -- owner: finance; existing coverage file stays co-located until a dedicated split preserves behavior and tests.
import { bookingItems, bookings } from "@voyant-travel/bookings/schema"
import { createEventBus } from "@voyant-travel/core"
import { handleApiError } from "@voyant-travel/hono"
import { prepareExternalWebhookEvent } from "@voyant-travel/webhook-delivery"
import { eq, sql } from "drizzle-orm"
import { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { FINANCE_ROUTE_RUNTIME_CONTAINER_KEY } from "../../src/route-runtime.js"
import { financeRoutes } from "../../src/routes.js"
import {
  bookingPaymentSchedules,
  creditNotes,
  invoiceLineItems,
  invoiceNumberSeries,
  invoiceRenditions,
  invoices,
  paymentAuthorizations,
  paymentCaptures,
  paymentSessions,
  payments,
} from "../../src/schema.js"
import { financeService } from "../../src/service.js"
import { financeVoyantModule } from "../../src/voyant.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
const ORIGINAL_TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})
const jsonWithIdempotency = (body: Record<string, unknown>, key: string) => ({
  headers: { "Content-Type": "application/json", "Idempotency-Key": key },
  body: JSON.stringify(body),
})

function projectExternalEvent(eventType: string, event: Record<string, unknown>) {
  const declaration = financeVoyantModule.events.find(
    (candidate) => candidate.eventType === eventType,
  )
  if (!declaration?.eventType || !declaration.version || !declaration.payloadSchema) {
    throw new Error(`Missing external event declaration for ${eventType}.`)
  }
  const envelope = event as Parameters<typeof prepareExternalWebhookEvent>[0]
  return prepareExternalWebhookEvent(
    {
      ...envelope,
      metadata: {
        ...envelope.metadata,
        graphEventId: declaration.id,
        graphEventVersion: declaration.version,
      },
    },
    {
      eventId: declaration.id,
      eventType: declaration.eventType,
      eventVersion: declaration.version,
      payloadSchema: declaration.payloadSchema,
    },
  )
}

let seq = 0
function nextInvoiceNumber() {
  seq++
  return `INV-${String(seq).padStart(5, "0")}`
}
function nextCreditNoteNumber() {
  seq++
  return `CN-${String(seq).padStart(5, "0")}`
}
function nextBookingNumber() {
  seq++
  return `BK-${String(seq).padStart(5, "0")}`
}

function getIsolatedFinanceTestDbUrl(url: string | undefined) {
  if (!url) return url

  try {
    const parsed = new URL(url)
    if (parsed.hostname === "127.0.0.1" && parsed.pathname === "/voyant_test") {
      parsed.pathname = "/voyant_finance_test"
      return parsed.toString()
    }
  } catch {
    return url
  }

  return url
}

async function cleanupFinanceTestData(
  // biome-ignore lint/suspicious/noExplicitAny: test db typing -- owner: finance; existing suppression is intentional pending typed cleanup.
  db: any,
) {
  const tableNames = [
    // The action ledger carries the idempotency records these routes replay
    // against. Leaving them behind meant a rerun against the same database
    // matched a stored key with a different payload fingerprint and answered
    // 409 to the *first* request of a test, not the second.
    "idempotency_keys",
    "action_approvals",
    "action_mutation_details",
    "action_sensitive_read_details",
    "action_ledger_payloads",
    "action_delegations",
    "action_ledger_entries",
    "payment_sessions",
    "supplier_payments",
    "payments",
    "payment_captures",
    "payment_authorizations",
    "payment_instruments",
    "booking_guarantees",
    "booking_payment_schedules",
    "booking_item_commissions",
    "booking_item_tax_lines",
    "finance_notes",
    "invoice_external_refs",
    "invoice_attachments",
    "invoice_renditions",
    "invoice_templates",
    "invoice_number_series",
    "credit_note_line_items",
    "credit_notes",
    "invoice_line_items",
    "invoices",
    "tax_regimes",
    "booking_items",
    "bookings",
    "exchange_rates",
    "fx_rate_sets",
  ]

  const existingTables = (await db.execute<{ tablename: string }>(sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (${sql.join(
        // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        tableNames.map((name) => sql`${name}`),
        sql`, `,
      )})
  `)) as Array<{ tablename: string }>

  if (existingTables.length === 0) {
    return
  }

  const names = existingTables.map((row) => `"${row.tablename}"`).join(", ")
  await db.execute(sql.raw(`TRUNCATE ${names} CASCADE`))
}

describe.skipIf(!DB_AVAILABLE)("Finance routes", () => {
  let app: Hono
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>
  const settlementEvents: Array<Record<string, unknown>> = []
  const paymentCompletedEvents: Array<Record<string, unknown>> = []
  const schedulePaidEvents: Array<Record<string, unknown>> = []
  const invoiceVoidedEvents: Array<Record<string, unknown>> = []
  const invoiceIssuedEvents: Array<Record<string, unknown>> = []
  const proformaConvertedEvents: Array<Record<string, unknown>> = []
  const invoicePaymentRecordedEvents: Array<Record<string, unknown>> = []
  const autoRenditionBookings = new Map<string, { delayMs: number; storageKey: string }>()

  beforeAll(async () => {
    process.env.TEST_DATABASE_URL = getIsolatedFinanceTestDbUrl(process.env.TEST_DATABASE_URL)
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupFinanceTestData(db)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE payment_session_status AS ENUM (
          'pending',
          'requires_redirect',
          'processing',
          'authorized',
          'paid',
          'failed',
          'cancelled',
          'expired'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE payment_session_target_type AS ENUM (
          'booking',
          'order',
          'invoice',
          'booking_payment_schedule',
          'booking_guarantee',
          'other'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_sessions (
        id text PRIMARY KEY NOT NULL,
        target_type payment_session_target_type NOT NULL DEFAULT 'other',
        target_id text,
        booking_id text,
        order_id text,
        invoice_id text,
        booking_payment_schedule_id text,
        booking_guarantee_id text,
        payment_instrument_id text,
        payment_authorization_id text,
        payment_capture_id text,
        payment_id text,
        status payment_session_status NOT NULL DEFAULT 'pending',
        provider text,
        provider_session_id text,
        provider_payment_id text,
        external_reference text,
        idempotency_key text,
        client_reference text,
        currency text NOT NULL,
        amount_cents integer NOT NULL,
        payment_method payment_method,
        payer_person_id text,
        payer_organization_id text,
        payer_email text,
        payer_name text,
        redirect_url text,
        return_url text,
        cancel_url text,
        callback_url text,
        expires_at timestamp with time zone,
        completed_at timestamp with time zone,
        failed_at timestamp with time zone,
        cancelled_at timestamp with time zone,
        expired_at timestamp with time zone,
        failure_code text,
        failure_message text,
        notes text,
        provider_payload jsonb,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_payment_sessions_target ON payment_sessions (target_type, target_id)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_payment_sessions_booking ON payment_sessions (booking_id)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_payment_sessions_order ON payment_sessions (order_id)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_payment_sessions_invoice ON payment_sessions (invoice_id)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_payment_sessions_schedule ON payment_sessions (booking_payment_schedule_id)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_payment_sessions_guarantee ON payment_sessions (booking_guarantee_id)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_payment_sessions_status ON payment_sessions (status)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_payment_sessions_provider ON payment_sessions (provider)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_payment_sessions_provider_session ON payment_sessions (provider_session_id)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_payment_sessions_expires_at ON payment_sessions (expires_at)`,
    )
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS uidx_payment_sessions_idempotency ON payment_sessions (idempotency_key)`,
    )
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoice_attachments (
        id text PRIMARY KEY NOT NULL,
        invoice_id text NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        kind text DEFAULT 'supporting_document' NOT NULL,
        name text NOT NULL,
        mime_type text,
        file_size integer,
        storage_key text,
        checksum text,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_invoice_attachments_invoice ON invoice_attachments (invoice_id)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_invoice_attachments_invoice_created ON invoice_attachments (invoice_id, created_at)`,
    )
    await db.execute(
      sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_at timestamp with time zone`,
    )
    await db.execute(sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_reason text`)

    const eventBus = createEventBus()
    eventBus.subscribe("invoice.settled", (event) => {
      settlementEvents.push(event as Record<string, unknown>)
    })
    eventBus.subscribe("payment.completed", (event) => {
      paymentCompletedEvents.push(event as Record<string, unknown>)
    })
    eventBus.subscribe("booking_payment_schedule.paid", (event) => {
      schedulePaidEvents.push(event as Record<string, unknown>)
    })
    eventBus.subscribe("invoice.voided", (event) => {
      invoiceVoidedEvents.push(event as Record<string, unknown>)
    })
    eventBus.subscribe("invoice.proforma.converted", (event) => {
      proformaConvertedEvents.push(event as Record<string, unknown>)
    })
    eventBus.subscribe("invoice.issued", (event) => {
      invoiceIssuedEvents.push(event as Record<string, unknown>)
      const data = event.data as { invoiceId?: string; bookingId?: string | null }
      if (!data.invoiceId || !data.bookingId) return
      const request = autoRenditionBookings.get(data.bookingId)
      if (!request) return
      setTimeout(() => {
        void financeService.bindInvoiceRendition(db, data.invoiceId!, {
          format: "pdf",
          storageKey: request.storageKey,
          contentType: "application/pdf",
          fileSize: 1024,
        })
      }, request.delayMs)
    })
    eventBus.subscribe("invoice.payment.recorded", (event) => {
      invoicePaymentRecordedEvents.push(event as Record<string, unknown>)
    })
    const financeRouteRuntime = {
      eventBus,
      invoiceSettlementPollers: {},
      invoiceFxSettings: {
        fxCommissionBps: 200,
      },
      resolveDocumentDownloadUrl: (_bindings: unknown, storageKey: string) =>
        `https://files.example/${storageKey}`,
    }
    const containerStub = {
      resolve: <T>(key: string): T => {
        if (key === FINANCE_ROUTE_RUNTIME_CONTAINER_KEY) {
          return financeRouteRuntime as T
        }
        throw new Error(`No provider for ${key}`)
      },
    }

    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      c.set("userId" as never, "test-user-id")
      c.set("container" as never, containerStub)
      await next()
    })
    // The routes signal validation and conflict failures by throwing; turning
    // those into status codes is `createApp`'s job, not each route's. Mounting
    // them on a bare Hono without it made every such case a default 500, so
    // these tests asserted 400/409 against a harness that could not produce
    // one.
    app.onError((err, c) => handleApiError(err, c))
    app.route("/", financeRoutes)
  })

  beforeEach(async () => {
    await cleanupFinanceTestData(db)
    settlementEvents.length = 0
    paymentCompletedEvents.length = 0
    schedulePaidEvents.length = 0
    invoiceVoidedEvents.length = 0
    invoiceIssuedEvents.length = 0
    proformaConvertedEvents.length = 0
    invoicePaymentRecordedEvents.length = 0
    autoRenditionBookings.clear()
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    process.env.TEST_DATABASE_URL = ORIGINAL_TEST_DATABASE_URL
    await closeTestDb()
  })

  // ── Seed helpers ──────────────────────────────────────────────

  async function seedBooking(overrides: Partial<typeof bookings.$inferInsert> = {}) {
    const [row] = await db
      .insert(bookings)
      .values({
        status: "confirmed",
        bookingNumber: nextBookingNumber(),
        sellCurrency: "USD",
        sellAmountCents: 100000,
        costAmountCents: 60000,
        marginPercent: 40,
        startDate: "2025-06-01",
        ...overrides,
      })
      .returning()
    return row!
  }

  async function seedBookingItem(
    bookingId: string,
    overrides: Partial<typeof bookingItems.$inferInsert> = {},
  ) {
    const [row] = await db
      .insert(bookingItems)
      .values({
        status: "confirmed",
        bookingId,
        title: "Test Service",
        quantity: 2,
        sellCurrency: "USD",
        unitSellAmountCents: 5000,
        totalSellAmountCents: 10000,
        ...overrides,
      })
      .returning()
    return row!
  }

  async function seedInvoice(bookingId: string, overrides: Record<string, unknown> = {}) {
    const body = {
      invoiceNumber: nextInvoiceNumber(),
      bookingId,
      currency: "USD",
      issueDate: "2025-06-01",
      dueDate: "2025-07-01",
      subtotalCents: 100000,
      taxCents: 10000,
      totalCents: 110000,
      balanceDueCents: 110000,
      ...overrides,
    }
    const res = await app.request("/invoices", { method: "POST", ...json(body) })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    const created = data as { id: string; [k: string]: unknown }

    // `POST /invoices` has no `invoiceType` in its contract — proformas are
    // only ever minted by the from-booking issuance path — so passing one here
    // was silently dropped and the caller got a plain invoice it believed was
    // a proforma. Apply it directly for the tests that need a proforma to
    // convert; the conversion itself still runs through the route.
    if (typeof overrides.invoiceType === "string" && overrides.invoiceType !== "invoice") {
      const [updated] = await db
        .update(invoices)
        .set({ invoiceType: overrides.invoiceType as "proforma" })
        .where(eq(invoices.id, created.id))
        .returning()
      return { ...created, invoiceType: updated?.invoiceType } as typeof created
    }

    return created
  }

  async function seedPaymentInstrument(overrides: Record<string, unknown> = {}) {
    const body = {
      instrumentType: "credit_card",
      label: "Visa ending 4242",
      brand: "visa",
      last4: "4242",
      ...overrides,
    }
    const res = await app.request("/payment-instruments", { method: "POST", ...json(body) })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    return data as { id: string; [k: string]: unknown }
  }

  async function seedBookingPaymentSchedule(
    bookingId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await app.request(`/bookings/${bookingId}/payment-schedules`, {
      method: "POST",
      ...json({
        dueDate: "2025-06-15",
        currency: "USD",
        amountCents: 25000,
        scheduleType: "deposit",
        ...overrides,
      }),
    })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    return data as { id: string; [k: string]: unknown }
  }

  async function seedInvoiceNumberSeries(
    overrides: Partial<typeof invoiceNumberSeries.$inferInsert> = {},
  ) {
    const [row] = await db
      .insert(invoiceNumberSeries)
      .values({
        code: `series-${seq + 1}`,
        name: "Default invoice series",
        prefix: "INV",
        separator: "-",
        padLength: 4,
        currentSequence: 0,
        scope: "invoice",
        isDefault: true,
        active: true,
        ...overrides,
      })
      .returning()
    return row!
  }

  // ── Payment Instruments ───────────────────────────────────────

  describe("Payment Instruments", () => {
    it("creates a payment instrument with required fields", async () => {
      const pi = await seedPaymentInstrument()
      expect(pi.id).toMatch(/^pmin_/)
      expect(pi.instrumentType).toBe("credit_card")
      expect(pi.label).toBe("Visa ending 4242")
      expect(pi.status).toBe("active")
      expect(pi.ownerType).toBe("client")
    })

    it("creates a payment instrument with all optional fields", async () => {
      const pi = await seedPaymentInstrument({
        ownerType: "supplier",
        instrumentType: "bank_account",
        label: "Business bank",
        provider: "Stripe",
        holderName: "Acme Corp",
        expiryMonth: 12,
        expiryYear: 2028,
        billingEmail: "billing@acme.com",
        notes: "Primary account",
        metadata: { key: "value" },
      })
      expect(pi.ownerType).toBe("supplier")
      expect(pi.provider).toBe("Stripe")
      expect(pi.holderName).toBe("Acme Corp")
      expect(pi.metadata).toEqual({ key: "value" })
    })

    it("gets a payment instrument by id", async () => {
      const pi = await seedPaymentInstrument()
      const res = await app.request(`/payment-instruments/${pi.id}`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.id).toBe(pi.id)
    })

    it("returns 404 for non-existent payment instrument", async () => {
      const res = await app.request("/payment-instruments/pmin_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates a payment instrument", async () => {
      const pi = await seedPaymentInstrument()
      const res = await app.request(`/payment-instruments/${pi.id}`, {
        method: "PATCH",
        ...json({ status: "expired", notes: "Card expired" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("expired")
      expect(data.notes).toBe("Card expired")
    })

    it("deletes a payment instrument", async () => {
      const pi = await seedPaymentInstrument()
      const res = await app.request(`/payment-instruments/${pi.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)

      const check = await app.request(`/payment-instruments/${pi.id}`, { method: "GET" })
      expect(check.status).toBe(404)
    })

    it("lists payment instruments with pagination", async () => {
      await seedPaymentInstrument({ label: "Card A" })
      await seedPaymentInstrument({ label: "Card B" })
      await seedPaymentInstrument({ label: "Card C" })

      const res = await app.request("/payment-instruments?limit=2&offset=0", { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.length).toBe(2)
      expect(body.total).toBe(3)
    })

    it("filters by status", async () => {
      await seedPaymentInstrument({ status: "active" })
      await seedPaymentInstrument({ status: "expired" })
      const res = await app.request("/payment-instruments?status=expired", { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].status).toBe("expired")
    })

    it("searches by label", async () => {
      await seedPaymentInstrument({ label: "Visa Gold" })
      await seedPaymentInstrument({ label: "Mastercard Platinum" })
      const res = await app.request("/payment-instruments?search=Gold", { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].label).toBe("Visa Gold")
    })
  })

  // ── Payment Sessions ──────────────────────────────────────────

  describe("Payment Sessions", () => {
    it("creates and gets a payment session", async () => {
      const booking = await seedBooking()
      const res = await app.request("/payment-sessions", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          currency: "USD",
          amountCents: 15000,
          provider: "netopia",
          idempotencyKey: "session-create-1",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^pmss_/)
      expect(data.targetType).toBe("booking")
      expect(data.targetId).toBe(booking.id)
      expect(data.status).toBe("pending")

      const getRes = await app.request(`/payment-sessions/${data.id}`)
      expect(getRes.status).toBe(200)
      const getBody = await getRes.json()
      expect(getBody.data.id).toBe(data.id)
    })

    it("reuses an existing session when idempotency key matches", async () => {
      const booking = await seedBooking()
      const payload = {
        bookingId: booking.id,
        currency: "USD",
        amountCents: 15000,
        provider: "netopia",
        idempotencyKey: "session-idem-1",
      }

      const first = await app.request("/payment-sessions", { method: "POST", ...json(payload) })
      const second = await app.request("/payment-sessions", { method: "POST", ...json(payload) })

      const firstBody = await first.json()
      const secondBody = await second.json()
      expect(firstBody.data.id).toBe(secondBody.data.id)
    })

    it("marks a payment session as requires_redirect", async () => {
      const booking = await seedBooking()
      const createRes = await app.request("/payment-sessions", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          currency: "USD",
          amountCents: 20000,
        }),
      })
      const { data: session } = await createRes.json()

      const res = await app.request(`/payment-sessions/${session.id}/requires-redirect`, {
        method: "POST",
        ...json({
          redirectUrl: "https://payments.example/redirect",
          providerSessionId: "NETOPIA-123",
          expiresAt: "2025-06-01T10:00:00.000Z",
        }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("requires_redirect")
      expect(data.redirectUrl).toBe("https://payments.example/redirect")
      expect(data.providerSessionId).toBe("NETOPIA-123")
    })

    it("completes a paid invoice-linked session and materializes finance records", async () => {
      const booking = await seedBooking()
      const invoice = await seedInvoice(booking.id, { totalCents: 110000, balanceDueCents: 110000 })
      const paymentInstrument = await seedPaymentInstrument()
      const createRes = await app.request("/payment-sessions", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          invoiceId: invoice.id,
          paymentInstrumentId: paymentInstrument.id,
          currency: "USD",
          amountCents: 110000,
          provider: "netopia",
          paymentMethod: "credit_card",
        }),
      })
      const { data: session } = await createRes.json()

      const res = await app.request(`/payment-sessions/${session.id}/complete`, {
        method: "POST",
        ...json({
          status: "paid",
          paymentMethod: "credit_card",
          paymentInstrumentId: paymentInstrument.id,
          providerPaymentId: "NETOPIA-PAY-1",
          externalAuthorizationId: "NETOPIA-AUTH-1",
          externalCaptureId: "NETOPIA-CAP-1",
          referenceNumber: "REF-1",
          paymentDate: "2025-06-02",
        }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("paid")
      expect(data.paymentAuthorizationId).toMatch(/^pmaz_/)
      expect(data.paymentCaptureId).toMatch(/^pmcp_/)
      expect(data.paymentId).toMatch(/^pay_/)

      const [authorization] = await db
        .select()
        .from(paymentAuthorizations)
        .where(eq(paymentAuthorizations.id, data.paymentAuthorizationId))
      expect(authorization?.status).toBe("captured")

      const [capture] = await db
        .select()
        .from(paymentCaptures)
        .where(eq(paymentCaptures.id, data.paymentCaptureId))
      expect(capture?.status).toBe("completed")

      const [payment] = await db.select().from(payments).where(eq(payments.id, data.paymentId))
      expect(payment?.status).toBe("completed")
      expect(payment?.invoiceId).toBe(invoice.id)

      const invoiceRes = await app.request(`/invoices/${invoice.id}`)
      const invoiceBody = await invoiceRes.json()
      expect(invoiceBody.data.status).toBe("paid")
      expect(invoiceBody.data.paidCents).toBe(110000)
      expect(invoiceBody.data.balanceDueCents).toBe(0)

      // Settling the session via the complete endpoint must fan out
      // `invoice.settled` so plugin callbacks (Netopia and friends) don't
      // need a separate poller — see issue #357.
      expect(settlementEvents).toHaveLength(1)
      expect(settlementEvents[0]?.data).toMatchObject({
        invoiceId: invoice.id,
        paymentId: data.paymentId,
        provider: "netopia",
        newlyAppliedAmountCents: 110000,
        paidCents: 110000,
        balanceDueCents: 0,
      })
      expect(invoicePaymentRecordedEvents).toHaveLength(1)
      expect(invoicePaymentRecordedEvents[0]?.data).toMatchObject({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: "invoice",
        bookingId: booking.id,
        invoiceCurrency: "USD",
        invoiceTotalCents: 110000,
        invoicePaidCents: 110000,
        invoiceBalanceDueCents: 0,
        paymentId: data.paymentId,
        amountCents: 110000,
        currency: "USD",
        paymentMethod: "credit_card",
        status: "completed",
        referenceNumber: "REF-1",
        paymentDate: "2025-06-02",
        occurredAt: expect.any(String),
      })
      expect(
        projectExternalEvent("invoice.payment.recorded", invoicePaymentRecordedEvents[0]!).data,
      ).toEqual({
        invoiceId: invoice.id,
        invoiceType: "invoice",
        invoiceCurrency: "USD",
        invoiceTotalCents: 110000,
        invoicePaidCents: 110000,
        invoiceBalanceDueCents: 0,
        paymentId: data.paymentId,
        amountCents: 110000,
        currency: "USD",
        baseCurrency: null,
        baseAmountCents: null,
        paymentMethod: "credit_card",
        paymentDate: "2025-06-02",
        occurredAt: expect.any(String),
      })
    })

    it("completes a paid session and marks the linked booking schedule as paid", async () => {
      const booking = await seedBooking()
      const schedule = await seedBookingPaymentSchedule(booking.id)
      const invoice = await seedInvoice(booking.id, {
        totalCents: schedule.amountCents,
        balanceDueCents: schedule.amountCents,
      })
      const createRes = await app.request("/payment-sessions", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          bookingPaymentScheduleId: schedule.id,
          currency: "USD",
          amountCents: 25000,
          provider: "netopia",
        }),
      })
      const { data: session } = await createRes.json()

      const res = await app.request(`/payment-sessions/${session.id}/complete`, {
        method: "POST",
        ...json({ status: "paid", paymentMethod: "credit_card" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()

      const [storedSchedule] = await db
        .select()
        .from(bookingPaymentSchedules)
        .where(eq(bookingPaymentSchedules.id, schedule.id))
      expect(storedSchedule?.status).toBe("paid")
      const [payment] = await db.select().from(payments).where(eq(payments.id, data.paymentId))
      expect(payment?.status).toBe("completed")
      expect(payment?.invoiceId).toBe(invoice.id)

      const [storedInvoice] = await db.select().from(invoices).where(eq(invoices.id, invoice.id))
      expect(storedInvoice?.paidCents).toBe(schedule.amountCents)
      expect(storedInvoice?.balanceDueCents).toBe(0)
      expect(storedInvoice?.status).toBe("paid")
      expect(schedulePaidEvents).toHaveLength(1)
      expect(schedulePaidEvents[0]?.data).toMatchObject({
        bookingId: booking.id,
        bookingPaymentScheduleId: schedule.id,
        paymentSessionId: session.id,
        paymentId: data.paymentId,
        scheduleType: schedule.scheduleType,
        amountCents: schedule.amountCents,
        currency: schedule.currency,
        provider: "netopia",
      })
      expect(paymentCompletedEvents).toHaveLength(1)
      expect(paymentCompletedEvents[0]?.data).toMatchObject({
        paymentSessionId: session.id,
        targetType: "booking_payment_schedule",
        targetId: schedule.id,
        bookingId: booking.id,
        invoiceId: invoice.id,
        bookingPaymentScheduleId: schedule.id,
        bookingGuaranteeId: null,
        amountCents: 25000,
        currency: "USD",
        provider: "netopia",
      })

      const retryRes = await app.request(`/payment-sessions/${session.id}/complete`, {
        method: "POST",
        ...json({ status: "paid", paymentMethod: "credit_card" }),
      })
      expect(retryRes.status).toBe(200)
      expect(schedulePaidEvents).toHaveLength(1)
    })

    it("does not double-count one payment linked by multiple paid sessions", async () => {
      const booking = await seedBooking()
      const schedule = await seedBookingPaymentSchedule(booking.id, { amountCents: 10000 })
      const invoice = await seedInvoice(booking.id, { totalCents: 10000, balanceDueCents: 10000 })

      const paymentRes = await app.request(`/invoices/${invoice.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 6000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-20",
          status: "completed",
        }),
      })
      expect(paymentRes.status).toBe(201)
      const { data: payment } = await paymentRes.json()

      for (const clientReference of ["duplicate-a", "duplicate-b"]) {
        const sessionRes = await app.request("/payment-sessions", {
          method: "POST",
          ...json({
            targetType: "booking_payment_schedule",
            targetId: schedule.id,
            bookingId: booking.id,
            invoiceId: invoice.id,
            bookingPaymentScheduleId: schedule.id,
            paymentId: payment.id,
            status: "paid",
            currency: "USD",
            amountCents: 6000,
            clientReference,
          }),
        })
        expect(sessionRes.status).toBe(201)
      }

      const res = await app.request(`/bookings/${booking.id}/payment-schedules/${schedule.id}`, {
        method: "PATCH",
        ...json({ status: "paid" }),
      })
      expect(res.status).toBe(400)

      const [storedSchedule] = await db
        .select()
        .from(bookingPaymentSchedules)
        .where(eq(bookingPaymentSchedules.id, schedule.id))
      expect(storedSchedule?.status).toBe("pending")
    })

    it("rejects completing a paid booking schedule session when no invoice can receive the payment", async () => {
      const booking = await seedBooking()
      const schedule = await seedBookingPaymentSchedule(booking.id)
      const createRes = await app.request("/payment-sessions", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          bookingPaymentScheduleId: schedule.id,
          currency: "USD",
          amountCents: 25000,
          provider: "netopia",
        }),
      })
      const { data: session } = await createRes.json()

      const res = await app.request(`/payment-sessions/${session.id}/complete`, {
        method: "POST",
        ...json({ status: "paid", paymentMethod: "credit_card" }),
      })
      expect(res.status).toBe(400)

      const [storedSchedule] = await db
        .select()
        .from(bookingPaymentSchedules)
        .where(eq(bookingPaymentSchedules.id, schedule.id))
      expect(storedSchedule?.status).toBe("pending")

      const storedPayments = await db.select().from(payments)
      expect(storedPayments).toHaveLength(0)
    })

    it("fails and lists payment sessions by status", async () => {
      const booking = await seedBooking()
      const createRes = await app.request("/payment-sessions", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          currency: "USD",
          amountCents: 9999,
          provider: "netopia",
        }),
      })
      const { data: session } = await createRes.json()

      const failRes = await app.request(`/payment-sessions/${session.id}/fail`, {
        method: "POST",
        ...json({ failureCode: "DECLINED", failureMessage: "Card declined" }),
      })
      expect(failRes.status).toBe(200)

      const [stored] = await db
        .select()
        .from(paymentSessions)
        .where(eq(paymentSessions.id, session.id))
      expect(stored?.status).toBe("failed")
      expect(stored?.failureCode).toBe("DECLINED")

      const listRes = await app.request("/payment-sessions?status=failed")
      const listBody = await listRes.json()
      expect(listBody.total).toBe(1)
      expect(listBody.data[0].id).toBe(session.id)
    })

    it("creates a payment session from a booking payment schedule", async () => {
      const booking = await seedBooking()
      const schedule = await seedBookingPaymentSchedule(booking.id, {
        currency: "EUR",
        amountCents: 18000,
        scheduleType: "balance",
      })

      const res = await app.request(
        `/bookings/${booking.id}/payment-schedules/${schedule.id}/payment-session`,
        {
          method: "POST",
          ...json({
            provider: "netopia",
            payerEmail: "traveler@example.com",
            payerName: "Ana Popescu",
            clientReference: "balance-collect-1",
          }),
        },
      )

      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.targetType).toBe("booking_payment_schedule")
      expect(data.targetId).toBe(schedule.id)
      expect(data.bookingPaymentScheduleId).toBe(schedule.id)
      expect(data.currency).toBe("EUR")
      expect(data.amountCents).toBe(18000)
      expect(data.provider).toBe("netopia")
    })

    it("creates a payment session from an invoice balance", async () => {
      const booking = await seedBooking()
      const invoice = await seedInvoice(booking.id, {
        totalCents: 125000,
        paidCents: 25000,
        balanceDueCents: 100000,
      })

      const res = await app.request(`/invoices/${invoice.id}/payment-session`, {
        method: "POST",
        ...json({
          provider: "netopia",
          payerEmail: "traveler@example.com",
          returnUrl: "https://app.example.com/payments/return",
        }),
      })

      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.targetType).toBe("invoice")
      expect(data.targetId).toBe(invoice.id)
      expect(data.invoiceId).toBe(invoice.id)
      expect(data.amountCents).toBe(100000)
      expect(data.provider).toBe("netopia")
      expect(data.payerEmail).toBe("traveler@example.com")
    })

    it("creates a payment session from a booking guarantee", async () => {
      const booking = await seedBooking()
      const createGuaranteeRes = await app.request(`/bookings/${booking.id}/guarantees`, {
        method: "POST",
        ...json({
          guaranteeType: "deposit",
          currency: "USD",
          amountCents: 5000,
          provider: "netopia",
          referenceNumber: "guarantee-ref-1",
        }),
      })
      expect(createGuaranteeRes.status).toBe(201)
      const { data: guarantee } = await createGuaranteeRes.json()

      const res = await app.request(
        `/bookings/${booking.id}/guarantees/${guarantee.id}/payment-session`,
        {
          method: "POST",
          ...json({
            payerEmail: "traveler@example.com",
            payerName: "Ana Popescu",
          }),
        },
      )

      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.targetType).toBe("booking_guarantee")
      expect(data.targetId).toBe(guarantee.id)
      expect(data.bookingGuaranteeId).toBe(guarantee.id)
      expect(data.amountCents).toBe(5000)
      expect(data.provider).toBe("netopia")
      expect(data.externalReference).toBe("guarantee-ref-1")
    })
  })

  // ── Payment Authorizations ────────────────────────────────────

  describe("Payment Authorizations", () => {
    it("creates a payment authorization", async () => {
      const res = await app.request("/payment-authorizations", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 50000 }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^pmaz_/)
      expect(data.status).toBe("pending")
      expect(data.captureMode).toBe("manual")
      expect(data.amountCents).toBe(50000)
    })

    it("rejects zero-value payment authorizations", async () => {
      const res = await app.request("/payment-authorizations", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 0 }),
      })
      expect(res.status).toBe(400)
    })

    it("gets a payment authorization by id", async () => {
      const createRes = await app.request("/payment-authorizations", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 10000 }),
      })
      const { data: auth } = await createRes.json()
      const res = await app.request(`/payment-authorizations/${auth.id}`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.id).toBe(auth.id)
    })

    it("returns 404 for non-existent authorization", async () => {
      const res = await app.request("/payment-authorizations/pmaz_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates a payment authorization", async () => {
      const createRes = await app.request("/payment-authorizations", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 10000 }),
      })
      const { data: auth } = await createRes.json()
      const res = await app.request(`/payment-authorizations/${auth.id}`, {
        method: "PATCH",
        ...json({ status: "authorized", approvalCode: "AUTH-001" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("authorized")
      expect(data.approvalCode).toBe("AUTH-001")
    })

    it("deletes a payment authorization", async () => {
      const createRes = await app.request("/payment-authorizations", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 10000 }),
      })
      const { data: auth } = await createRes.json()
      const res = await app.request(`/payment-authorizations/${auth.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })

    it("lists payment authorizations with filters", async () => {
      await app.request("/payment-authorizations", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 10000 }),
      })
      await app.request("/payment-authorizations", {
        method: "POST",
        ...json({ currency: "EUR", amountCents: 20000, status: "authorized" }),
      })
      const res = await app.request("/payment-authorizations?status=authorized", { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].status).toBe("authorized")
    })
  })

  // ── Payment Captures ──────────────────────────────────────────

  describe("Payment Captures", () => {
    it("creates a payment capture", async () => {
      const res = await app.request("/payment-captures", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 25000 }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^pmcp_/)
      expect(data.status).toBe("pending")
      expect(data.amountCents).toBe(25000)
    })

    it("rejects zero-value payment captures", async () => {
      const res = await app.request("/payment-captures", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 0 }),
      })
      expect(res.status).toBe(400)
    })

    it("gets a capture by id", async () => {
      const createRes = await app.request("/payment-captures", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 5000 }),
      })
      const { data: cap } = await createRes.json()
      const res = await app.request(`/payment-captures/${cap.id}`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.id).toBe(cap.id)
    })

    it("returns 404 for non-existent capture", async () => {
      const res = await app.request("/payment-captures/pmcp_00000000000000000000000000", {
        method: "GET",
      })
      expect(res.status).toBe(404)
    })

    it("updates a capture", async () => {
      const createRes = await app.request("/payment-captures", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 5000 }),
      })
      const { data: cap } = await createRes.json()
      const res = await app.request(`/payment-captures/${cap.id}`, {
        method: "PATCH",
        ...json({ status: "completed" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("completed")
    })

    it("deletes a capture", async () => {
      const createRes = await app.request("/payment-captures", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 5000 }),
      })
      const { data: cap } = await createRes.json()
      const res = await app.request(`/payment-captures/${cap.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
    })

    it("lists captures with filters", async () => {
      await app.request("/payment-captures", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 1000 }),
      })
      await app.request("/payment-captures", {
        method: "POST",
        ...json({ currency: "USD", amountCents: 2000, status: "completed" }),
      })
      const res = await app.request("/payment-captures?status=completed", { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
    })
  })

  // ── Invoices ──────────────────────────────────────────────────

  describe("Invoices", () => {
    it("creates an invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)
      expect(inv.id).toMatch(/^inv_/)
      expect(inv.status).toBe("draft")
      expect(inv.bookingId).toBe(booking.id)
      expect(inv.currency).toBe("USD")
    })

    it("returns 409 when creating a duplicate direct invoice number", async () => {
      const booking = await seedBooking()
      const invoiceNumber = nextInvoiceNumber()
      await seedInvoice(booking.id, { invoiceNumber })

      const res = await app.request("/invoices", {
        method: "POST",
        ...json({
          invoiceNumber,
          bookingId: booking.id,
          currency: "USD",
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
          subtotalCents: 100000,
          taxCents: 10000,
          totalCents: 110000,
          balanceDueCents: 110000,
        }),
      })

      expect(res.status).toBe(409)
      await expect(res.json()).resolves.toMatchObject({
        error: "Invoice number already exists",
        code: "invoice_number_conflict",
        invoiceNumber,
      })
    })

    it("rejects direct invoice creation for missing references", async () => {
      const missingBooking = await app.request("/invoices", {
        method: "POST",
        ...json({
          invoiceNumber: nextInvoiceNumber(),
          bookingId: "bk_missing",
          currency: "USD",
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
        }),
      })
      expect(missingBooking.status).toBe(404)
      await expect(missingBooking.json()).resolves.toMatchObject({
        code: "booking_not_found",
      })

      const booking = await seedBooking()
      const missingPerson = await app.request("/invoices", {
        method: "POST",
        ...json({
          invoiceNumber: nextInvoiceNumber(),
          bookingId: booking.id,
          personId: "person_missing",
          currency: "USD",
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
        }),
      })
      expect(missingPerson.status).toBe(404)
      await expect(missingPerson.json()).resolves.toMatchObject({
        code: "person_not_found",
      })

      const missingOrganization = await app.request("/invoices", {
        method: "POST",
        ...json({
          invoiceNumber: nextInvoiceNumber(),
          bookingId: booking.id,
          organizationId: "org_missing",
          currency: "USD",
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
        }),
      })
      expect(missingOrganization.status).toBe(404)
      await expect(missingOrganization.json()).resolves.toMatchObject({
        code: "organization_not_found",
      })
    })

    it("replays invoice creates with the same idempotency key", async () => {
      const booking = await seedBooking()
      const input = {
        invoiceNumber: nextInvoiceNumber(),
        bookingId: booking.id,
        currency: "USD",
        issueDate: "2025-06-01",
        dueDate: "2025-07-01",
        subtotalCents: 100000,
        taxCents: 10000,
        totalCents: 110000,
        balanceDueCents: 110000,
      }

      const first = await app.request("/invoices", {
        method: "POST",
        ...jsonWithIdempotency(input, "finance-invoice-create-1"),
      })
      const replay = await app.request("/invoices", {
        method: "POST",
        ...jsonWithIdempotency(input, "finance-invoice-create-1"),
      })

      expect(first.status).toBe(201)
      expect(replay.status).toBe(201)
      expect(replay.headers.get("Idempotency-Replayed")).toBe("true")
      const firstBody = await first.json()
      const replayBody = await replay.json()
      expect(replayBody.data.id).toBe(firstBody.data.id)

      // Reusing the number just issued must conflict. The body has to be a
      // valid from-booking request to get that far — the invoice-create shape
      // this used to send is rejected by the route's schema now, so the 409 it
      // asserted could never be reached.
      const conflict = await app.request("/invoices/from-booking?wait=pdf", {
        method: "POST",
        ...jsonWithIdempotency(
          {
            bookingId: booking.id,
            invoiceNumber: input.invoiceNumber,
            issueDate: input.issueDate,
            dueDate: input.dueDate,
          },
          "finance-invoice-from-booking-1",
        ),
      })
      expect(conflict.status).toBe(409)
    })

    it("gets an invoice by id", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)
      const res = await app.request(`/invoices/${inv.id}`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.id).toBe(inv.id)
    })

    it("returns 404 for non-existent invoice", async () => {
      const res = await app.request("/invoices/inv_00000000000000000000000000", { method: "GET" })
      expect(res.status).toBe(404)
    })

    it("updates an invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)
      const res = await app.request(`/invoices/${inv.id}`, {
        method: "PATCH",
        ...json({ status: "issued", notes: "Sent to client" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("issued")
      expect(data.notes).toBe("Sent to client")
    })

    it("deletes a draft invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)
      const res = await app.request(`/invoices/${inv.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)

      const check = await app.request(`/invoices/${inv.id}`, { method: "GET" })
      expect(check.status).toBe(404)
    })

    it("rejects deleting a non-draft invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, { status: "issued" })
      const res = await app.request(`/invoices/${inv.id}`, { method: "DELETE" })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("draft")
    })

    it("voids an issued invoice and emits an event", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, {
        status: "issued",
        balanceDueCents: 110000,
      })
      const res = await app.request(`/invoices/${inv.id}/void`, {
        method: "POST",
        ...json({ reason: "Incorrect client details" }),
      })

      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("void")
      expect(data.balanceDueCents).toBe(0)
      expect(data.voidReason).toBe("Incorrect client details")
      expect(data.voidedAt).toBeTruthy()
      expect(invoiceVoidedEvents).toHaveLength(1)
      expect(invoiceVoidedEvents[0]?.data).toMatchObject({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        reason: "Incorrect client details",
        occurredAt: expect.any(String),
      })
      expect(projectExternalEvent("invoice.voided", invoiceVoidedEvents[0]!).data).toEqual({
        invoiceId: inv.id,
        invoiceType: "invoice",
        occurredAt: data.voidedAt,
      })
    })

    it("rejects voiding a draft invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const res = await app.request(`/invoices/${inv.id}/void`, {
        method: "POST",
        ...json({}),
      })

      expect(res.status).toBe(400)
      expect(invoiceVoidedEvents).toHaveLength(0)
    })

    it("rejects voiding an invoice with payments", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, {
        status: "issued",
        totalCents: 50000,
        balanceDueCents: 50000,
      })
      const payment = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 1000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          status: "completed",
          paymentDate: "2025-06-02",
        }),
      })
      expect(payment.status).toBe(201)

      const res = await app.request(`/invoices/${inv.id}/void`, {
        method: "POST",
        ...json({}),
      })

      expect(res.status).toBe(409)
      expect(invoiceVoidedEvents).toHaveLength(0)
    })

    it("rejects voiding an invoice with credit notes", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, { status: "issued" })
      await db.insert(creditNotes).values({
        creditNoteNumber: nextCreditNoteNumber(),
        invoiceId: inv.id,
        amountCents: 1000,
        currency: "USD",
        reason: "Adjustment",
      })

      const res = await app.request(`/invoices/${inv.id}/void`, {
        method: "POST",
        ...json({}),
      })

      expect(res.status).toBe(409)
      expect(invoiceVoidedEvents).toHaveLength(0)
    })

    it("converts proformas with void audit metadata and a conversion event", async () => {
      const booking = await seedBooking()
      const proforma = await seedInvoice(booking.id, {
        invoiceNumber: "PRO-1269-A",
        invoiceType: "proforma",
        status: "issued",
        totalCents: 50000,
        paidCents: 10000,
        balanceDueCents: 40000,
        notes: "Proforma pentru Ana Popescu / City tour, 2 persoane.",
      })
      const payment = await app.request(`/invoices/${proforma.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 10000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          status: "completed",
          paymentDate: "2026-05-25",
        }),
      })
      expect(payment.status).toBe(201)
      invoiceIssuedEvents.length = 0

      const res = await app.request(`/invoices/${proforma.id}/convert-to-invoice`, {
        method: "POST",
        ...json({ invoiceNumber: "INV-1269-A" }),
      })

      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data).toMatchObject({
        invoiceNumber: "INV-1269-A",
        invoiceType: "invoice",
        convertedFromInvoiceId: proforma.id,
        paidCents: 10000,
        balanceDueCents: 40000,
        notes: null,
      })
      const refreshedProforma = await financeService.getInvoiceById(db, proforma.id)
      expect(refreshedProforma).toMatchObject({
        status: "void",
        paidCents: 0,
        balanceDueCents: 0,
        voidReason: "Converted to invoice INV-1269-A",
      })
      expect(refreshedProforma?.voidedAt).toBeTruthy()
      const reassignedPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, data.id))
      expect(reassignedPayments).toHaveLength(1)
      expect(invoiceIssuedEvents).toHaveLength(1)
      expect(invoiceIssuedEvents[0]?.data).toMatchObject({
        invoiceId: data.id,
        invoiceType: "invoice",
        convertedFromInvoiceId: proforma.id,
      })
      expect(proformaConvertedEvents).toHaveLength(1)
      expect(proformaConvertedEvents[0]?.data).toMatchObject({
        id: data.id,
        invoiceId: data.id,
        proformaId: proforma.id,
        proformaInvoiceNumber: "PRO-1269-A",
        convertedFromInvoiceId: proforma.id,
        occurredAt: expect.any(String),
        lineage: {
          sourceDocumentId: proforma.id,
          successorDocumentId: data.id,
        },
      })
      const projected = projectExternalEvent(
        "invoice.proforma.converted",
        proformaConvertedEvents[0]!,
      )
      expect(projected.data).toEqual({
        invoiceId: data.id,
        invoiceType: "invoice",
        occurredAt: expect.any(String),
        lineage: {
          sourceDocumentId: proforma.id,
          successorDocumentId: data.id,
        },
      })
    })

    it("returns the existing invoice when converting an already converted proforma", async () => {
      const booking = await seedBooking()
      const proforma = await seedInvoice(booking.id, {
        invoiceNumber: "PRO-CONVERT-IDEMPOTENT",
        invoiceType: "proforma",
        status: "issued",
        totalCents: 75000,
        balanceDueCents: 75000,
      })
      const first = await app.request(`/invoices/${proforma.id}/convert-to-invoice`, {
        method: "POST",
        ...json({ invoiceNumber: "INV-CONVERT-IDEMPOTENT" }),
      })
      expect(first.status).toBe(201)
      const { data: invoice } = await first.json()
      invoiceIssuedEvents.length = 0
      proformaConvertedEvents.length = 0

      const second = await app.request(`/invoices/${proforma.id}/convert-to-invoice`, {
        method: "POST",
        ...json({ invoiceNumber: "INV-CONVERT-IDEMPOTENT-RETRY" }),
      })

      expect(second.status).toBe(409)
      await expect(second.json()).resolves.toMatchObject({
        code: "proforma_already_converted",
        existingInvoiceId: invoice.id,
        existingInvoiceNumber: "INV-CONVERT-IDEMPOTENT",
      })
      const converted = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.convertedFromInvoiceId, proforma.id))
      expect(converted).toHaveLength(1)
      expect(invoiceIssuedEvents).toHaveLength(0)
      expect(proformaConvertedEvents).toHaveLength(0)
    })

    it("rejects converting a sibling duplicate proforma when a fiscal invoice already exists", async () => {
      const booking = await seedBooking()
      const proformaA = await seedInvoice(booking.id, {
        invoiceNumber: "PRO-SIBLING-DUP-A",
        invoiceType: "proforma",
        status: "issued",
        totalCents: 88000,
        balanceDueCents: 88000,
      })
      const proformaB = await seedInvoice(booking.id, {
        invoiceNumber: "PRO-SIBLING-DUP-B",
        invoiceType: "proforma",
        status: "issued",
        totalCents: 88000,
        balanceDueCents: 88000,
      })
      const first = await app.request(`/invoices/${proformaA.id}/convert-to-invoice`, {
        method: "POST",
        ...json({ invoiceNumber: "INV-SIBLING-DUP-A" }),
      })
      expect(first.status).toBe(201)
      const { data: existingInvoice } = await first.json()
      invoiceIssuedEvents.length = 0
      proformaConvertedEvents.length = 0

      const second = await app.request(`/invoices/${proformaB.id}/convert-to-invoice`, {
        method: "POST",
        ...json({ invoiceNumber: "INV-SIBLING-DUP-B" }),
      })

      expect(second.status).toBe(409)
      await expect(second.json()).resolves.toMatchObject({
        code: "duplicate_fiscal_invoice",
        existingInvoiceId: existingInvoice.id,
        existingInvoiceNumber: "INV-SIBLING-DUP-A",
      })
      const refreshedProforma = await financeService.getInvoiceById(db, proformaB.id)
      expect(refreshedProforma).toMatchObject({
        status: "issued",
        voidedAt: null,
        voidReason: null,
      })
      const converted = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.convertedFromInvoiceId, proformaB.id))
      expect(converted).toHaveLength(0)
      expect(invoiceIssuedEvents).toHaveLength(0)
      expect(proformaConvertedEvents).toHaveLength(0)
    })

    it("rejects converting a proforma when a regular fiscal invoice already exists", async () => {
      const booking = await seedBooking()
      const existingInvoice = await seedInvoice(booking.id, {
        invoiceNumber: "INV-REGULAR-DUP",
        invoiceType: "invoice",
        status: "issued",
        totalCents: 66000,
        balanceDueCents: 66000,
      })
      const proforma = await seedInvoice(booking.id, {
        invoiceNumber: "PRO-REGULAR-DUP",
        invoiceType: "proforma",
        status: "issued",
        totalCents: 66000,
        balanceDueCents: 66000,
      })
      invoiceIssuedEvents.length = 0
      proformaConvertedEvents.length = 0

      const res = await app.request(`/invoices/${proforma.id}/convert-to-invoice`, {
        method: "POST",
        ...json({ invoiceNumber: "INV-REGULAR-DUP-CONVERTED" }),
      })

      expect(res.status).toBe(409)
      await expect(res.json()).resolves.toMatchObject({
        code: "duplicate_fiscal_invoice",
        existingInvoiceId: existingInvoice.id,
        existingInvoiceNumber: "INV-REGULAR-DUP",
      })
      const refreshedProforma = await financeService.getInvoiceById(db, proforma.id)
      expect(refreshedProforma).toMatchObject({
        status: "issued",
        voidedAt: null,
        voidReason: null,
      })
      const converted = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.convertedFromInvoiceId, proforma.id))
      expect(converted).toHaveLength(0)
      expect(invoiceIssuedEvents).toHaveLength(0)
      expect(proformaConvertedEvents).toHaveLength(0)
    })

    it("returns a conflict when conversion would reuse an active invoice number", async () => {
      const booking = await seedBooking()
      // The colliding invoice belongs to a *different* booking on purpose: on
      // the same one the duplicate-fiscal-invoice guard fires first and this
      // test never reaches the number-uniqueness check it is named for.
      const otherBooking = await seedBooking()
      await seedInvoice(otherBooking.id, {
        invoiceNumber: "INV-CONVERT-DUP",
        invoiceType: "invoice",
        status: "issued",
      })
      const proforma = await seedInvoice(booking.id, {
        invoiceNumber: "PRO-CONVERT-DUP",
        invoiceType: "proforma",
        status: "issued",
      })
      invoiceIssuedEvents.length = 0

      const res = await app.request(`/invoices/${proforma.id}/convert-to-invoice`, {
        method: "POST",
        ...json({ invoiceNumber: "INV-CONVERT-DUP" }),
      })

      expect(res.status).toBe(409)
      await expect(res.json()).resolves.toMatchObject({
        code: "invoice_number_conflict",
        invoiceNumber: "INV-CONVERT-DUP",
      })
      const refreshedProforma = await financeService.getInvoiceById(db, proforma.id)
      expect(refreshedProforma).toMatchObject({
        status: "issued",
        voidedAt: null,
        voidReason: null,
      })
      expect(invoiceIssuedEvents).toHaveLength(0)
      const converted = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.convertedFromInvoiceId, proforma.id))
      expect(converted).toHaveLength(0)
    })

    it("rejects new payments on converted void proformas with redirect details", async () => {
      const booking = await seedBooking()
      const proforma = await seedInvoice(booking.id, {
        invoiceNumber: "PRO-1269-B",
        invoiceType: "proforma",
        status: "issued",
      })
      const converted = await app.request(`/invoices/${proforma.id}/convert-to-invoice`, {
        method: "POST",
        ...json({ invoiceNumber: "INV-1269-B" }),
      })
      expect(converted.status).toBe(201)
      const { data: invoice } = await converted.json()

      const payment = await app.request(`/invoices/${proforma.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 10000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          status: "completed",
          paymentDate: "2026-05-25",
        }),
      })

      expect(payment.status).toBe(409)
      const body = await payment.json()
      expect(body).toMatchObject({
        code: "invoice_void",
        details: {
          invoiceId: proforma.id,
          redirectInvoiceId: invoice.id,
        },
      })
      const refreshedProforma = await financeService.getInvoiceById(db, proforma.id)
      expect(refreshedProforma?.status).toBe("void")
    })

    it("returns 404 when deleting non-existent invoice", async () => {
      const res = await app.request("/invoices/inv_00000000000000000000000000", {
        method: "DELETE",
      })
      expect(res.status).toBe(404)
    })

    it("lists invoices with pagination", async () => {
      const booking = await seedBooking()
      await seedInvoice(booking.id)
      await seedInvoice(booking.id)
      await seedInvoice(booking.id)

      const res = await app.request("/invoices?limit=2&offset=0", { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.length).toBe(2)
      expect(body.total).toBe(3)
    })

    it("filters invoices by status", async () => {
      const booking = await seedBooking()
      await seedInvoice(booking.id, { status: "draft" })
      await seedInvoice(booking.id, { status: "issued" })
      const res = await app.request("/invoices?status=issued", { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].status).toBe("issued")
    })

    it("filters invoices by bookingId", async () => {
      const b1 = await seedBooking()
      const b2 = await seedBooking()
      await seedInvoice(b1.id)
      await seedInvoice(b2.id)
      const res = await app.request(`/invoices?bookingId=${b1.id}`, { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
    })

    it("searches invoices by number", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, { invoiceNumber: "SPECIAL-001" })
      await seedInvoice(booking.id)
      const res = await app.request("/invoices?search=SPECIAL", { method: "GET" })
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].id).toBe(inv.id)
    })
  })

  // ── Invoice Attachments ───────────────────────────────────────

  describe("Invoice attachments", () => {
    it("creates and lists invoice attachments", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const createRes = await app.request(`/invoices/${inv.id}/attachments`, {
        method: "POST",
        ...json({
          name: "Receipt.pdf",
          kind: "receipt",
          mimeType: "application/pdf",
          fileSize: 1234,
          storageKey: `invoices/${inv.id}/receipt.pdf`,
          checksum: "sha256:test",
        }),
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()).data
      expect(created.id).toMatch(/^inat_/)
      expect(created.invoiceId).toBe(inv.id)
      expect(created.name).toBe("Receipt.pdf")

      const listRes = await app.request(`/invoices/${inv.id}/attachments`, { method: "GET" })
      expect(listRes.status).toBe(200)
      const list = await listRes.json()
      expect(list.data).toHaveLength(1)
      expect(list.data[0].id).toBe(created.id)
    })

    it("returns 404 when creating an attachment for a missing invoice", async () => {
      const res = await app.request("/invoices/inv_00000000000000000000000000/attachments", {
        method: "POST",
        ...json({ name: "Missing.pdf" }),
      })
      expect(res.status).toBe(404)
    })

    it("updates and deletes invoice attachments", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)
      const createRes = await app.request(`/invoices/${inv.id}/attachments`, {
        method: "POST",
        ...json({ name: "Draft.pdf", kind: "draft" }),
      })
      const attachment = (await createRes.json()).data

      const updateRes = await app.request(`/invoices/${inv.id}/attachments/${attachment.id}`, {
        method: "PATCH",
        ...json({ name: "Final.pdf", kind: "supporting_document" }),
      })
      expect(updateRes.status).toBe(200)
      const updated = (await updateRes.json()).data
      expect(updated.name).toBe("Final.pdf")
      expect(updated.kind).toBe("supporting_document")

      const deleteRes = await app.request(`/invoices/${inv.id}/attachments/${attachment.id}`, {
        method: "DELETE",
      })
      expect(deleteRes.status).toBe(200)

      const listRes = await app.request(`/invoices/${inv.id}/attachments`, { method: "GET" })
      expect((await listRes.json()).data).toHaveLength(0)
    })

    it("redirects invoice attachment downloads through configured storage resolver", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)
      const createRes = await app.request(`/invoices/${inv.id}/attachments`, {
        method: "POST",
        ...json({
          name: "Receipt.pdf",
          storageKey: `invoices/${inv.id}/receipt.pdf`,
        }),
      })
      const attachment = (await createRes.json()).data

      const res = await app.request(`/invoice-attachments/${attachment.id}/download`)
      expect(res.status).toBe(302)
      expect(res.headers.get("location")).toBe(
        `https://files.example/invoices/${inv.id}/receipt.pdf`,
      )
    })

    it("uses metadata URLs as a fallback download target", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)
      const createRes = await app.request(`/invoices/${inv.id}/attachments`, {
        method: "POST",
        ...json({
          name: "External receipt",
          metadata: { url: "https://cdn.example/receipt.pdf" },
        }),
      })
      const attachment = (await createRes.json()).data

      const res = await app.request(`/invoice-attachments/${attachment.id}/download`)
      expect(res.status).toBe(302)
      expect(res.headers.get("location")).toBe("https://cdn.example/receipt.pdf")
    })
  })

  // ── Invoice From Booking ──────────────────────────────────────

  describe("Invoice from booking", () => {
    it("creates an invoice from a booking with items", async () => {
      const booking = await seedBooking({ sellAmountCents: 20000 })
      await seedBookingItem(booking.id)
      await seedBookingItem(booking.id)

      const res = await app.request("/invoices/from-booking", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          invoiceNumber: nextInvoiceNumber(),
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^inv_/)
      expect(data.bookingId).toBe(booking.id)
      expect(data.currency).toBe("USD")
      // `/invoices/from-booking` is an *issuing* command — `issued` is its only
      // success shape. The `draft` assertion predates that and has been wrong
      // since the route stopped merely composing a draft.
      expect(data.status).toBe("issued")
      // Should have subtotal based on items
      expect(data.subtotalCents).toBeGreaterThan(0)
      expect(data.balanceDueCents).toBeGreaterThan(0)
    })

    it("uses product and service date for booking item fallback invoice lines", async () => {
      const booking = await seedBooking({ sellAmountCents: 50000 })
      await seedBookingItem(booking.id, {
        title: "Adult",
        productNameSnapshot:
          "Excursie de 1 Zi in Bulgaria: Cascadele Krushuna, Pestera Devetashka si Fortareata Lovech",
        serviceDate: "2026-08-22",
        quantity: 1,
        unitSellAmountCents: 50000,
        totalSellAmountCents: 50000,
      })

      const res = await app.request("/invoices/from-booking", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          invoiceNumber: nextInvoiceNumber(),
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
        }),
      })

      expect(res.status).toBe(201)
      const { data } = await res.json()
      const lines = await db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, data.id))

      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatchObject({
        bookingItemId: expect.stringMatching(/^bkit_/),
        bookingPaymentScheduleId: null,
        description:
          "Excursie de 1 Zi in Bulgaria: Cascadele Krushuna, Pestera Devetashka si Fortareata Lovech | 2026-08-22",
        quantity: 1,
        unitPriceCents: 50000,
        totalCents: 50000,
      })
    })

    it("replays invoice-from-booking creates with the same idempotency key", async () => {
      const booking = await seedBooking({ sellAmountCents: 20000 })
      await seedBookingItem(booking.id)
      const input = {
        bookingId: booking.id,
        invoiceNumber: nextInvoiceNumber(),
        issueDate: "2025-06-01",
        dueDate: "2025-07-01",
      }

      const first = await app.request("/invoices/from-booking?wait=pdf&waitTimeoutMs=2000", {
        method: "POST",
        ...jsonWithIdempotency(input, "finance-invoice-from-booking-1"),
      })
      const replay = await app.request("/invoices/from-booking?wait=pdf&waitTimeoutMs=2000", {
        method: "POST",
        ...jsonWithIdempotency(input, "finance-invoice-from-booking-1"),
      })

      expect(first.status).toBe(201)
      expect(replay.status).toBe(201)
      expect(replay.headers.get("Idempotency-Replayed")).toBe("true")
      const firstBody = await first.json()
      const replayBody = await replay.json()
      expect(replayBody.data.id).toBe(firstBody.data.id)
    })

    it("creates an invoice from a booking without items (fallback)", async () => {
      const booking = await seedBooking({ sellAmountCents: 50000 })

      const res = await app.request("/invoices/from-booking", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          invoiceNumber: nextInvoiceNumber(),
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.subtotalCents).toBe(50000) // uses booking.sellAmountCents
    })

    it("creates an invoice from a single booking payment schedule row", async () => {
      const booking = await seedBooking({ sellAmountCents: 33000 })
      await seedBookingItem(booking.id)
      await seedBookingItem(booking.id)
      const schedule = await seedBookingPaymentSchedule(booking.id, {
        amountCents: 16500,
        scheduleType: "balance",
      })

      const res = await app.request("/invoices/from-booking", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          bookingPaymentScheduleId: schedule.id,
          invoiceNumber: nextInvoiceNumber(),
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
        }),
      })

      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.bookingId).toBe(booking.id)
      expect(data.subtotalCents).toBe(16500)
      expect(data.totalCents).toBe(16500)
      expect(data.balanceDueCents).toBe(16500)

      const lines = await db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, data.id))
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatchObject({
        bookingItemId: null,
        description: "Balance 50% Test Service | 2025-06-01",
        quantity: 1,
        unitPriceCents: 16500,
        totalCents: 16500,
      })
    })

    it("uses booking item snapshots for schedule invoices without an item link", async () => {
      const booking = await seedBooking({
        sellAmountCents: 33000,
        startDate: "2026-06-13",
      })
      await seedBookingItem(booking.id, {
        title: "Fallback booking item title",
        productNameSnapshot: "Excursie Bulgaria",
        serviceDate: "2026-06-18",
      })
      const schedule = await seedBookingPaymentSchedule(booking.id, {
        amountCents: 16500,
        scheduleType: "balance",
      })

      const res = await app.request("/invoices/from-booking", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          bookingPaymentScheduleId: schedule.id,
          invoiceNumber: nextInvoiceNumber(),
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
        }),
      })

      expect(res.status).toBe(201)
      const { data } = await res.json()
      const lines = await db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, data.id))

      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatchObject({
        bookingItemId: null,
        bookingPaymentScheduleId: schedule.id,
        description: "Balance 50% Excursie Bulgaria | 2026-06-18",
        quantity: 1,
        unitPriceCents: 16500,
        totalCents: 16500,
      })
    })

    it("allocates a number for schedule-row invoices when the UI omits invoiceNumber", async () => {
      await seedInvoiceNumberSeries({ currentSequence: 41 })
      const booking = await seedBooking({ sellAmountCents: 33000 })
      const schedule = await seedBookingPaymentSchedule(booking.id, {
        amountCents: 16500,
        scheduleType: "balance",
      })

      const res = await app.request("/invoices/from-booking", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          bookingPaymentScheduleId: schedule.id,
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
        }),
      })

      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.invoiceNumber).toBe("INV-0042")
      expect(data.seriesId).toMatch(/^invs_/)
      expect(data.sequence).toBe(42)
      expect(data.totalCents).toBe(16500)
    })

    it("returns 409 when a caller supplies a duplicate invoice number", async () => {
      const booking = await seedBooking({ sellAmountCents: 33000 })
      const schedule = await seedBookingPaymentSchedule(booking.id, {
        amountCents: 16500,
        scheduleType: "balance",
      })

      const input = {
        bookingId: booking.id,
        bookingPaymentScheduleId: schedule.id,
        invoiceNumber: "MANUAL-DUPLICATE",
        issueDate: "2025-06-01",
        dueDate: "2025-07-01",
      }
      const first = await app.request("/invoices/from-booking", {
        method: "POST",
        ...json(input),
      })
      expect(first.status).toBe(201)

      const second = await app.request("/invoices/from-booking", {
        method: "POST",
        ...json(input),
      })
      expect(second.status).toBe(409)
      await expect(second.json()).resolves.toMatchObject({
        error: "Invoice number already exists",
        code: "invoice_number_conflict",
        invoiceNumber: "MANUAL-DUPLICATE",
      })
    })

    it("allows the same external number for an invoice and proforma", async () => {
      const booking = await seedBooking({ sellAmountCents: 33000 })
      const schedule = await seedBookingPaymentSchedule(booking.id, {
        amountCents: 16500,
        scheduleType: "balance",
      })

      const invoiceNumber = "SMARTBILL-B-0127"
      const commonInput = {
        bookingId: booking.id,
        bookingPaymentScheduleId: schedule.id,
        invoiceNumber,
        issueDate: "2025-06-01",
        dueDate: "2025-07-01",
      }

      const invoice = await app.request("/invoices/from-booking", {
        method: "POST",
        ...json({ ...commonInput, invoiceType: "invoice" }),
      })
      expect(invoice.status).toBe(201)

      const proforma = await app.request("/invoices/from-booking", {
        method: "POST",
        ...json({ ...commonInput, invoiceType: "proforma" }),
      })
      expect(proforma.status).toBe(201)

      const invoiceBody = await invoice.json()
      const proformaBody = await proforma.json()
      expect(invoiceBody.data).toMatchObject({ invoiceNumber, invoiceType: "invoice" })
      expect(proformaBody.data).toMatchObject({ invoiceNumber, invoiceType: "proforma" })
      expect(proformaBody.data.id).not.toBe(invoiceBody.data.id)
    })

    it("does not derive base amounts from booking sell currency for cross-currency schedule invoices", async () => {
      const booking = await seedBooking({
        sellCurrency: "USD",
        sellAmountCents: 33000,
        baseCurrency: "RON",
        baseSellAmountCents: 150000,
      })
      const schedule = await seedBookingPaymentSchedule(booking.id, {
        currency: "EUR",
        amountCents: 16500,
        scheduleType: "balance",
      })

      const res = await app.request("/invoices/from-booking", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          bookingPaymentScheduleId: schedule.id,
          invoiceNumber: nextInvoiceNumber(),
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
        }),
      })

      // The rule this test is named for is now enforced by refusing the
      // invoice outright rather than by issuing one with null base amounts: a
      // schedule in another currency cannot be converted without a rate set,
      // and guessing from the booking's sell currency is exactly what must not
      // happen. The refusal names what was missing.
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        code: "invalid_invoice_from_booking",
        details: {
          scheduleCurrency: "EUR",
          bookingSellCurrency: "USD",
          fxRateSetId: null,
        },
      })

      const created = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.bookingId, booking.id))
      expect(created).toHaveLength(0)
    })

    it("returns 404 for non-existent booking", async () => {
      const res = await app.request("/invoices/from-booking", {
        method: "POST",
        ...json({
          bookingId: "book_00000000000000000000000000",
          invoiceNumber: nextInvoiceNumber(),
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
        }),
      })
      expect(res.status).toBe(404)
    })

    it("issues invoices immediately even when callers request an inline PDF wait", async () => {
      const booking = await seedBooking({ sellAmountCents: 20000 })
      await seedBookingItem(booking.id)
      autoRenditionBookings.set(booking.id, {
        delayMs: 25,
        storageKey: `invoices/${booking.id}/smartbill.pdf`,
      })

      const res = await app.request("/invoices/from-booking?wait=pdf&waitTimeoutMs=2000", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          invoiceNumber: nextInvoiceNumber(),
          issueDate: "2025-06-01",
          dueDate: "2025-07-01",
        }),
      })

      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^inv_/)
      expect(data.bookingId).toBe(booking.id)
      expect(data.rendition).toBeUndefined()
      expect(data.download).toBeUndefined()
    })
  })

  describe("Invoice rendition wait", () => {
    it("leaves the row pending when the caller did not ask to wait", async () => {
      const booking = await seedBooking()
      const invoice = await seedInvoice(booking.id)

      const res = await app.request(`/invoices/${invoice.id}/render`, {
        method: "POST",
        ...json({ format: "pdf" }),
      })

      // `docs/architecture/invoice-rendition-wait.md`: the wait is additive, and
      // omitting it preserves the historical response shape. Rendering inline
      // regardless would hold a fire-and-forget request for the renderer's full
      // navigation timeout.
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data).toMatchObject({ invoiceId: invoice.id, format: "pdf", status: "pending" })
      expect(data.errorMessage).toBeNull()
    })

    it("records the miss when no document provider is configured", async () => {
      const booking = await seedBooking()
      const invoice = await seedInvoice(booking.id)

      const res = await app.request(`/invoices/${invoice.id}/render?wait=pdf&waitTimeoutMs=0`, {
        method: "POST",
        ...json({ format: "pdf" }),
      })

      // This route used to answer 202 with a `pending` row and leave it there
      // forever — the orphan voyant#4668 was filed for. These routes are built
      // without a provider, so the request cannot be served; saying so on the
      // row is what releases every waiter, because `failed` is terminal for
      // `waitForInvoiceRendition` and `pending` is not.
      expect(res.status).toBe(202)
      const { data } = await res.json()
      expect(data.rendition).toMatchObject({
        invoiceId: invoice.id,
        format: "pdf",
        status: "failed",
      })
      expect(data.rendition.errorMessage).toMatch(/no document renderer is available/i)

      const rows = await db
        .select()
        .from(invoiceRenditions)
        .where(eq(invoiceRenditions.invoiceId, invoice.id))
      expect(rows).toHaveLength(1)
    })
  })

  // ── Invoice Line Items ────────────────────────────────────────

  describe("Invoice Line Items", () => {
    it("creates a line item on an invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const res = await app.request(`/invoices/${inv.id}/line-items`, {
        method: "POST",
        ...json({
          description: "City Tour",
          quantity: 2,
          unitPriceCents: 5000,
          totalCents: 10000,
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^inli_/)
      expect(data.invoiceId).toBe(inv.id)
      expect(data.description).toBe("City Tour")
      expect(data.quantity).toBe(2)
    })

    it("returns 404 when creating line item on non-existent invoice", async () => {
      const res = await app.request("/invoices/inv_00000000000000000000000000/line-items", {
        method: "POST",
        ...json({
          description: "Test",
          quantity: 1,
          unitPriceCents: 1000,
          totalCents: 1000,
        }),
      })
      expect(res.status).toBe(404)
    })

    it("rejects invoice line items with impossible totals", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const res = await app.request(`/invoices/${inv.id}/line-items`, {
        method: "POST",
        ...json({
          description: "Bad math",
          quantity: 2,
          unitPriceCents: 5000,
          totalCents: 9000,
        }),
      })

      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        code: "invoice_line_total_mismatch",
      })
    })

    it("lists line items for an invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      await app.request(`/invoices/${inv.id}/line-items`, {
        method: "POST",
        ...json({ description: "Item A", quantity: 1, unitPriceCents: 1000, totalCents: 1000 }),
      })
      await app.request(`/invoices/${inv.id}/line-items`, {
        method: "POST",
        ...json({ description: "Item B", quantity: 1, unitPriceCents: 2000, totalCents: 2000 }),
      })

      const res = await app.request(`/invoices/${inv.id}/line-items`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.length).toBe(2)
    })

    it("updates a line item", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const createRes = await app.request(`/invoices/${inv.id}/line-items`, {
        method: "POST",
        ...json({ description: "Original", quantity: 1, unitPriceCents: 1000, totalCents: 1000 }),
      })
      const { data: lineItem } = await createRes.json()

      const res = await app.request(`/invoices/${inv.id}/line-items/${lineItem.id}`, {
        method: "PATCH",
        ...json({ description: "Updated", quantity: 3, totalCents: 3000 }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.description).toBe("Updated")
      expect(data.quantity).toBe(3)
    })

    it("rejects invoice line item updates with impossible totals", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const createRes = await app.request(`/invoices/${inv.id}/line-items`, {
        method: "POST",
        ...json({ description: "Original", quantity: 1, unitPriceCents: 1000, totalCents: 1000 }),
      })
      const { data: lineItem } = await createRes.json()

      const res = await app.request(`/invoices/${inv.id}/line-items/${lineItem.id}`, {
        method: "PATCH",
        ...json({ quantity: 3 }),
      })

      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        code: "invoice_line_total_mismatch",
      })
    })

    it("deletes a line item", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const createRes = await app.request(`/invoices/${inv.id}/line-items`, {
        method: "POST",
        ...json({ description: "Delete me", quantity: 1, unitPriceCents: 1000, totalCents: 1000 }),
      })
      const { data: lineItem } = await createRes.json()

      const res = await app.request(`/invoices/${inv.id}/line-items/${lineItem.id}`, {
        method: "DELETE",
      })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })
  })

  // ── Payments ──────────────────────────────────────────────────

  describe("Payments", () => {
    it("records a payment on an invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, { totalCents: 50000, balanceDueCents: 50000 })

      const res = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 20000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-15",
          status: "completed",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^pay_/)
      expect(data.amountCents).toBe(20000)
      expect(data.invoiceId).toBe(inv.id)
      expect(invoicePaymentRecordedEvents).toHaveLength(1)
      expect(invoicePaymentRecordedEvents[0]?.data).toEqual(
        expect.objectContaining({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceType: "invoice",
          bookingId: booking.id,
          invoiceCurrency: "USD",
          invoiceTotalCents: 50000,
          invoicePaidCents: 20000,
          invoiceBalanceDueCents: 30000,
          paymentId: data.id,
          amountCents: 20000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          status: "completed",
          paymentDate: "2025-06-15",
        }),
      )
    })

    it("marks covered booking payment schedules paid when recording invoice payments", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, { totalCents: 50000, balanceDueCents: 50000 })
      const deposit = await seedBookingPaymentSchedule(booking.id, {
        amountCents: 20000,
        scheduleType: "deposit",
        dueDate: "2025-06-01",
      })
      const balance = await seedBookingPaymentSchedule(booking.id, {
        amountCents: 30000,
        scheduleType: "balance",
        dueDate: "2025-07-01",
      })

      const res = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 50000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-15",
          status: "completed",
        }),
      })
      expect(res.status).toBe(201)

      const rows = await db
        .select()
        .from(bookingPaymentSchedules)
        .where(eq(bookingPaymentSchedules.bookingId, booking.id))
      const statuses = new Map(rows.map((row) => [row.id, row.status]))
      expect(statuses.get(deposit.id)).toBe("paid")
      expect(statuses.get(balance.id)).toBe("paid")
    })

    it("replays duplicate payment records with derived idempotency", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, { totalCents: 10000, balanceDueCents: 10000 })
      const body = {
        amountCents: 5000,
        currency: "USD",
        paymentMethod: "bank_transfer",
        paymentDate: "2025-06-15",
        status: "completed",
        idempotencyKey: "",
      }

      const firstRes = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json(body),
      })
      expect(firstRes.status).toBe(201)
      const { data: firstPayment } = await firstRes.json()
      expect(invoicePaymentRecordedEvents).toHaveLength(1)

      const retryRes = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json(body),
      })
      expect(retryRes.status).toBe(201)
      const { data: replayedPayment } = await retryRes.json()
      expect(replayedPayment.id).toBe(firstPayment.id)

      const paymentRows = await db.select().from(payments).where(eq(payments.invoiceId, inv.id))
      expect(paymentRows).toHaveLength(1)
      expect(invoicePaymentRecordedEvents).toHaveLength(1)

      const check = await app.request(`/invoices/${inv.id}`, { method: "GET" })
      const { data: invoiceAfterRetry } = await check.json()
      expect(invoiceAfterRetry.paidCents).toBe(5000)
      expect(invoiceAfterRetry.balanceDueCents).toBe(5000)
      expect(invoiceAfterRetry.status).toBe("partially_paid")
    })

    it("rejects changed payment payloads with the same explicit idempotency key", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, { totalCents: 10000, balanceDueCents: 10000 })
      const firstBody = {
        amountCents: 5000,
        currency: "USD",
        paymentMethod: "bank_transfer",
        paymentDate: "2025-06-15",
        status: "completed",
        idempotencyKey: "payment-record-1",
      }

      const firstRes = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json(firstBody),
      })
      expect(firstRes.status).toBe(201)

      const conflictRes = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({ ...firstBody, amountCents: 6000 }),
      })
      expect(conflictRes.status).toBe(409)

      const paymentRows = await db.select().from(payments).where(eq(payments.invoiceId, inv.id))
      expect(paymentRows).toHaveLength(1)
    })

    it("updates invoice paidCents and status after completed payment", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, { totalCents: 10000, balanceDueCents: 10000 })

      // Partial payment
      await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 5000,
          currency: "USD",
          paymentMethod: "credit_card",
          paymentDate: "2025-06-15",
          status: "completed",
        }),
      })

      const checkPartial = await app.request(`/invoices/${inv.id}`, { method: "GET" })
      const { data: partialInv } = await checkPartial.json()
      expect(partialInv.paidCents).toBe(5000)
      expect(partialInv.balanceDueCents).toBe(5000)
      expect(partialInv.status).toBe("partially_paid")

      // Full payment
      await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 5000,
          currency: "USD",
          paymentMethod: "credit_card",
          paymentDate: "2025-06-16",
          status: "completed",
        }),
      })

      const checkFull = await app.request(`/invoices/${inv.id}`, { method: "GET" })
      const { data: fullInv } = await checkFull.json()
      expect(fullInv.paidCents).toBe(10000)
      expect(fullInv.balanceDueCents).toBe(0)
      expect(fullInv.status).toBe("paid")
    })

    it("rejects completed payments that exceed the invoice total", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, { totalCents: 10000, balanceDueCents: 10000 })

      const res = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 10001,
          currency: "USD",
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-15",
          status: "completed",
        }),
      })

      expect(res.status).toBe(409)
      await expect(res.json()).resolves.toMatchObject({
        code: "invoice_overpaid",
      })

      const check = await app.request(`/invoices/${inv.id}`, { method: "GET" })
      const { data } = await check.json()
      expect(data.paidCents).toBe(0)
      expect(data.balanceDueCents).toBe(10000)
    })

    it("rejects payment updates that would overpay an invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, { totalCents: 10000, balanceDueCents: 10000 })
      const createRes = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 5000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-15",
          status: "completed",
        }),
      })
      const { data: payment } = await createRes.json()

      const res = await app.request(`/payments/${payment.id}`, {
        method: "PATCH",
        ...json({ amountCents: 10001 }),
      })

      expect(res.status).toBe(409)
      await expect(res.json()).resolves.toMatchObject({
        code: "invoice_overpaid",
      })

      const check = await app.request(`/invoices/${inv.id}`, { method: "GET" })
      const { data } = await check.json()
      expect(data.paidCents).toBe(5000)
      expect(data.balanceDueCents).toBe(5000)
    })

    it("settles cross-currency completed payments using the base invoice amount", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, {
        currency: "EUR",
        totalCents: 10000,
        balanceDueCents: 10000,
      })

      const res = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 50000,
          currency: "RON",
          baseCurrency: "EUR",
          baseAmountCents: 10000,
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-15",
          status: "completed",
        }),
      })
      expect(res.status).toBe(201)
      const { data: payment } = await res.json()
      expect(payment.amountCents).toBe(50000)
      expect(payment.currency).toBe("RON")
      expect(payment.baseAmountCents).toBe(10000)
      expect(payment.baseCurrency).toBe("EUR")

      const check = await app.request(`/invoices/${inv.id}`, { method: "GET" })
      const { data: paidInv } = await check.json()
      expect(paidInv.paidCents).toBe(10000)
      expect(paidInv.balanceDueCents).toBe(0)
      expect(paidInv.status).toBe("paid")
    })

    it("auto-computes completed cross-currency payment base amounts with FX commission", async () => {
      const booking = await seedBooking()
      const fxRateSetId = `fxrs_${seq + 1}`
      const exchangeRateId = `fxrt_${seq + 1}`
      const undatedFxRateSetId = `fxrs_undated_${seq + 1}`
      const undatedExchangeRateId = `fxrt_undated_${seq + 1}`
      await db.execute(sql`
        INSERT INTO fx_rate_sets (id, base_currency, effective_at, observed_at)
        VALUES (${fxRateSetId}, 'EUR', '2025-06-13T00:00:00.000Z', '2025-06-13T00:00:00.000Z')
      `)
      await db.execute(sql`
        INSERT INTO fx_rate_sets (id, base_currency, effective_at, observed_at)
        VALUES (${undatedFxRateSetId}, 'EUR', '2025-06-14T00:00:00.000Z', NULL)
      `)
      await db.execute(sql`
        INSERT INTO exchange_rates (
          id,
          fx_rate_set_id,
          base_currency,
          quote_currency,
          rate_decimal,
          inverse_rate_decimal,
          observed_at
        )
        VALUES (
          ${exchangeRateId},
          ${fxRateSetId},
          'RON',
          'EUR',
          '0.197',
          '5.07614213',
          '2025-06-13T00:00:00.000Z'
        )
      `)
      await db.execute(sql`
        INSERT INTO exchange_rates (
          id,
          fx_rate_set_id,
          base_currency,
          quote_currency,
          rate_decimal,
          inverse_rate_decimal,
          observed_at
        )
        VALUES (
          ${undatedExchangeRateId},
          ${undatedFxRateSetId},
          'RON',
          'EUR',
          '0.5',
          '2',
          NULL
        )
      `)
      const expectedBaseAmountCents = Math.round(86000 * 0.197 * 1.02)
      const inv = await seedInvoice(booking.id, {
        currency: "EUR",
        totalCents: expectedBaseAmountCents,
        balanceDueCents: expectedBaseAmountCents,
      })

      const res = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 86000,
          currency: "RON",
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-15",
          status: "completed",
        }),
      })
      expect(res.status).toBe(201)
      const { data: payment } = await res.json()
      expect(payment.baseCurrency).toBe("EUR")
      expect(payment.baseAmountCents).toBe(expectedBaseAmountCents)
      expect(payment.fxRateSetId).toBe(fxRateSetId)

      const check = await app.request(`/invoices/${inv.id}`, { method: "GET" })
      const { data: paidInv } = await check.json()
      expect(paidInv.paidCents).toBe(expectedBaseAmountCents)
      expect(paidInv.balanceDueCents).toBe(0)
      expect(paidInv.status).toBe("paid")
    })

    it("rejects completed cross-currency payments without a base invoice amount", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, {
        currency: "EUR",
        totalCents: 10000,
        balanceDueCents: 10000,
      })

      const res = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 50000,
          currency: "RON",
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-15",
          status: "completed",
        }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe(
        "Completed cross-currency payments require a base amount in the invoice currency",
      )

      const list = await app.request(`/invoices/${inv.id}/payments`, { method: "GET" })
      const { data: paymentRows } = await list.json()
      expect(paymentRows).toHaveLength(0)

      const check = await app.request(`/invoices/${inv.id}`, { method: "GET" })
      const { data: unchangedInv } = await check.json()
      expect(unchangedInv.paidCents).toBe(0)
      expect(unchangedInv.balanceDueCents).toBe(10000)
      expect(unchangedInv.status).toBe("draft")
    })

    it("does not update invoice when payment is pending", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id, { totalCents: 10000, balanceDueCents: 10000 })

      await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 10000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-15",
          status: "pending",
        }),
      })

      const check = await app.request(`/invoices/${inv.id}`, { method: "GET" })
      const { data: invAfter } = await check.json()
      // Pending payments are not included in the sum
      expect(invAfter.paidCents).toBe(0)
      expect(invAfter.status).toBe("draft")
    })

    it("returns 404 when recording payment on non-existent invoice", async () => {
      const res = await app.request("/invoices/inv_00000000000000000000000000/payments", {
        method: "POST",
        ...json({
          amountCents: 1000,
          currency: "USD",
          paymentMethod: "cash",
          paymentDate: "2025-06-15",
        }),
      })
      expect(res.status).toBe(404)
    })

    it("lists payments for an invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 1000,
          currency: "USD",
          paymentMethod: "cash",
          paymentDate: "2025-06-01",
        }),
      })
      await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 2000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-02",
        }),
      })

      const res = await app.request(`/invoices/${inv.id}/payments`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.length).toBe(2)
    })
  })

  // ── Credit Notes ──────────────────────────────────────────────

  describe("Credit Notes", () => {
    it("creates a credit note on an invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const res = await app.request(`/invoices/${inv.id}/credit-notes`, {
        method: "POST",
        ...json({
          creditNoteNumber: nextCreditNoteNumber(),
          amountCents: 5000,
          currency: "USD",
          reason: "Cancellation",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^crn_/)
      expect(data.invoiceId).toBe(inv.id)
      expect(data.status).toBe("draft")
      expect(data.amountCents).toBe(5000)
    })

    it("returns 404 when creating credit note on non-existent invoice", async () => {
      const res = await app.request("/invoices/inv_00000000000000000000000000/credit-notes", {
        method: "POST",
        ...json({
          creditNoteNumber: nextCreditNoteNumber(),
          amountCents: 1000,
          currency: "USD",
          reason: "Test",
        }),
      })
      expect(res.status).toBe(404)
    })

    it("allows a credit note on a fully paid invoice", async () => {
      const booking = await seedBooking({ status: "confirmed" })
      const inv = await seedInvoice(booking.id, { totalCents: 10000, balanceDueCents: 10000 })
      const payment = await app.request(`/invoices/${inv.id}/payments`, {
        method: "POST",
        ...json({
          amountCents: 10000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          status: "completed",
          paymentDate: "2025-06-02",
        }),
      })
      expect(payment.status).toBe(201)

      const res = await app.request(`/invoices/${inv.id}/credit-notes`, {
        method: "POST",
        ...json({
          creditNoteNumber: nextCreditNoteNumber(),
          amountCents: 5000,
          currency: "USD",
          reason: "Paid booking cancellation",
        }),
      })

      expect(res.status).toBe(201)
    })

    it("rejects credit notes that exceed the invoice total", async () => {
      const booking = await seedBooking({ status: "confirmed" })
      const inv = await seedInvoice(booking.id, { totalCents: 10000, balanceDueCents: 8000 })

      const res = await app.request(`/invoices/${inv.id}/credit-notes`, {
        method: "POST",
        ...json({
          creditNoteNumber: nextCreditNoteNumber(),
          amountCents: 10001,
          currency: "USD",
          reason: "Too much credit",
        }),
      })

      expect(res.status).toBe(409)
      await expect(res.json()).resolves.toMatchObject({
        code: "invoice_overcredited",
      })
    })

    it("rejects credit note updates that exceed the invoice total", async () => {
      const booking = await seedBooking({ status: "confirmed" })
      const inv = await seedInvoice(booking.id, { totalCents: 10000, balanceDueCents: 8000 })

      const createRes = await app.request(`/invoices/${inv.id}/credit-notes`, {
        method: "POST",
        ...json({
          creditNoteNumber: nextCreditNoteNumber(),
          amountCents: 5000,
          currency: "USD",
          reason: "Partial credit",
        }),
      })
      const { data: cn } = await createRes.json()

      const res = await app.request(`/invoices/${inv.id}/credit-notes/${cn.id}`, {
        method: "PATCH",
        ...json({ amountCents: 10001 }),
      })

      expect(res.status).toBe(409)
      await expect(res.json()).resolves.toMatchObject({
        code: "invoice_overcredited",
      })
    })

    it("updates a credit note", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const createRes = await app.request(`/invoices/${inv.id}/credit-notes`, {
        method: "POST",
        ...json({
          creditNoteNumber: nextCreditNoteNumber(),
          amountCents: 3000,
          currency: "USD",
          reason: "Service not rendered",
        }),
      })
      const { data: cn } = await createRes.json()

      const res = await app.request(`/invoices/${inv.id}/credit-notes/${cn.id}`, {
        method: "PATCH",
        ...json({ status: "issued" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("issued")
    })

    it("lists credit notes for an invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      await app.request(`/invoices/${inv.id}/credit-notes`, {
        method: "POST",
        ...json({
          creditNoteNumber: nextCreditNoteNumber(),
          amountCents: 1000,
          currency: "USD",
          reason: "Reason A",
        }),
      })
      await app.request(`/invoices/${inv.id}/credit-notes`, {
        method: "POST",
        ...json({
          creditNoteNumber: nextCreditNoteNumber(),
          amountCents: 2000,
          currency: "USD",
          reason: "Reason B",
        }),
      })

      const res = await app.request(`/invoices/${inv.id}/credit-notes`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.length).toBe(2)
    })
  })

  // ── Credit Note Line Items ────────────────────────────────────

  describe("Credit Note Line Items", () => {
    it("creates a credit note line item", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const cnRes = await app.request(`/invoices/${inv.id}/credit-notes`, {
        method: "POST",
        ...json({
          creditNoteNumber: nextCreditNoteNumber(),
          amountCents: 5000,
          currency: "USD",
          reason: "Partial refund",
        }),
      })
      const { data: cn } = await cnRes.json()

      const res = await app.request(`/invoices/${inv.id}/credit-notes/${cn.id}/line-items`, {
        method: "POST",
        ...json({
          description: "Refund for day 3",
          quantity: 1,
          unitPriceCents: 5000,
          totalCents: 5000,
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^cnli_/)
      expect(data.creditNoteId).toBe(cn.id)
    })

    it("returns 404 when creating line item on non-existent credit note", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const res = await app.request(
        `/invoices/${inv.id}/credit-notes/crn_00000000000000000000000000/line-items`,
        {
          method: "POST",
          ...json({
            description: "Test",
            quantity: 1,
            unitPriceCents: 100,
            totalCents: 100,
          }),
        },
      )
      expect(res.status).toBe(404)
    })

    it("rejects credit note line items with impossible totals", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const cnRes = await app.request(`/invoices/${inv.id}/credit-notes`, {
        method: "POST",
        ...json({
          creditNoteNumber: nextCreditNoteNumber(),
          amountCents: 5000,
          currency: "USD",
          reason: "Partial refund",
        }),
      })
      const { data: cn } = await cnRes.json()

      const res = await app.request(`/invoices/${inv.id}/credit-notes/${cn.id}/line-items`, {
        method: "POST",
        ...json({
          description: "Bad credit math",
          quantity: 2,
          unitPriceCents: 2500,
          totalCents: 4000,
        }),
      })

      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        code: "credit_note_line_total_mismatch",
      })
    })

    it("lists credit note line items", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const cnRes = await app.request(`/invoices/${inv.id}/credit-notes`, {
        method: "POST",
        ...json({
          creditNoteNumber: nextCreditNoteNumber(),
          amountCents: 5000,
          currency: "USD",
          reason: "Refund",
        }),
      })
      const { data: cn } = await cnRes.json()

      await app.request(`/invoices/${inv.id}/credit-notes/${cn.id}/line-items`, {
        method: "POST",
        ...json({ description: "Line A", quantity: 1, unitPriceCents: 2000, totalCents: 2000 }),
      })
      await app.request(`/invoices/${inv.id}/credit-notes/${cn.id}/line-items`, {
        method: "POST",
        ...json({ description: "Line B", quantity: 1, unitPriceCents: 3000, totalCents: 3000 }),
      })

      const res = await app.request(`/invoices/${inv.id}/credit-notes/${cn.id}/line-items`, {
        method: "GET",
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.length).toBe(2)
    })
  })

  // ── Finance Notes ─────────────────────────────────────────────

  describe("Finance Notes", () => {
    it("creates a note on an invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const res = await app.request(`/invoices/${inv.id}/notes`, {
        method: "POST",
        ...json({ content: "Client requested extended payment terms" }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^fnot_/)
      expect(data.invoiceId).toBe(inv.id)
      expect(data.authorId).toBe("test-user-id")
      expect(data.content).toBe("Client requested extended payment terms")
    })

    it("returns 404 when creating note on non-existent invoice", async () => {
      const res = await app.request("/invoices/inv_00000000000000000000000000/notes", {
        method: "POST",
        ...json({ content: "Test note" }),
      })
      expect(res.status).toBe(404)
    })

    it("requires userId to create notes", async () => {
      // Create a separate app without userId
      const noUserApp = new Hono()
      noUserApp.onError((err, c) => handleApiError(err, c))
      noUserApp.use("*", async (c, next) => {
        c.set("db" as never, db)
        // userId NOT set
        await next()
      })
      noUserApp.route("/", financeRoutes)

      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      const res = await noUserApp.request(`/invoices/${inv.id}/notes`, {
        method: "POST",
        ...json({ content: "No user" }),
      })
      // A request with no actor is unauthenticated, not malformed: the route
      // raises `UnauthorizedApiError` and the boundary renders 401. The old
      // 400 / "User ID" message belonged to a hand-rolled guard that no longer
      // exists.
      expect(res.status).toBe(401)
    })

    it("lists notes for an invoice", async () => {
      const booking = await seedBooking()
      const inv = await seedInvoice(booking.id)

      await app.request(`/invoices/${inv.id}/notes`, {
        method: "POST",
        ...json({ content: "Note 1" }),
      })
      await app.request(`/invoices/${inv.id}/notes`, {
        method: "POST",
        ...json({ content: "Note 2" }),
      })

      const res = await app.request(`/invoices/${inv.id}/notes`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.length).toBe(2)
    })
  })

  // ── Supplier Payments ─────────────────────────────────────────

  describe("Supplier Payments", () => {
    it("creates a supplier payment", async () => {
      const booking = await seedBooking()

      const res = await app.request("/supplier-payments", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          amountCents: 30000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-20",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^spay_/)
      expect(data.bookingId).toBe(booking.id)
      expect(data.amountCents).toBe(30000)
      expect(data.status).toBe("pending")
    })

    it("updates a supplier payment", async () => {
      const booking = await seedBooking()
      const createRes = await app.request("/supplier-payments", {
        method: "POST",
        ...json({
          bookingId: booking.id,
          amountCents: 10000,
          currency: "USD",
          paymentMethod: "cash",
          paymentDate: "2025-06-20",
        }),
      })
      const { data: sp } = await createRes.json()

      const res = await app.request(`/supplier-payments/${sp.id}`, {
        method: "PATCH",
        ...json({ status: "completed", referenceNumber: "REF-123" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("completed")
      expect(data.referenceNumber).toBe("REF-123")
    })

    it("returns 404 when updating non-existent supplier payment", async () => {
      const res = await app.request("/supplier-payments/spay_00000000000000000000000000", {
        method: "PATCH",
        ...json({ status: "completed" }),
      })
      expect(res.status).toBe(404)
    })

    it("lists supplier payments with filters", async () => {
      const b1 = await seedBooking()
      const b2 = await seedBooking()

      await app.request("/supplier-payments", {
        method: "POST",
        ...json({
          bookingId: b1.id,
          amountCents: 10000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-20",
        }),
      })
      await app.request("/supplier-payments", {
        method: "POST",
        ...json({
          bookingId: b2.id,
          amountCents: 20000,
          currency: "EUR",
          paymentMethod: "bank_transfer",
          paymentDate: "2025-06-21",
        }),
      })

      const res = await app.request(`/supplier-payments?bookingId=${b1.id}`, { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.data[0].bookingId).toBe(b1.id)
    })
  })

  // ── Booking Payment Schedules ─────────────────────────────────

  describe("Booking Payment Schedules", () => {
    it("creates a payment schedule", async () => {
      const booking = await seedBooking()

      const res = await app.request(`/bookings/${booking.id}/payment-schedules`, {
        method: "POST",
        ...json({
          dueDate: "2025-06-15",
          currency: "USD",
          amountCents: 25000,
          scheduleType: "deposit",
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^bkpy_/)
      expect(data.bookingId).toBe(booking.id)
      expect(data.scheduleType).toBe("deposit")
      expect(data.status).toBe("pending")
    })

    it("returns 404 when booking does not exist", async () => {
      const res = await app.request("/bookings/book_00000000000000000000000000/payment-schedules", {
        method: "POST",
        ...json({ dueDate: "2025-06-15", currency: "USD", amountCents: 10000 }),
      })
      expect(res.status).toBe(404)
    })

    it("updates a payment schedule", async () => {
      const booking = await seedBooking()

      const createRes = await app.request(`/bookings/${booking.id}/payment-schedules`, {
        method: "POST",
        ...json({ dueDate: "2025-06-15", currency: "USD", amountCents: 10000 }),
      })
      const { data: schedule } = await createRes.json()

      const res = await app.request(`/bookings/${booking.id}/payment-schedules/${schedule.id}`, {
        method: "PATCH",
        ...json({ status: "due" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("due")
    })

    it("rejects directly marking a payment schedule paid without linked completed payment coverage", async () => {
      const booking = await seedBooking()

      const createRes = await app.request(`/bookings/${booking.id}/payment-schedules`, {
        method: "POST",
        ...json({ dueDate: "2025-06-15", currency: "USD", amountCents: 10000 }),
      })
      const { data: schedule } = await createRes.json()

      const res = await app.request(`/bookings/${booking.id}/payment-schedules/${schedule.id}`, {
        method: "PATCH",
        ...json({ status: "paid" }),
      })
      expect(res.status).toBe(400)

      const [storedSchedule] = await db
        .select()
        .from(bookingPaymentSchedules)
        .where(eq(bookingPaymentSchedules.id, schedule.id))
      expect(storedSchedule?.status).toBe("pending")
    })

    it("deletes a payment schedule", async () => {
      const booking = await seedBooking()

      const createRes = await app.request(`/bookings/${booking.id}/payment-schedules`, {
        method: "POST",
        ...json({ dueDate: "2025-06-15", currency: "USD", amountCents: 10000 }),
      })
      const { data: schedule } = await createRes.json()

      const res = await app.request(`/bookings/${booking.id}/payment-schedules/${schedule.id}`, {
        method: "DELETE",
      })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })

    it("lists payment schedules for a booking", async () => {
      const booking = await seedBooking()

      await app.request(`/bookings/${booking.id}/payment-schedules`, {
        method: "POST",
        ...json({ dueDate: "2025-06-01", currency: "USD", amountCents: 10000 }),
      })
      await app.request(`/bookings/${booking.id}/payment-schedules`, {
        method: "POST",
        ...json({ dueDate: "2025-07-01", currency: "USD", amountCents: 20000 }),
      })

      const res = await app.request(`/bookings/${booking.id}/payment-schedules`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.length).toBe(2)
    })

    it("applies a default deposit and balance payment plan with near-departure guard", async () => {
      const booking = await seedBooking({
        sellCurrency: "EUR",
        sellAmountCents: 100000,
        startDate: "2025-06-10",
      })

      const res = await app.request(`/bookings/${booking.id}/payment-schedules/default-plan`, {
        method: "POST",
        ...json({
          depositMode: "percentage",
          depositValue: 30,
          balanceDueDaysBeforeStart: 30,
          createGuarantee: true,
          guaranteeType: "deposit",
          notes: "Default payment plan",
        }),
      })

      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data).toHaveLength(2)
      expect(data[0].scheduleType).toBe("deposit")
      expect(data[0].amountCents).toBe(30000)
      expect(data[1].scheduleType).toBe("balance")
      expect(data[1].amountCents).toBe(70000)
      expect(data[1].status).toBe("due")

      const guaranteesRes = await app.request(`/bookings/${booking.id}/guarantees`, {
        method: "GET",
      })
      const guaranteesBody = await guaranteesRes.json()
      expect(guaranteesBody.data).toHaveLength(1)
      expect(guaranteesBody.data[0].bookingPaymentScheduleId).toBe(data[0].id)
      expect(guaranteesBody.data[0].amountCents).toBe(30000)
    })
  })

  // ── Booking Guarantees ────────────────────────────────────────

  describe("Booking Guarantees", () => {
    it("creates a guarantee", async () => {
      const booking = await seedBooking()

      const res = await app.request(`/bookings/${booking.id}/guarantees`, {
        method: "POST",
        ...json({
          guaranteeType: "deposit",
          currency: "USD",
          amountCents: 15000,
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^bkgu_/)
      expect(data.bookingId).toBe(booking.id)
      expect(data.guaranteeType).toBe("deposit")
      expect(data.status).toBe("pending")
    })

    it("returns 404 when booking does not exist", async () => {
      const res = await app.request("/bookings/book_00000000000000000000000000/guarantees", {
        method: "POST",
        ...json({ guaranteeType: "credit_card" }),
      })
      expect(res.status).toBe(404)
    })

    it("updates a guarantee", async () => {
      const booking = await seedBooking()

      const createRes = await app.request(`/bookings/${booking.id}/guarantees`, {
        method: "POST",
        ...json({ guaranteeType: "preauth", currency: "USD", amountCents: 5000 }),
      })
      const { data: guarantee } = await createRes.json()

      const res = await app.request(`/bookings/${booking.id}/guarantees/${guarantee.id}`, {
        method: "PATCH",
        ...json({ status: "active", referenceNumber: "GUAR-001" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.status).toBe("active")
      expect(data.referenceNumber).toBe("GUAR-001")
    })

    it("deletes a guarantee", async () => {
      const booking = await seedBooking()

      const createRes = await app.request(`/bookings/${booking.id}/guarantees`, {
        method: "POST",
        ...json({ guaranteeType: "deposit" }),
      })
      const { data: guarantee } = await createRes.json()

      const res = await app.request(`/bookings/${booking.id}/guarantees/${guarantee.id}`, {
        method: "DELETE",
      })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })

    it("rejects deleting an active guarantee", async () => {
      const booking = await seedBooking()

      const createRes = await app.request(`/bookings/${booking.id}/guarantees`, {
        method: "POST",
        ...json({ guaranteeType: "deposit", status: "active" }),
      })
      const { data: guarantee } = await createRes.json()

      const res = await app.request(`/bookings/${booking.id}/guarantees/${guarantee.id}`, {
        method: "DELETE",
      })
      expect(res.status).toBe(400)

      const listRes = await app.request(`/bookings/${booking.id}/guarantees`, { method: "GET" })
      const { data } = await listRes.json()
      expect(data).toHaveLength(1)
      expect(data[0].status).toBe("active")
    })

    it("lists guarantees for a booking", async () => {
      const booking = await seedBooking()

      await app.request(`/bookings/${booking.id}/guarantees`, {
        method: "POST",
        ...json({ guaranteeType: "deposit" }),
      })
      await app.request(`/bookings/${booking.id}/guarantees`, {
        method: "POST",
        ...json({ guaranteeType: "credit_card" }),
      })

      const res = await app.request(`/bookings/${booking.id}/guarantees`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.length).toBe(2)
    })
  })

  // ── Booking Item Tax Lines ────────────────────────────────────

  describe("Booking Item Tax Lines", () => {
    it("creates a tax line on a booking item", async () => {
      const booking = await seedBooking()
      const item = await seedBookingItem(booking.id)

      const res = await app.request(`/booking-items/${item.id}/tax-lines`, {
        method: "POST",
        ...json({
          name: "VAT",
          currency: "USD",
          amountCents: 2000,
          scope: "excluded",
          rateBasisPoints: 2000,
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^bitx_/)
      expect(data.bookingItemId).toBe(item.id)
      expect(data.name).toBe("VAT")
      expect(data.scope).toBe("excluded")
    })

    it("returns 404 for non-existent booking item", async () => {
      const res = await app.request("/booking-items/bkit_00000000000000000000000000/tax-lines", {
        method: "POST",
        ...json({ name: "Tax", currency: "USD", amountCents: 100 }),
      })
      expect(res.status).toBe(404)
    })

    it("rejects negative tax line amounts", async () => {
      const booking = await seedBooking()
      const item = await seedBookingItem(booking.id)

      const createRes = await app.request(`/booking-items/${item.id}/tax-lines`, {
        method: "POST",
        ...json({ name: "Tax", currency: "USD", amountCents: -1 }),
      })
      expect(createRes.status).toBe(400)

      const validRes = await app.request(`/booking-items/${item.id}/tax-lines`, {
        method: "POST",
        ...json({ name: "Tax", currency: "USD", amountCents: 500 }),
      })
      const { data: taxLine } = await validRes.json()

      const updateRes = await app.request(`/booking-items/${item.id}/tax-lines/${taxLine.id}`, {
        method: "PATCH",
        ...json({ amountCents: -1 }),
      })
      expect(updateRes.status).toBe(400)
    })

    it("updates a tax line", async () => {
      const booking = await seedBooking()
      const item = await seedBookingItem(booking.id)

      const createRes = await app.request(`/booking-items/${item.id}/tax-lines`, {
        method: "POST",
        ...json({ name: "GST", currency: "USD", amountCents: 1000 }),
      })
      const { data: taxLine } = await createRes.json()

      const res = await app.request(`/booking-items/${item.id}/tax-lines/${taxLine.id}`, {
        method: "PATCH",
        ...json({ amountCents: 1500, code: "GST-10" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.amountCents).toBe(1500)
      expect(data.code).toBe("GST-10")
    })

    it("deletes a tax line", async () => {
      const booking = await seedBooking()
      const item = await seedBookingItem(booking.id)

      const createRes = await app.request(`/booking-items/${item.id}/tax-lines`, {
        method: "POST",
        ...json({ name: "Tax", currency: "USD", amountCents: 500 }),
      })
      const { data: taxLine } = await createRes.json()

      const res = await app.request(`/booking-items/${item.id}/tax-lines/${taxLine.id}`, {
        method: "DELETE",
      })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })

    it("lists tax lines for a booking item", async () => {
      const booking = await seedBooking()
      const item = await seedBookingItem(booking.id)

      await app.request(`/booking-items/${item.id}/tax-lines`, {
        method: "POST",
        ...json({ name: "VAT", currency: "USD", amountCents: 1000 }),
      })
      await app.request(`/booking-items/${item.id}/tax-lines`, {
        method: "POST",
        ...json({ name: "Service Tax", currency: "USD", amountCents: 500 }),
      })

      const res = await app.request(`/booking-items/${item.id}/tax-lines`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.length).toBe(2)
    })
  })

  // ── Booking Item Commissions ──────────────────────────────────

  describe("Booking Item Commissions", () => {
    it("creates a commission on a booking item", async () => {
      const booking = await seedBooking()
      const item = await seedBookingItem(booking.id)

      const res = await app.request(`/booking-items/${item.id}/commissions`, {
        method: "POST",
        ...json({
          recipientType: "channel",
          commissionModel: "percentage",
          rateBasisPoints: 1500,
          currency: "USD",
          amountCents: 1500,
        }),
      })
      expect(res.status).toBe(201)
      const { data } = await res.json()
      expect(data.id).toMatch(/^bcom_/)
      expect(data.bookingItemId).toBe(item.id)
      expect(data.recipientType).toBe("channel")
      expect(data.commissionModel).toBe("percentage")
    })

    it("returns 404 for non-existent booking item", async () => {
      const res = await app.request("/booking-items/bkit_00000000000000000000000000/commissions", {
        method: "POST",
        ...json({ recipientType: "agency", rateBasisPoints: 1000 }),
      })
      expect(res.status).toBe(404)
    })

    it("rejects percentage commissions without a rate basis", async () => {
      const booking = await seedBooking()
      const item = await seedBookingItem(booking.id)

      const res = await app.request(`/booking-items/${item.id}/commissions`, {
        method: "POST",
        ...json({ recipientType: "agency", commissionModel: "percentage" }),
      })
      expect(res.status).toBe(400)
    })

    it("rejects fixed commissions without amount and currency", async () => {
      const booking = await seedBooking()
      const item = await seedBookingItem(booking.id)

      const res = await app.request(`/booking-items/${item.id}/commissions`, {
        method: "POST",
        ...json({ recipientType: "agency", commissionModel: "fixed" }),
      })
      expect(res.status).toBe(400)
    })

    it("rejects paid commissions without settlement metadata", async () => {
      const booking = await seedBooking()
      const item = await seedBookingItem(booking.id)

      const createRes = await app.request(`/booking-items/${item.id}/commissions`, {
        method: "POST",
        ...json({ recipientType: "agency", rateBasisPoints: 1000, status: "paid" }),
      })
      expect(createRes.status).toBe(400)

      const validRes = await app.request(`/booking-items/${item.id}/commissions`, {
        method: "POST",
        ...json({ recipientType: "agency", rateBasisPoints: 1000 }),
      })
      const { data: commission } = await validRes.json()

      const updateRes = await app.request(
        `/booking-items/${item.id}/commissions/${commission.id}`,
        {
          method: "PATCH",
          ...json({ status: "paid" }),
        },
      )
      expect(updateRes.status).toBe(400)
    })

    it("updates a commission", async () => {
      const booking = await seedBooking()
      const item = await seedBookingItem(booking.id)

      const createRes = await app.request(`/booking-items/${item.id}/commissions`, {
        method: "POST",
        ...json({
          recipientType: "affiliate",
          commissionModel: "fixed",
          amountCents: 2500,
          currency: "USD",
        }),
      })
      const { data: comm } = await createRes.json()

      const res = await app.request(`/booking-items/${item.id}/commissions/${comm.id}`, {
        method: "PATCH",
        ...json({ notes: "Q2 commission" }),
      })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.commissionModel).toBe("fixed")
      expect(data.amountCents).toBe(2500)
      expect(data.status).toBe("pending")
      expect(data.notes).toBe("Q2 commission")
    })

    it("deletes a commission", async () => {
      const booking = await seedBooking()
      const item = await seedBookingItem(booking.id)

      const createRes = await app.request(`/booking-items/${item.id}/commissions`, {
        method: "POST",
        ...json({ recipientType: "agent", rateBasisPoints: 1000 }),
      })
      const { data: comm } = await createRes.json()

      const res = await app.request(`/booking-items/${item.id}/commissions/${comm.id}`, {
        method: "DELETE",
      })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })

    it("lists commissions for a booking item", async () => {
      const booking = await seedBooking()
      const item = await seedBookingItem(booking.id)

      await app.request(`/booking-items/${item.id}/commissions`, {
        method: "POST",
        ...json({ recipientType: "channel", rateBasisPoints: 1000 }),
      })
      await app.request(`/booking-items/${item.id}/commissions`, {
        method: "POST",
        ...json({ recipientType: "agency", rateBasisPoints: 1200 }),
      })

      const res = await app.request(`/booking-items/${item.id}/commissions`, { method: "GET" })
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(data.length).toBe(2)
    })
  })

  // ── Reports ───────────────────────────────────────────────────

  describe("Reports", () => {
    it("returns revenue report (empty)", async () => {
      const res = await app.request("/reports/revenue?from=2025-01-01&to=2025-12-31", {
        method: "GET",
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toBeInstanceOf(Array)
      expect(body.data.length).toBe(0)
    })

    it("returns revenue report with data", async () => {
      const booking = await seedBooking()
      await seedInvoice(booking.id, {
        issueDate: "2025-06-15",
        totalCents: 50000,
      })
      await seedInvoice(booking.id, {
        issueDate: "2025-06-20",
        totalCents: 30000,
      })

      const res = await app.request("/reports/revenue?from=2025-01-01&to=2025-12-31", {
        method: "GET",
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.length).toBe(1) // Both in June
      expect(body.data[0].month).toBe("2025-06")
      expect(body.data[0].count).toBe(2)
      expect(body.data[0].totalCents).toBe(80000)
    })

    it("returns aging report (empty)", async () => {
      const res = await app.request("/reports/aging?asOf=2025-06-01", { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toBeInstanceOf(Array)
      expect(body.data.length).toBe(0)
    })

    it("returns aging report with data", async () => {
      const booking = await seedBooking()
      await seedInvoice(booking.id, {
        dueDate: "2025-01-01",
        status: "issued",
        balanceDueCents: 50000,
      })

      const res = await app.request("/reports/aging?asOf=2025-06-01", { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.length).toBe(1)
      expect(body.data[0].bucket).toBe("90+")
      expect(body.data[0].totalCents).toBe(50000)
      expect(body.data[0].count).toBe(1)
    })

    it("returns profitability report", async () => {
      await seedBooking({
        startDate: "2025-06-01",
        sellAmountCents: 100000,
        costAmountCents: 60000,
        marginPercent: 40,
      })

      const res = await app.request("/reports/profitability?from=2025-01-01&to=2025-12-31", {
        method: "GET",
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.length).toBe(1)
      expect(body.data[0].sellAmountCents).toBe(100000)
      expect(body.data[0].costAmountCents).toBe(60000)
      expect(body.data[0].marginPercent).toBe(40)
    })
  })
})
