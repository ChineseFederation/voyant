// agent-quality: file-size exception -- owner: bookings; existing coverage file stays co-located until a dedicated split preserves behavior and tests.
import {
  actionLedgerEntries,
  actionMutationDetails,
  actionSensitiveReadDetails,
} from "@voyant-travel/action-ledger"
import { eq, sql } from "drizzle-orm"
import { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { availabilitySlotsRef } from "../../src/availability-ref.js"
import {
  optionUnitsRef,
  productDayServicesRef,
  productDaysRef,
  productItinerariesRef,
  productOptionsRef,
  productsRef,
  productTicketSettingsRef,
} from "../../src/products-ref.js"
import { bookingRoutes } from "../../src/routes.js"
import { bookingTravelerTravelDetails } from "../../src/schema/travel-details.js"
import {
  bookingAllocations,
  bookingDocuments,
  bookingFulfillments,
  bookingItems,
  bookingItemTravelers,
  bookingPiiAccessLog,
  bookingTravelers,
} from "../../src/schema.js"
import { bookingsService } from "../../src/service.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

let bookingSeq = 0
function nextBookingNumber() {
  bookingSeq++
  return `BK-TEST-${String(bookingSeq).padStart(6, "0")}`
}

const originalKmsProvider = process.env.KMS_PROVIDER
const originalKmsEnvKey = process.env.KMS_ENV_KEY

describe.skipIf(!DB_AVAILABLE)("Booking routes", () => {
  let app: Hono
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>
  let eventBus: ReturnType<typeof import("@voyant-travel/core").createEventBus>

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    const { generateEnvKmsKey } = await import("@voyant-travel/utils")
    db = createTestDb()
    await cleanupTestDb(db)
    await ensureProductReferenceTables()
    await ensureBookingOriginTables()
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE booking_pii_access_action AS ENUM ('read', 'update', 'delete');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE booking_pii_access_outcome AS ENUM ('allowed', 'denied');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS booking_pii_access_log (
        id text PRIMARY KEY NOT NULL,
        booking_id text,
        traveler_id text,
        actor_id text,
        actor_type text,
        caller_type text,
        action booking_pii_access_action NOT NULL,
        outcome booking_pii_access_outcome NOT NULL,
        reason text,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_booking_pii_access_log_booking ON booking_pii_access_log (booking_id)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_booking_pii_access_log_traveler ON booking_pii_access_log (traveler_id)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_booking_pii_access_log_actor ON booking_pii_access_log (actor_id)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_booking_pii_access_log_created_at ON booking_pii_access_log (created_at)`,
    )
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE action_ledger_action_kind AS ENUM (
          'read',
          'create',
          'update',
          'delete',
          'execute',
          'approve',
          'reject',
          'reverse',
          'compensate',
          'duplicate'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE action_ledger_status AS ENUM (
          'requested',
          'awaiting_approval',
          'approved',
          'denied',
          'succeeded',
          'failed',
          'reversed',
          'compensated',
          'expired',
          'cancelled',
          'superseded'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE action_ledger_risk AS ENUM ('low', 'medium', 'high', 'critical');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE action_ledger_principal_type AS ENUM (
          'user',
          'api_key',
          'agent',
          'workflow',
          'system'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE action_ledger_reversal_kind AS ENUM (
          'none',
          'revert',
          'compensate',
          'domain_command'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE action_ledger_approval_status AS ENUM (
          'pending',
          'approved',
          'denied',
          'expired',
          'cancelled',
          'superseded'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS action_ledger_entries (
        id text PRIMARY KEY NOT NULL,
        occurred_at timestamp with time zone DEFAULT now() NOT NULL,
        action_name text NOT NULL,
        action_version text NOT NULL,
        action_kind action_ledger_action_kind NOT NULL,
        status action_ledger_status NOT NULL,
        evaluated_risk action_ledger_risk NOT NULL,
        actor_type text,
        principal_type action_ledger_principal_type NOT NULL,
        principal_id text NOT NULL,
        principal_subtype text,
        session_id text,
        api_token_id text,
        internal_request boolean DEFAULT false NOT NULL,
        delegated_by_principal_type action_ledger_principal_type,
        delegated_by_principal_id text,
        delegation_id text,
        caller_type text,
        organization_id text,
        route_or_tool_name text,
        workflow_run_id text,
        workflow_step_id text,
        correlation_id text,
        causation_action_id text,
        idempotency_scope text,
        idempotency_key text,
        idempotency_fingerprint text,
        target_type text NOT NULL,
        target_id text NOT NULL,
        capability_id text,
        capability_version text,
        authorization_source text,
        approval_id text,
        amends_action_id text,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS action_sensitive_read_details (
        action_id text PRIMARY KEY NOT NULL REFERENCES action_ledger_entries(id) ON DELETE CASCADE,
        reason_code text,
        disclosed_field_set jsonb,
        disclosure_summary text,
        decision_policy text
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS action_mutation_details (
        action_id text PRIMARY KEY NOT NULL REFERENCES action_ledger_entries(id) ON DELETE CASCADE,
        command_input_ref text,
        command_result_ref text,
        summary text,
        reversal_kind action_ledger_reversal_kind DEFAULT 'none' NOT NULL,
        reversal_command_id text,
        reversal_command_version text,
        reversal_args_ref text,
        reversal_state_projection text,
        reversal_outcome_projection text,
        reverses_action_id text,
        reversed_by_action_id_projection text
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS action_approvals (
        id text PRIMARY KEY NOT NULL,
        requested_action_id text NOT NULL REFERENCES action_ledger_entries(id) ON DELETE CASCADE,
        status action_ledger_approval_status DEFAULT 'pending' NOT NULL,
        requested_by_principal_id text NOT NULL,
        assigned_to_principal_id text,
        decided_by_principal_id text,
        delegated_from_principal_id text,
        policy_name text NOT NULL,
        policy_version text NOT NULL,
        target_snapshot_ref text,
        risk_snapshot action_ledger_risk NOT NULL,
        reason_code text,
        expires_at timestamp with time zone,
        decided_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_action_approvals_requested_action ON action_approvals (requested_action_id)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_action_approvals_status_expires ON action_approvals (status, expires_at)`,
    )
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS idx_action_approvals_assignee ON action_approvals (assigned_to_principal_id, created_at)`,
    )

    process.env.KMS_PROVIDER = "env"
    process.env.KMS_ENV_KEY = generateEnvKmsKey()

    const { createEventBus } = await import("@voyant-travel/core")
    eventBus = createEventBus()

    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      c.set("eventBus" as never, eventBus)
      c.set("userId" as never, "test-user-id")
      c.set("actor" as never, "staff")
      await next()
    })
    app.route("/", bookingRoutes)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    await ensureProductReferenceTables()
    await ensureBookingOriginTables()
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")

    if (originalKmsProvider === undefined) {
      delete process.env.KMS_PROVIDER
    } else {
      process.env.KMS_PROVIDER = originalKmsProvider
    }

    if (originalKmsEnvKey === undefined) {
      delete process.env.KMS_ENV_KEY
    } else {
      process.env.KMS_ENV_KEY = originalKmsEnvKey
    }

    await closeTestDb()
  })

  async function seedBooking(overrides: Record<string, unknown> = {}) {
    const res = await app.request("/", {
      method: "POST",
      ...json({
        bookingNumber: nextBookingNumber(),
        sellCurrency: "USD",
        ...overrides,
      }),
    })
    return (await res.json()).data
  }

  async function ensureProductReferenceTables() {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS products (
        id text PRIMARY KEY,
        name text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        description text,
        visibility text NOT NULL DEFAULT 'public',
        activated boolean NOT NULL DEFAULT true,
        reservation_timeout_minutes integer,
        sell_currency text NOT NULL DEFAULT 'EUR',
        sell_amount_cents integer,
        cost_amount_cents integer,
        margin_percent integer,
        supplier_id text,
        start_date date,
        end_date date,
        pax integer
      )
    `)
  }

  async function ensureBookingOriginTables() {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS booking_origins (
        booking_id text PRIMARY KEY NOT NULL REFERENCES bookings(id) ON DELETE cascade,
        origin_source text DEFAULT 'manual' NOT NULL,
        quote_version_id text,
        trip_snapshot_id text,
        reservation_plan_id text,
        catalog_price_response_id text,
        catalog_snapshot_id text,
        provider_source_kind text,
        provider_source_provider text,
        provider_source_connection_id text,
        provider_source_ref text,
        provider_order_ref text,
        legacy_transaction_offer_id text,
        legacy_transaction_order_id text,
        legacy_transaction_ids jsonb,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT ck_booking_origins_source CHECK (
          origin_source IN (
            'manual',
            'direct_b2c',
            'accepted_quote_version',
            'catalog_price_availability',
            'catalog_snapshot',
            'provider_source_order',
            'legacy_transaction'
          )
        )
      )
    `)
  }

  async function seedSlot(overrides: Record<string, unknown> = {}) {
    const [slot] = await db
      .insert(availabilitySlotsRef)
      .values({
        productId: "prod_test",
        optionId: "opt_test",
        dateLocal: "2026-06-01",
        startsAt: new Date("2026-06-01T09:00:00.000Z"),
        endsAt: new Date("2026-06-01T11:00:00.000Z"),
        timezone: "Europe/Bucharest",
        status: "open",
        unlimited: false,
        initialPax: 10,
        remainingPax: 10,
        ...overrides,
      })
      .returning()

    return slot
  }

  async function seedProductBundle() {
    const [product] = await db
      .insert(productsRef)
      .values({
        name: "Danube cruise",
        sellCurrency: "EUR",
        sellAmountCents: 18000,
        costAmountCents: 12000,
        marginPercent: 33,
        startDate: "2026-07-01",
        endDate: "2026-07-03",
        pax: 2,
      })
      .returning()

    const [option] = await db
      .insert(productOptionsRef)
      .values({
        productId: product.id,
        name: "Standard",
        status: "active",
        isDefault: true,
      })
      .returning()

    const [unit] = await db
      .insert(optionUnitsRef)
      .values({
        optionId: option.id,
        name: "Adult",
        unitType: "person",
        isRequired: true,
        minQuantity: 1,
      })
      .returning()

    const [itinerary] = await db
      .insert(productItinerariesRef)
      .values({ productId: product.id, name: "Default itinerary", isDefault: true })
      .returning()

    const [day] = await db
      .insert(productDaysRef)
      .values({
        itineraryId: itinerary.id,
        dayNumber: 1,
      })
      .returning()

    await db.insert(productDayServicesRef).values({
      dayId: day.id,
      serviceType: "experience",
      name: "Boat operator",
      costCurrency: "EUR",
      costAmountCents: 12000,
    })

    await db.insert(productTicketSettingsRef).values({
      productId: product.id,
      fulfillmentMode: "per_item",
      defaultDeliveryFormat: "qr_code",
      ticketPerUnit: false,
    })

    return { product, option, unit }
  }

  describe("Bookings CRUD", () => {
    it("looks up booking overview internally by booking code without customer email", async () => {
      const booking = await seedBooking({
        bookingNumber: "BK-ADMIN-0001",
        status: "confirmed",
        sellAmountCents: 24000,
      })

      await db.insert(bookingTravelers).values({
        bookingId: booking.id,
        participantType: "traveler",
        firstName: "Elena",
        lastName: "Popescu",
        email: "elena@example.com",
        isPrimary: true,
      })
      await db.insert(bookingDocuments).values({
        bookingId: booking.id,
        type: "passport_copy",
        fileName: "passport.pdf",
        fileUrl: "https://example.com/passport.pdf",
      })
      await db.insert(bookingFulfillments).values({
        bookingId: booking.id,
        fulfillmentType: "service_voucher",
        deliveryChannel: "email",
        status: "issued",
      })

      const res = await app.request("/overview?bookingCode=BK-ADMIN-0001")

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toMatchObject({
        bookingId: booking.id,
        bookingNumber: "BK-ADMIN-0001",
        status: "confirmed",
      })
      expect(body.data.documents).toHaveLength(1)
      expect(body.data.fulfillments).toHaveLength(1)
      expect(body.data.travelers[0]?.firstName).toBe("Elena")
    })

    it("lists bookings", async () => {
      await seedBooking()
      const res = await app.request("/", { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toBeInstanceOf(Array)
      expect(body.total).toBeGreaterThanOrEqual(1)
    })

    it("searches booking contact snapshots and external references", async () => {
      const target = await seedBooking({
        bookingNumber: "BK-CONTACT-0001",
        externalBookingRef: "WHATSAPP-REF-40712345678",
        contactFirstName: "Ana",
        contactLastName: "Cimpoeru",
        contactEmail: "ana.cimpoeru@example.com",
        contactPhone: "+40 712 345 678",
        contactCountry: "Romania",
        contactRegion: "Cluj",
        contactCity: "Cluj-Napoca",
        contactAddressLine1: "Strada Memorandumului 10",
        contactAddressLine2: "Etaj 2",
        contactPostalCode: "400114",
        internalNotes: "Prefers an aisle seat",
      })
      const other = await seedBooking({
        bookingNumber: "BK-CONTACT-0002",
        externalBookingRef: "OTHER-REF-42",
        contactFirstName: "Maria",
        contactLastName: "Ionescu",
        contactEmail: "maria.ionescu@example.com",
        contactPhone: "+33 1 44 55 66 77",
        contactCountry: "France",
        contactRegion: "Ile-de-France",
        contactCity: "Paris",
        contactAddressLine1: "Rue de Rivoli 1",
        contactPostalCode: "75001",
      })
      const phoneOnly = await seedBooking({
        bookingNumber: "BK-CONTACT-0003",
        contactFirstName: "Ioana",
        contactLastName: "Phone",
        contactEmail: "ioana.phone@example.com",
        contactPhone: "+40 712 345 678",
      })

      async function expectOnlyTargetForSearch(search: string) {
        const res = await app.request(`/?search=${encodeURIComponent(search)}`, { method: "GET" })
        expect(res.status).toBe(200)
        const body = await res.json()
        const ids = body.data.map((row: { id: string }) => row.id)
        expect(ids).toContain(target.id)
        expect(ids).not.toContain(other.id)
        expect(ids).not.toContain(phoneOnly.id)
      }

      const phoneRes = await app.request(`/?search=${encodeURIComponent("40712345678")}`, {
        method: "GET",
      })
      expect(phoneRes.status).toBe(200)
      const phoneIds = (await phoneRes.json()).data.map((row: { id: string }) => row.id)
      expect(phoneIds).toContain(target.id)
      expect(phoneIds).toContain(phoneOnly.id)

      await expectOnlyTargetForSearch("Ana Cimpoeru")
      await expectOnlyTargetForSearch("ANA.CIMPOERU")
      await expectOnlyTargetForSearch("WHATSAPP-REF-40712345678")
      await expectOnlyTargetForSearch("Memorandumului")
      await expectOnlyTargetForSearch("Etaj 2")
      await expectOnlyTargetForSearch("Cluj-Napoca")
      await expectOnlyTargetForSearch("400114")
    })

    it("hydrates booking list item summaries with product names", async () => {
      const { product } = await seedProductBundle()
      const booking = await seedBooking()

      await db.insert(bookingItems).values({
        bookingId: booking.id,
        title: "Adult x 1",
        productId: product.id,
        itemType: "unit",
        status: "confirmed",
        quantity: 1,
        sellCurrency: "EUR",
      })

      const res = await app.request("/", { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()
      const listedBooking = body.data.find((row: { id: string }) => row.id === booking.id)

      expect(listedBooking?.items[0]).toMatchObject({
        title: "Adult x 1",
        productId: product.id,
        productName: product.name,
      })
    })

    it("lists bookings when the products table is not installed", async () => {
      const booking = await seedBooking()
      const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")

      await db.insert(bookingItems).values({
        bookingId: booking.id,
        title: "Standalone item",
        productId: "prod_standalone",
        itemType: "unit",
        status: "confirmed",
        quantity: 1,
        sellCurrency: "EUR",
      })

      await db.execute(sql`DROP TABLE IF EXISTS products CASCADE`)

      try {
        const res = await app.request("/", { method: "GET" })
        expect(res.status).toBe(200)
        const body = await res.json()
        const listedBooking = body.data.find((row: { id: string }) => row.id === booking.id)

        expect(listedBooking?.items[0]).toMatchObject({
          title: "Standalone item",
          productId: "prod_standalone",
          productName: null,
        })
      } finally {
        await cleanupTestDb(db)
      }
    })

    it("returns dashboard aggregates", async () => {
      // Future-dated confirmed booking → counted in upcomingDepartures.
      const future = new Date()
      future.setUTCMonth(future.getUTCMonth() + 2)
      await seedBooking({
        status: "confirmed",
        startDate: future.toISOString().slice(0, 10),
        sellAmountCents: 15000,
      })
      // Past cancelled booking → must drop out of monthlyRevenue + upcoming.
      await seedBooking({
        status: "cancelled",
        startDate: "2020-01-01",
        sellAmountCents: 99999,
      })

      const res = await app.request("/aggregates", { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.total).toBeGreaterThanOrEqual(2)
      // countsByStatus includes all 7 statuses with zeroes for unused ones.
      const statuses = body.data.countsByStatus.map((row: { status: string }) => row.status)
      expect(statuses).toEqual(
        expect.arrayContaining([
          "draft",
          "on_hold",
          "confirmed",
          "in_progress",
          "completed",
          "expired",
          "cancelled",
        ]),
      )
      expect(body.data.upcomingDepartures).toBeGreaterThanOrEqual(1)
      // Revenue only counts the confirmed booking (cancelled is excluded).
      const revenueTotal = body.data.monthlyRevenue.reduce(
        (sum: number, row: { sellAmountCents: number }) => sum + row.sellAmountCents,
        0,
      )
      expect(revenueTotal).toBe(15000)
    })

    it("gets a booking by id", async () => {
      const booking = await seedBooking()
      const res = await app.request(`/${booking.id}`, { method: "GET" })
      expect(res.status).toBe(200)
      expect((await res.json()).data.id).toBe(booking.id)
    })

    it("updates a booking", async () => {
      const booking = await seedBooking()
      const res = await app.request(`/${booking.id}`, {
        method: "PATCH",
        ...json({ internalNotes: "Updated" }),
      })
      expect(res.status).toBe(200)
      expect((await res.json()).data.internalNotes).toBe("Updated")
    })

    it("deletes a booking", async () => {
      const booking = await seedBooking()
      const res = await app.request(`/${booking.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })

    it("returns 404 for non-existent booking", async () => {
      const res = await app.request("/book_00000000000000000000000000", { method: "GET" })
      expect(res.status).toBe(404)
    })
  })

  describe("Booking Status", () => {
    it("changes booking status", async () => {
      const booking = await seedBooking()
      const res = await app.request(`/${booking.id}/status`, {
        method: "PATCH",
        ...json({ status: "confirmed" }),
      })
      expect(res.status).toBe(200)
      expect((await res.json()).data.status).toBe("confirmed")
    })

    it("creates activity log entry on status change", async () => {
      const booking = await seedBooking()
      await app.request(`/${booking.id}/status`, {
        method: "PATCH",
        ...json({ status: "confirmed" }),
      })

      const actRes = await app.request(`/${booking.id}/activity`, { method: "GET" })
      const actBody = await actRes.json()
      const statusEntry = actBody.data.find(
        (a: Record<string, unknown>) => a.activityType === "status_change",
      )
      expect(statusEntry).toBeTruthy()
    })

    it("creates note when status change includes note", async () => {
      const booking = await seedBooking()
      await app.request(`/${booking.id}/status`, {
        method: "PATCH",
        ...json({ status: "cancelled", note: "Client requested" }),
      })

      const notesRes = await app.request(`/${booking.id}/notes`, { method: "GET" })
      const notesBody = await notesRes.json()
      const note = notesBody.data.find(
        (n: Record<string, unknown>) => n.content === "Client requested",
      )
      expect(note).toBeTruthy()
    })

    it("returns 404 for non-existent booking status change", async () => {
      const res = await app.request("/book_00000000000000000000000000/status", {
        method: "PATCH",
        ...json({ status: "confirmed" }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe("Booking updates", () => {
    it("clears confirmedAt when a generic update leaves the booking non-confirmed", async () => {
      const booking = await seedBooking({
        status: "draft",
        confirmedAt: "2026-06-01T10:00:00.000Z",
      })

      expect(booking.status).toBe("draft")
      expect(booking.confirmedAt).toBeNull()

      const res = await app.request(`/${booking.id}`, {
        method: "PATCH",
        ...json({ confirmedAt: "2026-06-01T10:00:00.000Z" }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.status).toBe("draft")
      expect(body.data.confirmedAt).toBeNull()
    })

    it("clears confirmedAt when a generic update moves a booking out of confirmed", async () => {
      const booking = await seedBooking({ status: "confirmed" })
      expect(booking.confirmedAt).toBeTruthy()

      const res = await app.request(`/${booking.id}`, {
        method: "PATCH",
        ...json({ status: "draft" }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.status).toBe("draft")
      expect(body.data.confirmedAt).toBeNull()
    })
  })

  describe("Travelers", () => {
    it("creates a traveler", async () => {
      const booking = await seedBooking()
      const res = await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "John", lastName: "Doe" }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.firstName).toBe("John")
      expect(body.data.participantType).toBe("traveler")
      expect(body.data.travelerCategory).toBe("adult")
    })

    it("keeps pax, traveler category, and item assignments in sync when adding traveler details", async () => {
      const booking = await seedBooking({ pax: 1 })
      await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "Existing", lastName: "Traveler" }),
      })
      const itemRes = await app.request(`/${booking.id}/items`, {
        method: "POST",
        ...json({ title: "Tour", sellCurrency: "USD" }),
      })
      const { data: item } = await itemRes.json()

      const res = await app.request(`/${booking.id}/travelers/with-travel-details`, {
        method: "POST",
        ...json({
          firstName: "New",
          lastName: "Traveler",
          documentType: "passport",
          documentNumber: "DOC-123",
        }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.traveler.travelerCategory).toBe("adult")
      expect(body.data.travelDetails.documentNumber).toBe("DOC-123")

      const bookingRes = await app.request(`/${booking.id}`, { method: "GET" })
      expect((await bookingRes.json()).data.pax).toBe(2)

      const links = await db
        .select()
        .from(bookingItemTravelers)
        .where(eq(bookingItemTravelers.bookingItemId, item.id))

      expect(links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            travelerId: body.data.traveler.id,
            role: "traveler",
          }),
        ]),
      )
    })

    it("lists travelers", async () => {
      const booking = await seedBooking()
      await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "Jane", lastName: "Smith" }),
      })

      const res = await app.request(`/${booking.id}/travelers`, { method: "GET" })
      expect(res.status).toBe(200)
      expect((await res.json()).data.length).toBe(1)
    })

    it("updates a traveler", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "John", lastName: "Doe" }),
      })
      const { data: participant } = await createRes.json()

      const res = await app.request(`/${booking.id}/travelers/${participant.id}`, {
        method: "PATCH",
        ...json({ firstName: "Jonathan" }),
      })
      expect(res.status).toBe(200)
      expect((await res.json()).data.firstName).toBe("Jonathan")
    })

    it("deletes a traveler", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "John", lastName: "Doe" }),
      })
      const { data: participant } = await createRes.json()

      const res = await app.request(`/${booking.id}/travelers/${participant.id}`, {
        method: "DELETE",
      })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })

    it("returns 404 when adding traveler to non-existent booking", async () => {
      const res = await app.request("/book_00000000000000000000000000/travelers", {
        method: "POST",
        ...json({ firstName: "John", lastName: "Doe" }),
      })
      expect(res.status).toBe(404)
    })

    it("stores participant travel details encrypted and reads them back through the route", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "Ana", lastName: "Traveler" }),
      })
      const { data: participant } = await createRes.json()

      const patchRes = await app.request(
        `/${booking.id}/travelers/${participant.id}/travel-details`,
        {
          method: "PATCH",
          ...json({
            nationality: "RO",
            documentNumber: "X1234567",
            dietaryRequirements: "vegetarian",
            isLeadTraveler: true,
            sharingGroupId: "share_route_1",
            roomTypeId: "rt_double",
            bedPreference: "twin",
            allocations: { room: "room_102" },
          }),
        },
      )

      expect(patchRes.status).toBe(200)
      expect((await patchRes.json()).data.documentNumber).toBe("X1234567")

      const [stored] = await db
        .select()
        .from(bookingTravelerTravelDetails)
        .where(eq(bookingTravelerTravelDetails.travelerId, participant.id))

      expect(stored?.identityEncrypted?.enc).toMatch(/^env:v1:/)
      expect(stored?.identityEncrypted?.enc).not.toContain("X1234567")

      const getRes = await app.request(
        `/${booking.id}/travelers/${participant.id}/travel-details`,
        {
          method: "GET",
        },
      )

      expect(getRes.status).toBe(200)
      const body = await getRes.json()
      expect(body.data.nationality).toBe("RO")
      expect(body.data.dietaryRequirements).toBe("vegetarian")
      expect(body.data.isLeadTraveler).toBe(true)
      expect(body.data.sharingGroupId).toBe("share_route_1")
      expect(body.data.roomTypeId).toBe("rt_double")
      expect(body.data.bedPreference).toBe("twin")
      expect(body.data.allocations).toEqual({ room: "room_102" })
    })

    it("lists slot sharing groups and their travelers", async () => {
      const slot = await seedSlot()
      const booking = await seedBooking({ status: "confirmed" })
      const [item] = await db
        .insert(bookingItems)
        .values({
          bookingId: booking.id,
          title: "Double sharing",
          itemType: "accommodation",
          status: "confirmed",
          quantity: 1,
          sellCurrency: "USD",
        })
        .returning()

      await db.insert(bookingAllocations).values({
        bookingId: booking.id,
        bookingItemId: item!.id,
        availabilitySlotId: slot.id,
        quantity: 1,
        status: "confirmed",
      })

      const travelerPayloads = [
        { firstName: "Ana", lastName: "One", isLeadTraveler: true },
        { firstName: "Bogdan", lastName: "Two", isLeadTraveler: false },
      ]

      for (const travelerPayload of travelerPayloads) {
        const createRes = await app.request(`/${booking.id}/travelers`, {
          method: "POST",
          ...json({
            firstName: travelerPayload.firstName,
            lastName: travelerPayload.lastName,
          }),
        })
        const { data: traveler } = await createRes.json()
        await app.request(`/${booking.id}/travelers/${traveler.id}/travel-details`, {
          method: "PATCH",
          ...json({
            isLeadTraveler: travelerPayload.isLeadTraveler,
            sharingGroupId: "share_slot_1",
            roomTypeId: "rt_double",
            bedPreference: "double",
          }),
        })
      }

      const groupsRes = await app.request(`/sharing-groups?slotId=${slot.id}`)
      expect(groupsRes.status).toBe(200)
      const groupsBody = await groupsRes.json()
      expect(groupsBody.data).toEqual([
        {
          id: "share_slot_1",
          label: "share_slot_1",
          occupancy: 2,
          roomTypeId: "rt_double",
          bookingIds: [booking.id],
        },
      ])

      const travelersRes = await app.request(
        `/sharing-groups/share_slot_1/travelers?slotId=${slot.id}`,
      )
      expect(travelersRes.status).toBe(200)
      const travelersBody = await travelersRes.json()
      expect(travelersBody.data).toHaveLength(2)
      expect(travelersBody.data[0]).toMatchObject({
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        sharingGroupId: "share_slot_1",
        roomTypeId: "rt_double",
        bedPreference: "double",
      })
    })

    it("preserves unspecified travel detail fields on partial update", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "Mira", lastName: "Traveler" }),
      })
      const { data: participant } = await createRes.json()

      await app.request(`/${booking.id}/travelers/${participant.id}/travel-details`, {
        method: "PATCH",
        ...json({
          documentNumber: "AB12345",
          dietaryRequirements: "vegan",
        }),
      })

      const patchRes = await app.request(
        `/${booking.id}/travelers/${participant.id}/travel-details`,
        {
          method: "PATCH",
          ...json({
            dietaryRequirements: "gluten-free",
          }),
        },
      )

      expect(patchRes.status).toBe(200)
      const body = await patchRes.json()
      expect(body.data.documentNumber).toBe("AB12345")
      expect(body.data.dietaryRequirements).toBe("gluten-free")
    })

    it("keeps travel details out of the standard participant list response", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "Safe", lastName: "Boundary" }),
      })
      const { data: participant } = await createRes.json()

      await app.request(`/${booking.id}/travelers/${participant.id}/travel-details`, {
        method: "PATCH",
        ...json({
          documentNumber: "SECRET123",
          dateOfBirth: "1991-04-03",
        }),
      })

      const listRes = await app.request(`/${booking.id}/travelers`, { method: "GET" })
      expect(listRes.status).toBe(200)
      const body = await listRes.json()

      expect(body.data[0]).not.toHaveProperty("documentNumber")
      expect(body.data[0]).not.toHaveProperty("dateOfBirth")
      expect(body.data[0]).not.toHaveProperty("dietaryRequirements")
    })

    it("returns 404 when reading travel details for a participant outside the booking scope", async () => {
      const bookingA = await seedBooking()
      const bookingB = await seedBooking()
      const createRes = await app.request(`/${bookingA.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "Scoped", lastName: "Traveler" }),
      })
      const { data: participant } = await createRes.json()

      const res = await app.request(`/${bookingB.id}/travelers/${participant.id}/travel-details`, {
        method: "GET",
      })

      expect(res.status).toBe(404)
    })

    it("persists pii access audit rows for allowed access", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "Audit", lastName: "Allowed" }),
      })
      const { data: participant } = await createRes.json()

      await app.request(`/${booking.id}/travelers/${participant.id}/travel-details`, {
        method: "PATCH",
        ...json({ documentNumber: "AUDIT-1" }),
      })

      const readRes = await app.request(
        `/${booking.id}/travelers/${participant.id}/travel-details`,
        {
          method: "GET",
        },
      )
      expect(readRes.status).toBe(200)

      const rows = await db
        .select()
        .from(bookingPiiAccessLog)
        .where(eq(bookingPiiAccessLog.travelerId, participant.id))

      expect(
        rows.some(
          (row: { action: string; outcome: string }) =>
            row.action === "update" && row.outcome === "allowed",
        ),
      ).toBe(true)
      expect(
        rows.some(
          (row: { action: string; outcome: string }) =>
            row.action === "read" && row.outcome === "allowed",
        ),
      ).toBe(true)

      const ledgerRows = await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.targetId, participant.id))
      const sensitiveReadRows = await db.select().from(actionSensitiveReadDetails)

      expect(
        ledgerRows.some(
          (row) =>
            row.actionName === "booking.pii.read" &&
            row.actionKind === "read" &&
            row.status === "succeeded" &&
            row.principalType === "user" &&
            row.principalId === "test-user-id" &&
            row.targetType === "booking_traveler" &&
            row.authorizationSource === "actor_context",
        ),
      ).toBe(true)
      expect(
        sensitiveReadRows.some(
          (row) =>
            row.reasonCode === "travel_details_reveal" &&
            row.decisionPolicy === "bookings-pii-scope-or-staff-v1" &&
            row.disclosedFieldSet?.includes("documentNumber"),
        ),
      ).toBe(true)
    })

    it("writes action ledger entries for traveler and travel-detail mutations", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "Ledger", lastName: "Traveler" }),
      })
      expect(createRes.status).toBe(201)
      const { data: participant } = await createRes.json()

      const updateRes = await app.request(`/${booking.id}/travelers/${participant.id}`, {
        method: "PATCH",
        ...json({ email: "ledger@example.test" }),
      })
      expect(updateRes.status).toBe(200)

      const travelDetailRes = await app.request(
        `/${booking.id}/travelers/${participant.id}/travel-details`,
        {
          method: "PATCH",
          ...json({ documentNumber: "LEDGER-SECRET" }),
        },
      )
      expect(travelDetailRes.status).toBe(200)

      const deleteTravelDetailRes = await app.request(
        `/${booking.id}/travelers/${participant.id}/travel-details`,
        {
          method: "DELETE",
        },
      )
      expect(deleteTravelDetailRes.status).toBe(200)

      const ledgerRows = await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.targetId, participant.id))
      const mutationDetails = await db.select().from(actionMutationDetails)
      const detailByActionId = new Map(
        mutationDetails.map((detail) => [detail.actionId, detail.summary]),
      )

      expect(
        ledgerRows.some(
          (row) =>
            row.actionName === "booking.traveler.create" &&
            row.actionKind === "create" &&
            row.status === "succeeded" &&
            row.targetType === "booking_traveler" &&
            detailByActionId.get(row.id) === "Created booking traveler fields: firstName, lastName",
        ),
      ).toBe(true)
      expect(
        ledgerRows.some(
          (row) =>
            row.actionName === "booking.traveler.update" &&
            row.actionKind === "update" &&
            detailByActionId.get(row.id) === "Updated booking traveler fields: email",
        ),
      ).toBe(true)
      expect(
        ledgerRows.some(
          (row) =>
            row.actionName === "booking.traveler_travel_details.update" &&
            row.actionKind === "update" &&
            detailByActionId.get(row.id) ===
              "Updated booking traveler travel details fields: documentNumber",
        ),
      ).toBe(true)
      expect(
        ledgerRows.some(
          (row) =>
            row.actionName === "booking.traveler_travel_details.delete" &&
            row.actionKind === "delete" &&
            detailByActionId.get(row.id) === "Deleted booking traveler travel details",
        ),
      ).toBe(true)
      expect([...detailByActionId.values()].join(" ")).not.toContain("LEDGER-SECRET")
      expect([...detailByActionId.values()].join(" ")).not.toContain("ledger@example.test")
    })

    it("allows scoped non-staff pii reads through the action ledger capability guard", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "Scoped", lastName: "Reader" }),
      })
      const { data: participant } = await createRes.json()

      await app.request(`/${booking.id}/travelers/${participant.id}/travel-details`, {
        method: "PATCH",
        ...json({ documentNumber: "SCOPED-1" }),
      })

      const scopedApp = new Hono()
      scopedApp.use("*", async (c, next) => {
        c.set("db" as never, db)
        c.set("userId" as never, "scoped-customer-id")
        c.set("actor" as never, "customer")
        c.set("callerType" as never, "api_key")
        c.set("scopes" as never, ["bookings-pii:read"])
        await next()
      })
      scopedApp.route("/", bookingRoutes)

      const res = await scopedApp.request(
        `/${booking.id}/travelers/${participant.id}/travel-details`,
        {
          method: "GET",
        },
      )

      expect(res.status).toBe(200)

      const ledgerRows = await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.targetId, participant.id))

      expect(
        ledgerRows.some(
          (row) =>
            row.actionName === "booking.pii.read" &&
            row.status === "succeeded" &&
            row.principalId === "scoped-customer-id" &&
            row.authorizationSource === "scope",
        ),
      ).toBe(true)
    })

    it("forbids pii access for non-staff actors without explicit scope and audits the denial", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "Audit", lastName: "Denied" }),
      })
      const { data: participant } = await createRes.json()

      const restrictedApp = new Hono()
      restrictedApp.use("*", async (c, next) => {
        c.set("db" as never, db)
        c.set("userId" as never, "test-customer-id")
        c.set("actor" as never, "customer")
        await next()
      })
      restrictedApp.route("/", bookingRoutes)

      const res = await restrictedApp.request(
        `/${booking.id}/travelers/${participant.id}/travel-details`,
        {
          method: "GET",
        },
      )

      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({
        error: "Forbidden",
        code: "forbidden",
      })

      const rows = await db
        .select()
        .from(bookingPiiAccessLog)
        .where(eq(bookingPiiAccessLog.travelerId, participant.id))

      expect(
        rows.some(
          (row: {
            action: string
            outcome: string
            reason: string | null
            actorId: string | null
          }) =>
            row.action === "read" &&
            row.outcome === "denied" &&
            row.reason === "actor_not_allowed" &&
            row.actorId === "test-customer-id",
        ),
      ).toBe(true)

      const ledgerRows = await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.targetId, participant.id))
      const sensitiveReadRows = await db.select().from(actionSensitiveReadDetails)

      expect(
        ledgerRows.some(
          (row) =>
            row.actionName === "booking.pii.read" &&
            row.status === "denied" &&
            row.principalType === "user" &&
            row.principalId === "test-customer-id" &&
            row.authorizationSource === "actor_context",
        ),
      ).toBe(true)
      expect(sensitiveReadRows.some((row) => row.reasonCode === "actor_not_allowed")).toBe(true)
    })
  })

  describe("Items", () => {
    it("creates a booking item", async () => {
      const booking = await seedBooking()
      const res = await app.request(`/${booking.id}/items`, {
        method: "POST",
        ...json({ title: "Airport Transfer", sellCurrency: "USD" }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.title).toBe("Airport Transfer")
      expect(body.data.itemType).toBe("unit")
      expect(body.data.quantity).toBe(1)
    })

    it("returns validation errors for cost amounts without cost currency", async () => {
      const booking = await seedBooking()
      const res = await app.request(`/${booking.id}/items`, {
        method: "POST",
        ...json({ title: "Airport Transfer", sellCurrency: "USD", totalCostAmountCents: 12000 }),
      })
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        error: expect.stringContaining("Cost currency is required"),
      })
    })

    it("lists booking items", async () => {
      const booking = await seedBooking()
      await app.request(`/${booking.id}/items`, {
        method: "POST",
        ...json({ title: "Hotel", sellCurrency: "USD" }),
      })

      const res = await app.request(`/${booking.id}/items`, { method: "GET" })
      expect(res.status).toBe(200)
      expect((await res.json()).data.length).toBe(1)
    })

    it("updates a booking item", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/items`, {
        method: "POST",
        ...json({ title: "Transfer", sellCurrency: "USD" }),
      })
      const { data: item } = await createRes.json()

      const res = await app.request(`/${booking.id}/items/${item.id}`, {
        method: "PATCH",
        ...json({ title: "VIP Transfer" }),
      })
      expect(res.status).toBe(200)
      expect((await res.json()).data.title).toBe("VIP Transfer")
    })

    it("deletes a booking item", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/items`, {
        method: "POST",
        ...json({ title: "Transfer", sellCurrency: "USD" }),
      })
      const { data: item } = await createRes.json()

      const res = await app.request(`/${booking.id}/items/${item.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)

      const activityRes = await app.request(`/${booking.id}/activity`, { method: "GET" })
      expect(activityRes.status).toBe(200)
      const activityBody = await activityRes.json()
      expect(
        activityBody.data.some(
          (entry: Record<string, unknown>) =>
            entry.activityType === "item_update" &&
            entry.description === 'Booking item "Transfer" deleted' &&
            (entry.metadata as Record<string, unknown> | null)?.bookingItemId === item.id,
        ),
      ).toBe(true)
    })

    it("rejects item mutations for cancelled bookings", async () => {
      const booking = await seedBooking({ status: "cancelled" })
      const [item] = await db
        .insert(bookingItems)
        .values({
          bookingId: booking.id,
          title: "Cancelled item",
          itemType: "unit",
          status: "cancelled",
          quantity: 1,
          sellCurrency: "USD",
        })
        .returning()

      const create = await app.request(`/${booking.id}/items`, {
        method: "POST",
        ...json({ title: "Late add", sellCurrency: "USD" }),
      })
      expect(create.status).toBe(409)
      await expect(create.json()).resolves.toMatchObject({
        error: "Cancelled bookings cannot be changed",
      })

      const update = await app.request(`/${booking.id}/items/${item.id}`, {
        method: "PATCH",
        ...json({ title: "Changed" }),
      })
      expect(update.status).toBe(409)
      await expect(update.json()).resolves.toMatchObject({
        error: "Cancelled bookings cannot be changed",
      })

      const remove = await app.request(`/${booking.id}/items/${item.id}`, { method: "DELETE" })
      expect(remove.status).toBe(409)
      await expect(remove.json()).resolves.toMatchObject({
        error: "Cancelled bookings cannot be changed",
      })

      const [unchanged] = await db.select().from(bookingItems).where(eq(bookingItems.id, item.id))
      expect(unchanged?.title).toBe("Cancelled item")
    })

    it("returns 404 when adding item to non-existent booking", async () => {
      const res = await app.request("/book_00000000000000000000000000/items", {
        method: "POST",
        ...json({ title: "Transfer", sellCurrency: "USD" }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe("Item Travelers", () => {
    async function seedBookingWithItemAndTraveler() {
      const booking = await seedBooking()
      const itemRes = await app.request(`/${booking.id}/items`, {
        method: "POST",
        ...json({ title: "Tour", sellCurrency: "USD" }),
      })
      const { data: item } = await itemRes.json()

      const partRes = await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "John", lastName: "Doe" }),
      })
      const { data: participant } = await partRes.json()

      return { booking, item, participant }
    }

    it("links a traveler to an item", async () => {
      const { booking, item, participant } = await seedBookingWithItemAndTraveler()
      const res = await app.request(`/${booking.id}/items/${item.id}/travelers`, {
        method: "POST",
        ...json({ travelerId: participant.id }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.travelerId).toBe(participant.id)
      expect(body.data.role).toBe("traveler")
    })

    it("lists item travelers", async () => {
      const { booking, item, participant } = await seedBookingWithItemAndTraveler()
      await app.request(`/${booking.id}/items/${item.id}/travelers`, {
        method: "POST",
        ...json({ travelerId: participant.id }),
      })

      const res = await app.request(`/${booking.id}/items/${item.id}/travelers`, {
        method: "GET",
      })
      expect(res.status).toBe(200)
      expect((await res.json()).data.length).toBe(1)
    })

    it("unlinks a traveler from an item", async () => {
      const { booking, item, participant } = await seedBookingWithItemAndTraveler()
      const linkRes = await app.request(`/${booking.id}/items/${item.id}/travelers`, {
        method: "POST",
        ...json({ travelerId: participant.id }),
      })
      const { data: link } = await linkRes.json()

      const res = await app.request(`/${booking.id}/items/${item.id}/travelers/${link.id}`, {
        method: "DELETE",
      })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })

    it("rejects item traveler mutations for cancelled bookings", async () => {
      const booking = await seedBooking({ status: "cancelled" })
      const [item] = await db
        .insert(bookingItems)
        .values({
          bookingId: booking.id,
          title: "Cancelled item",
          itemType: "unit",
          status: "cancelled",
          quantity: 1,
          sellCurrency: "USD",
        })
        .returning()
      const [participant] = await db
        .insert(bookingTravelers)
        .values({
          bookingId: booking.id,
          firstName: "John",
          lastName: "Doe",
          participantType: "traveler",
        })
        .returning()
      const [link] = await db
        .insert(bookingItemTravelers)
        .values({ bookingItemId: item.id, travelerId: participant.id, role: "traveler" })
        .returning()

      const create = await app.request(`/${booking.id}/items/${item.id}/travelers`, {
        method: "POST",
        ...json({ travelerId: participant.id }),
      })
      expect(create.status).toBe(409)
      await expect(create.json()).resolves.toMatchObject({
        error: "Cancelled bookings cannot be changed",
      })

      const remove = await app.request(`/${booking.id}/items/${item.id}/travelers/${link.id}`, {
        method: "DELETE",
      })
      expect(remove.status).toBe(409)
      await expect(remove.json()).resolves.toMatchObject({
        error: "Cancelled bookings cannot be changed",
      })
    })
  })

  describe("Supplier Statuses", () => {
    const validStatus = {
      serviceName: "Hotel Transfer",
      costCurrency: "USD",
      costAmountCents: 5000,
    }

    it("creates a supplier status", async () => {
      const booking = await seedBooking()
      const res = await app.request(`/${booking.id}/supplier-statuses`, {
        method: "POST",
        ...json(validStatus),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.serviceName).toBe("Hotel Transfer")
      expect(body.data.status).toBe("pending")
    })

    it("lists supplier statuses", async () => {
      const booking = await seedBooking()
      await app.request(`/${booking.id}/supplier-statuses`, {
        method: "POST",
        ...json(validStatus),
      })

      const res = await app.request(`/${booking.id}/supplier-statuses`, { method: "GET" })
      expect(res.status).toBe(200)
      expect((await res.json()).data.length).toBe(1)
    })

    it("updates supplier status and auto-sets confirmedAt", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/supplier-statuses`, {
        method: "POST",
        ...json(validStatus),
      })
      const { data: ss } = await createRes.json()

      const res = await app.request(`/${booking.id}/supplier-statuses/${ss.id}`, {
        method: "PATCH",
        ...json({ status: "confirmed" }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.status).toBe("confirmed")
      expect(body.data.confirmedAt).toBeTruthy()
    })

    it("returns 404 when adding to non-existent booking", async () => {
      const res = await app.request("/book_00000000000000000000000000/supplier-statuses", {
        method: "POST",
        ...json(validStatus),
      })
      expect(res.status).toBe(404)
    })
  })

  describe("Fulfillment", () => {
    it("creates, lists, and updates booking fulfillments", async () => {
      const booking = await seedBooking()
      const itemRes = await app.request(`/${booking.id}/items`, {
        method: "POST",
        ...json({ title: "Museum entry", sellCurrency: "USD" }),
      })
      const { data: item } = await itemRes.json()

      const participantRes = await app.request(`/${booking.id}/travelers`, {
        method: "POST",
        ...json({ firstName: "Ana", lastName: "Traveler" }),
      })
      const { data: participant } = await participantRes.json()

      const createRes = await app.request(`/${booking.id}/fulfillments`, {
        method: "POST",
        ...json({
          bookingItemId: item.id,
          travelerId: participant.id,
          fulfillmentType: "service_voucher",
          deliveryChannel: "download",
          artifactUrl: "https://example.com/service-voucher.pdf",
        }),
      })

      expect(createRes.status).toBe(201)
      const { data: fulfillment } = await createRes.json()
      expect(fulfillment.status).toBe("issued")
      expect(fulfillment.bookingItemId).toBe(item.id)
      expect(fulfillment.travelerId).toBe(participant.id)

      const listRes = await app.request(`/${booking.id}/fulfillments`, { method: "GET" })
      expect(listRes.status).toBe(200)
      expect((await listRes.json()).data).toHaveLength(1)

      const updateRes = await app.request(`/${booking.id}/fulfillments/${fulfillment.id}`, {
        method: "PATCH",
        ...json({ status: "revoked" }),
      })
      expect(updateRes.status).toBe(200)
      expect((await updateRes.json()).data.status).toBe("revoked")
    })
  })

  describe("Activity Log", () => {
    it("records booking creation in activity log", async () => {
      const booking = await seedBooking()
      const res = await app.request(`/${booking.id}/activity`, { method: "GET" })
      expect(res.status).toBe(200)
      const body = await res.json()
      const created = body.data.find(
        (a: Record<string, unknown>) => a.activityType === "booking_created",
      )
      expect(created).toBeTruthy()
    })
  })

  describe("Notes", () => {
    it("creates a note", async () => {
      const booking = await seedBooking()
      const res = await app.request(`/${booking.id}/notes`, {
        method: "POST",
        ...json({ content: "Important note" }),
      })
      expect(res.status).toBe(201)
      expect((await res.json()).data.content).toBe("Important note")
    })

    it("lists notes", async () => {
      const booking = await seedBooking()
      await app.request(`/${booking.id}/notes`, {
        method: "POST",
        ...json({ content: "Note 1" }),
      })

      const res = await app.request(`/${booking.id}/notes`, { method: "GET" })
      expect(res.status).toBe(200)
      expect((await res.json()).data.length).toBe(1)
    })

    it("records note edit/delete activity and advances the booking updated timestamp", async () => {
      const booking = await seedBooking()
      const initialUpdatedAt = new Date(booking.updatedAt).getTime()

      const createRes = await app.request(`/${booking.id}/notes`, {
        method: "POST",
        ...json({ content: "Original note" }),
      })
      expect(createRes.status).toBe(201)
      const createdNote = (await createRes.json()).data

      const afterCreate = await bookingsService.getBookingById(db, booking.id)
      expect(afterCreate).toBeTruthy()
      expect(afterCreate?.updatedAt.getTime()).toBeGreaterThanOrEqual(initialUpdatedAt)

      const updateRes = await app.request(`/${booking.id}/notes/${createdNote.id}`, {
        method: "PATCH",
        ...json({ content: "Edited note" }),
      })
      expect(updateRes.status).toBe(200)

      const afterUpdate = await bookingsService.getBookingById(db, booking.id)
      expect(afterUpdate?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        afterCreate?.updatedAt.getTime() ?? initialUpdatedAt,
      )

      const deleteRes = await app.request(`/${booking.id}/notes/${createdNote.id}`, {
        method: "DELETE",
      })
      expect(deleteRes.status).toBe(200)

      const afterDelete = await bookingsService.getBookingById(db, booking.id)
      expect(afterDelete?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        afterUpdate?.updatedAt.getTime() ?? initialUpdatedAt,
      )

      const activityRes = await app.request(`/${booking.id}/activity`, { method: "GET" })
      expect(activityRes.status).toBe(200)
      const activityBody = await activityRes.json()
      const noteActivity = activityBody.data.filter(
        (entry: Record<string, unknown>) =>
          entry.activityType === "note_added" &&
          (entry.metadata as Record<string, unknown> | null)?.noteId === createdNote.id,
      )

      expect(noteActivity.map((entry: Record<string, unknown>) => entry.description)).toEqual([
        "Note deleted",
        "Note updated",
        "Note added",
      ])
      expect(noteActivity).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actorId: "test-user-id",
            description: "Note updated",
          }),
          expect.objectContaining({
            actorId: "test-user-id",
            description: "Note deleted",
          }),
        ]),
      )
    })

    it("returns 404 when adding note to non-existent booking", async () => {
      const res = await app.request("/book_00000000000000000000000000/notes", {
        method: "POST",
        ...json({ content: "Note" }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe("Documents", () => {
    const validDoc = {
      type: "visa",
      fileName: "visa.pdf",
      fileUrl: "https://example.com/visa.pdf",
    }

    it("creates a document", async () => {
      const booking = await seedBooking()
      const res = await app.request(`/${booking.id}/documents`, {
        method: "POST",
        ...json(validDoc),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.type).toBe("visa")
      expect(body.data.fileName).toBe("visa.pdf")
    })

    it("lists documents", async () => {
      const booking = await seedBooking()
      await app.request(`/${booking.id}/documents`, { method: "POST", ...json(validDoc) })

      const res = await app.request(`/${booking.id}/documents`, { method: "GET" })
      expect(res.status).toBe(200)
      expect((await res.json()).data.length).toBe(1)
    })

    it("deletes a document", async () => {
      const booking = await seedBooking()
      const createRes = await app.request(`/${booking.id}/documents`, {
        method: "POST",
        ...json(validDoc),
      })
      const { data: doc } = await createRes.json()

      const res = await app.request(`/${booking.id}/documents/${doc.id}`, { method: "DELETE" })
      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })

    it("returns 404 when adding to non-existent booking", async () => {
      const res = await app.request("/book_00000000000000000000000000/documents", {
        method: "POST",
        ...json(validDoc),
      })
      expect(res.status).toBe(404)
    })
  })
})
