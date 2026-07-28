// agent-quality: file-size exception -- owner: finance; existing coverage file stays co-located until a dedicated split preserves behavior and tests.
import { executeAdmittedCreatedTargetCommand } from "@voyant-travel/action-ledger"
import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import { bookingsService } from "@voyant-travel/bookings"
import {
  bookingActivityLog,
  bookingAllocations,
  bookingGroups,
  bookingItems,
  bookingItemTravelers,
  bookings,
  bookingTravelers,
} from "@voyant-travel/bookings/schema"
import { eventOutboxTable } from "@voyant-travel/db/schema"
import {
  createToolRegistry,
  defineTool,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { and, asc, eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import {
  availabilityHoldsRef as availabilityHolds,
  availabilitySlotsRef as availabilitySlots,
} from "../../../bookings/src/availability-ref.js"
import { loadBookingStatusConsequencePreview } from "../../../bookings/src/mcp-runtime.js"
import {
  executeFinanceBookingCreateCommand,
  financeBookingCreatedEventId,
} from "../../src/booking-create-command.js"
import { FINANCE_BOOKING_CREATE_HANDLER_POLICY } from "../../src/booking-create-policy.js"
import {
  bookingItemTaxLines,
  bookingPaymentSchedules,
  invoiceRenditions,
  invoices,
  paymentInstruments,
  payments,
  travelCreditRedemptions,
  travelCredits,
} from "../../src/schema.js"
import type { FinanceServiceRuntime } from "../../src/service.js"
import { bookingCreateSchema, createBookingMutation } from "../../src/service-booking-create.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
let directCreateSequence = 0

async function createBooking(
  db: Parameters<typeof createBookingMutation>[0],
  input: Parameters<typeof createBookingMutation>[1],
  options: { userId?: string; runtime?: FinanceServiceRuntime } = {},
) {
  const commandKey = `finance-booking-create-test-${++directCreateSequence}`
  const admitted = await mintFinanceBookingCreateAdmission(commandKey)
  try {
    const result = await executeAdmittedCreatedTargetCommand(
      {
        db,
        context: {
          userId: options.userId ?? "user_finance_booking_create_test",
          callerType: "session",
          actor: "staff",
          organizationId: "tenant_finance_booking_create_test",
        },
        admitted,
        commandTargetType: "finance_booking_create_command",
        canonicalTargetType: "booking",
        resultReferenceType: "booking",
        commandInput: input,
        evaluatedRisk: "high",
      },
      {
        async create(tx, lease) {
          const outcome = await createBookingMutation(tx, input, {
            commandIdempotencyKey: commandKey,
            lease,
            runtime: options.runtime,
            userId: options.userId,
          })
          if (outcome.status !== "ok") throw new TestBookingCreateAbort(outcome)
          return {
            value: outcome,
            targetId: outcome.result.booking.id,
          }
        },
        async replay() {
          throw new Error("test booking-create command unexpectedly replayed")
        },
      },
    )
    return result.value
  } catch (error) {
    if (error instanceof TestBookingCreateAbort) return error.outcome
    throw error
  }
}

class TestBookingCreateAbort extends Error {
  constructor(
    readonly outcome: Exclude<Awaited<ReturnType<typeof createBookingMutation>>, { status: "ok" }>,
  ) {
    super(outcome.status)
  }
}

async function resetTables(
  // biome-ignore lint/suspicious/noExplicitAny: test db -- owner: finance; existing suppression is intentional pending typed cleanup.
  db: any,
) {
  const tableNames = [
    "action_ledger_entries",
    "event_outbox",
    "payments",
    "invoice_renditions",
    "invoice_line_items",
    "invoices",
    "travel_credit_redemptions",
    "travel_credits",
    "payment_instruments",
    "extra_price_rules",
    "option_unit_tiers",
    "option_unit_price_rules",
    "option_price_rules",
    "price_catalogs",
    "option_extra_configs",
    "product_extras",
    "booking_payment_schedules",
    "booking_allocations",
    "booking_item_tax_lines",
    "booking_item_travelers",
    "booking_travelers",
    "booking_group_members",
    "booking_groups",
    "booking_supplier_statuses",
    "booking_items",
    "bookings",
    "availability_holds",
    "availability_slots",
    "option_units",
    "product_day_services",
    "product_days",
    "product_ticket_settings",
    "product_options",
    "products",
  ]
  const existing = (await db.execute<{ tablename: string }>(sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (${sql.join(
        // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        tableNames.map((name) => sql`${name}`),
        sql`, `,
      )})
  `)) as Array<{ tablename: string }>

  if (existing.length === 0) return
  const names = existing.map((r) => `"${r.tablename}"`).join(", ")
  await db.execute(sql.raw(`TRUNCATE ${names} CASCADE`))
}

let productSeq = 0
let bookingSeq = 0
function nextBookingNumber() {
  bookingSeq += 1
  return `BK-BC-${String(bookingSeq).padStart(5, "0")}`
}

describe.skipIf(!DB_AVAILABLE)("createBooking", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await resetTables(db)
  })

  beforeEach(async () => {
    await resetTables(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  async function seedProduct({
    pax = 2,
    ageBandedUnits = false,
  }: {
    pax?: number | null
    ageBandedUnits?: boolean
  } = {}) {
    productSeq += 1
    // Raw SQL keeps this free of a cross-package schema import. The booking-
    // create path only needs products + a default option + one option_unit;
    // we skip itinerary/day seeding because the orchestrator tolerates zero
    // day services (supplier statuses just stay empty).
    const productId = `prod_bc_${productSeq}`
    const optionId = `popt_bc_${productSeq}`
    const unitId = `opun_bc_${productSeq}`
    const childUnitId = `opun_bc_${productSeq}_child`
    const infantUnitId = `opun_bc_${productSeq}_infant`
    const itineraryId = `piti_bc_${productSeq}`
    await db.execute(sql`
      INSERT INTO products (id, name, sell_currency, sell_amount_cents, cost_amount_cents, margin_percent, start_date, end_date, pax)
      VALUES (
        ${productId},
        ${`Booking Create Product ${productSeq}`},
        'EUR',
        50000,
        30000,
        40,
        '2026-07-01',
        '2026-07-03',
        ${pax}
      )
    `)
    await db.execute(sql`
      INSERT INTO product_options (id, product_id, name, status, is_default, sort_order)
      VALUES (${optionId}, ${productId}, 'Standard', 'active', true, 0)
    `)
    await db.execute(sql`
      INSERT INTO option_units (id, option_id, name, code, unit_type, min_age, max_age, is_required, min_quantity, sort_order)
      VALUES (
        ${unitId},
        ${optionId},
        'Adult',
        ${ageBandedUnits ? "ADULT" : null},
        'person',
        ${ageBandedUnits ? 13 : null},
        null,
        true,
        1,
        0
      )
    `)
    if (ageBandedUnits) {
      await db.execute(sql`
        INSERT INTO option_units (id, option_id, name, code, unit_type, min_age, max_age, is_required, min_quantity, sort_order)
        VALUES
          (${childUnitId}, ${optionId}, 'Child 6-12', 'CHILD', 'person', 6, 12, false, 0, 1),
          (${infantUnitId}, ${optionId}, 'Infant 0-5', 'INFANT', 'person', 0, 5, false, 0, 2)
      `)
    }
    await db.execute(sql`
      INSERT INTO product_itineraries (id, product_id, name, is_default, sort_order)
      VALUES (${itineraryId}, ${productId}, 'Default', true, 0)
    `)
    await db.execute(sql`
      INSERT INTO product_ticket_settings (id, product_id, fulfillment_mode, default_delivery_format, ticket_per_unit)
      VALUES (${`ptix_bc_${productSeq}`}, ${productId}, 'per_item', 'qr_code', false)
    `)

    return { productId, optionId, unitId, childUnitId, infantUnitId }
  }

  async function seedAccommodationProduct() {
    productSeq += 1
    const productId = `prod_bc_accom_${productSeq}`
    const optionId = `popt_bc_accom_${productSeq}`
    const roomUnitId = `opun_bc_accom_${productSeq}_dbl`
    const adultUnitId = `opun_bc_accom_${productSeq}_adult`
    const itineraryId = `piti_bc_accom_${productSeq}`
    await db.execute(sql`
      INSERT INTO products (id, name, sell_currency, sell_amount_cents, cost_amount_cents, margin_percent, start_date, end_date, pax)
      VALUES (
        ${productId},
        ${`Accommodation Product ${productSeq}`},
        'EUR',
        50000,
        30000,
        40,
        '2026-07-01',
        '2026-07-03',
        2
      )
    `)
    await db.execute(sql`
      INSERT INTO product_options (id, product_id, name, status, is_default, sort_order)
      VALUES (${optionId}, ${productId}, 'DBL', 'active', true, 0)
    `)
    await db.execute(sql`
      INSERT INTO option_units (
        id,
        option_id,
        name,
        code,
        unit_type,
        min_age,
        occupancy_min,
        occupancy_max,
        is_required,
        min_quantity,
        sort_order
      )
      VALUES
        (${roomUnitId}, ${optionId}, 'DBL room', 'dbl_room', 'room', null, 1, 2, true, 1, 0),
        (${adultUnitId}, ${optionId}, 'Adult', 'adult', 'person', 18, null, null, true, 1, 1)
    `)
    await db.execute(sql`
      INSERT INTO product_itineraries (id, product_id, name, is_default, sort_order)
      VALUES (${itineraryId}, ${productId}, 'Default', true, 0)
    `)
    await db.execute(sql`
      INSERT INTO product_ticket_settings (id, product_id, fulfillment_mode, default_delivery_format, ticket_per_unit)
      VALUES (${`ptix_bc_accom_${productSeq}`}, ${productId}, 'per_item', 'qr_code', false)
    `)

    return { productId, optionId, roomUnitId, adultUnitId }
  }

  async function seedSingleFirstAccommodationProduct({
    singleRoomOccupancyMax = 1,
  }: {
    singleRoomOccupancyMax?: number | null
  } = {}) {
    productSeq += 1
    const productId = `prod_bc_accom_sgl_${productSeq}`
    const optionId = `popt_bc_accom_sgl_${productSeq}`
    const singleRoomUnitId = `opun_bc_accom_sgl_${productSeq}`
    const doubleRoomUnitId = `opun_bc_accom_dbl_${productSeq}`
    const adultUnitId = `opun_bc_accom_adult_${productSeq}`
    const itineraryId = `piti_bc_accom_sgl_${productSeq}`
    await db.execute(sql`
      INSERT INTO products (id, name, sell_currency, sell_amount_cents, cost_amount_cents, margin_percent, start_date, end_date, pax)
      VALUES (
        ${productId},
        ${`SGL-first Accommodation Product ${productSeq}`},
        'EUR',
        50000,
        30000,
        40,
        '2026-07-01',
        '2026-07-03',
        2
      )
    `)
    await db.execute(sql`
      INSERT INTO product_options (id, product_id, name, status, is_default, sort_order)
      VALUES (${optionId}, ${productId}, 'Standard', 'active', true, 0)
    `)
    await db.execute(sql`
      INSERT INTO option_units (
        id,
        option_id,
        name,
        code,
        unit_type,
        min_age,
        occupancy_min,
        occupancy_max,
        is_required,
        min_quantity,
        sort_order
      )
      VALUES
        (${singleRoomUnitId}, ${optionId}, 'SGL room', 'sgl_room', 'room', null, 1, ${singleRoomOccupancyMax}, true, 1, 0),
        (${doubleRoomUnitId}, ${optionId}, 'DBL room', 'dbl_room', 'room', null, 1, 2, false, 0, 1),
        (${adultUnitId}, ${optionId}, 'Adult', 'adult', 'person', 18, null, null, true, 1, 2)
    `)
    await db.execute(sql`
      INSERT INTO product_itineraries (id, product_id, name, is_default, sort_order)
      VALUES (${itineraryId}, ${productId}, 'Default', true, 0)
    `)
    await db.execute(sql`
      INSERT INTO product_ticket_settings (id, product_id, fulfillment_mode, default_delivery_format, ticket_per_unit)
      VALUES (${`ptix_bc_accom_sgl_${productSeq}`}, ${productId}, 'per_item', 'qr_code', false)
    `)

    return { productId, optionId, singleRoomUnitId, doubleRoomUnitId, adultUnitId }
  }

  async function seedTravelCredit(
    overrides: {
      code?: string
      remainingAmountCents?: number
      status?: "active" | "redeemed" | "void"
      expiresAt?: Date | null
    } = {},
  ) {
    const [row] = await db
      .insert(travelCredits)
      .values({
        code: overrides.code ?? `BC-${productSeq}-${Date.now()}`,
        currency: "EUR",
        initialAmountCents: overrides.remainingAmountCents ?? 20000,
        remainingAmountCents: overrides.remainingAmountCents ?? 20000,
        status: overrides.status ?? "active",
        sourceType: "manual",
        expiresAt: overrides.expiresAt ?? null,
      })
      .returning()
    return row!
  }

  async function seedBookingGroup() {
    const [group] = await db
      .insert(bookingGroups)
      .values({
        kind: "shared_room",
        label: "Existing group",
      })
      .returning()
    return group!
  }

  async function seedSlot(input: {
    productId: string
    optionId?: string | null
    capacity?: number
  }) {
    const slotId = `avsl_bc_${productSeq}_${Date.now()}`
    const rows = await db.execute<{ id: string }>(sql`
      INSERT INTO availability_slots (
        id,
        product_id,
        option_id,
        date_local,
        starts_at,
        ends_at,
        timezone,
        status,
        unlimited,
        initial_pax,
        remaining_pax,
        created_at,
        updated_at
      )
      VALUES (
        ${slotId},
        ${input.productId},
        ${input.optionId ?? null},
        '2026-07-01',
        '2026-07-01T09:00:00.000Z',
        '2026-07-01T11:00:00.000Z',
        'Europe/Bucharest',
        'open',
        false,
        ${input.capacity ?? 10},
        ${input.capacity ?? 10},
        now(),
        now()
      )
      RETURNING id
    `)

    const slot = rows[0]
    if (!slot) throw new Error("seedSlot: insert returned no rows")
    return slot
  }

  async function seedPersistedPricing(input: {
    productId: string
    optionId: string
    unitId: string
    unitAmountCents: number
    unitPricingMode?: "per_unit" | "per_person" | "per_booking"
    extra?: {
      productExtraId: string
      optionExtraConfigId: string
      amountCents: number
      pricingMode: "per_person" | "per_booking"
    }
  }) {
    const catalogId = `pcat_bc_${productSeq}`
    const optionPriceRuleId = `oprl_bc_${productSeq}`
    await db.execute(sql`
      INSERT INTO price_catalogs (id, code, name, currency_code, catalog_type, is_default, active)
      VALUES (${catalogId}, ${`PUBLIC-${productSeq}`}, 'Public', 'EUR', 'public', true, true)
    `)
    await db.execute(sql`
      INSERT INTO option_price_rules (
        id, product_id, option_id, price_catalog_id, name, pricing_mode, is_default, active
      ) VALUES (
        ${optionPriceRuleId}, ${input.productId}, ${input.optionId}, ${catalogId},
        'Persisted booking rate', 'per_booking', true, true
      )
    `)
    await db.execute(sql`
      INSERT INTO option_unit_price_rules (
        id, option_price_rule_id, option_id, unit_id, pricing_mode, sell_amount_cents, active
      ) VALUES (
        ${`oupr_bc_${productSeq}`}, ${optionPriceRuleId}, ${input.optionId}, ${input.unitId},
        ${input.unitPricingMode ?? "per_unit"}, ${input.unitAmountCents}, true
      )
    `)
    if (input.extra) {
      await db.execute(sql`
        INSERT INTO product_extras (
          id, product_id, name, pricing_mode, priced_per_person, collection_mode, active
        ) VALUES (
          ${input.extra.productExtraId}, ${input.productId}, 'Airport transfer',
          ${input.extra.pricingMode}, ${input.extra.pricingMode === "per_person"}, 'booking_total', true
        )
      `)
      await db.execute(sql`
        INSERT INTO option_extra_configs (
          id, option_id, product_extra_id, pricing_mode, priced_per_person, active
        ) VALUES (
          ${input.extra.optionExtraConfigId}, ${input.optionId}, ${input.extra.productExtraId},
          ${input.extra.pricingMode}, ${input.extra.pricingMode === "per_person"}, true
        )
      `)
      await db.execute(sql`
        INSERT INTO extra_price_rules (
          id, option_price_rule_id, option_id, product_extra_id, option_extra_config_id,
          pricing_mode, sell_amount_cents, active
        ) VALUES (
          ${`expr_bc_${productSeq}`}, ${optionPriceRuleId}, ${input.optionId},
          ${input.extra.productExtraId}, ${input.extra.optionExtraConfigId},
          ${input.extra.pricingMode}, ${input.extra.amountCents}, true
        )
      `)
    }
    return { catalogId, optionPriceRuleId }
  }

  function bookingParty() {
    return {
      personId: "pers_booking_create",
      contactFirstName: "Alice",
      contactLastName: "Lead",
      contactEmail: "alice@example.com",
      travelers: [
        {
          clientTravelerKey: "trav:lead",
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler" as const,
          isPrimary: true,
        },
      ],
    }
  }

  it("derives booking pax from travelers when pax is omitted", async () => {
    const { productId } = await seedProduct({ pax: null })

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      catalogSellAmountCents: 50000,
      confirmedSellAmountCents: 50000,
      travelers: [
        {
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler",
          isPrimary: true,
        },
        {
          firstName: "Bob",
          lastName: "Companion",
          participantType: "traveler",
        },
      ],
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    expect(outcome.result.booking.pax).toBe(2)

    const [bookingRow] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, outcome.result.booking.id))
    expect(bookingRow?.pax).toBe(2)
  })

  it.each([
    null,
    1,
  ] as const)("does not let explicit pax %s undercount two travelers or occupants", async (explicitPax) => {
    const { productId, optionId, unitId } = await seedProduct({ pax: null })
    const slot = await seedSlot({ productId, optionId, capacity: 10 })
    const outcome = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      bookingNumber: nextBookingNumber(),
      pax: explicitPax,
      ...bookingParty(),
      travelers: [
        ...bookingParty().travelers,
        {
          clientTravelerKey: "trav:occupant",
          firstName: "Bob",
          lastName: "Occupant",
          participantType: "occupant",
        },
      ],
      itemLines: [{ optionUnitId: unitId, quantity: 2 }],
    })
    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    expect(outcome.result.booking.pax).toBe(2)
    expect(await bookingsService.listAllocations(db, outcome.result.booking.id)).toEqual([
      expect.objectContaining({ quantity: 2 }),
    ])
    const [slotAfter] = await db
      .select({ remainingPax: availabilitySlots.remainingPax })
      .from(availabilitySlots)
      .where(eq(availabilitySlots.id, slot.id))
    expect(slotAfter?.remainingPax).toBe(8)
  })

  it("atomically converts a live availability hold into one on-hold pax allocation", async () => {
    const { productId, optionId } = await seedProduct({ pax: 2 })
    const slot = await seedSlot({ productId, optionId })
    const holdToken = `draft_hold_${productSeq}`
    const staleSlotId = `${slot.id}_stale`
    await db.execute(sql`
      INSERT INTO availability_slots (
        id, product_id, option_id, date_local, starts_at, ends_at, timezone,
        status, unlimited, initial_pax, remaining_pax, created_at, updated_at
      ) VALUES (
        ${staleSlotId}, ${productId}, ${optionId}, '2026-07-02',
        '2026-07-02T09:00:00.000Z', '2026-07-02T11:00:00.000Z',
        'Europe/Bucharest', 'open', false, 10, 9, now(), now()
      )
    `)
    const [staleHold] = await db
      .insert(availabilityHolds)
      .values({
        draftId: holdToken,
        holdToken,
        productId,
        slotId: staleSlotId,
        paxCount: 1,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })
      .returning()
    const [hold] = await db
      .insert(availabilityHolds)
      .values({
        draftId: holdToken,
        holdToken,
        productId,
        slotId: slot.id,
        paxCount: 2,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })
      .returning()
    await db
      .update(availabilitySlots)
      .set({ remainingPax: 8 })
      .where(eq(availabilitySlots.id, slot.id))

    const outcome = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      availabilityHoldToken: holdToken,
      bookingNumber: nextBookingNumber(),
      initialStatus: "on_hold",
      pax: 2,
      ...bookingParty(),
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    expect(outcome.result.booking.status).toBe("on_hold")

    const [slotAfter] = await db
      .select({ remainingPax: availabilitySlots.remainingPax })
      .from(availabilitySlots)
      .where(eq(availabilitySlots.id, slot.id))
    expect(slotAfter?.remainingPax).toBe(8)
    const [staleSlotAfter] = await db
      .select({ remainingPax: availabilitySlots.remainingPax })
      .from(availabilitySlots)
      .where(eq(availabilitySlots.id, staleSlotId))
    expect(staleSlotAfter?.remainingPax).toBe(10)

    const allocations = await db
      .select()
      .from(bookingAllocations)
      .where(eq(bookingAllocations.bookingId, outcome.result.booking.id))
    expect(allocations).toHaveLength(1)
    expect(allocations[0]).toMatchObject({
      availabilitySlotId: slot.id,
      quantity: 2,
      status: "held",
      metadata: {
        availabilityHoldId: hold.id,
        availabilityHoldToken: holdToken,
      },
    })

    const [converted] = await db
      .select()
      .from(availabilityHolds)
      .where(eq(availabilityHolds.id, hold.id))
    expect(converted).toMatchObject({
      releasedAt: null,
      convertedBookingId: outcome.result.booking.id,
      convertedAllocationId: allocations[0]?.id,
    })
    expect(converted?.convertedAt).toBeInstanceOf(Date)
    const [releasedStaleHold] = await db
      .select()
      .from(availabilityHolds)
      .where(eq(availabilityHolds.id, staleHold.id))
    expect(releasedStaleHold?.releasedAt).toBeInstanceOf(Date)

    const activities = await db
      .select()
      .from(bookingActivityLog)
      .where(eq(bookingActivityLog.bookingId, outcome.result.booking.id))
    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityType: "booking_converted",
          metadata: expect.objectContaining({ availabilityHoldId: hold.id }),
        }),
      ]),
    )
  })

  it("releases an expired hold before allocating the booking capacity", async () => {
    const { productId, optionId } = await seedProduct({ pax: 2 })
    const slot = await seedSlot({ productId, optionId })
    const holdToken = `draft_expired_${productSeq}`
    const [hold] = await db
      .insert(availabilityHolds)
      .values({
        draftId: holdToken,
        holdToken,
        productId,
        slotId: slot.id,
        paxCount: 2,
        expiresAt: new Date(Date.now() - 60_000),
      })
      .returning()
    await db
      .update(availabilitySlots)
      .set({ remainingPax: 8 })
      .where(eq(availabilitySlots.id, slot.id))

    const outcome = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      availabilityHoldToken: holdToken,
      bookingNumber: nextBookingNumber(),
      initialStatus: "on_hold",
      pax: 2,
      ...bookingParty(),
    })

    expect(outcome.status).toBe("ok")
    const [slotAfter] = await db
      .select({ remainingPax: availabilitySlots.remainingPax })
      .from(availabilitySlots)
      .where(eq(availabilitySlots.id, slot.id))
    expect(slotAfter?.remainingPax).toBe(8)
    const [expired] = await db
      .select()
      .from(availabilityHolds)
      .where(eq(availabilityHolds.id, hold.id))
    expect(expired?.releasedAt).toBeInstanceOf(Date)
    expect(expired?.convertedAt).toBeNull()
  })

  it("keeps explicit booking pax when travelers are also supplied", async () => {
    const { productId } = await seedProduct({ pax: null })

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      pax: 4,
      travelers: [
        {
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler",
          isPrimary: true,
        },
        {
          firstName: "Bob",
          lastName: "Companion",
          participantType: "traveler",
        },
      ],
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    expect(outcome.result.booking.pax).toBe(4)

    const [bookingRow] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, outcome.result.booking.id))
    expect(bookingRow?.pax).toBe(4)
  })

  it("creates booking + travelers + payment schedules atomically", async () => {
    const { productId } = await seedProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelers: [
        {
          clientTravelerKey: "trav:lead",
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler",
          isPrimary: true,
        },
        {
          firstName: "Bob",
          lastName: "Companion",
          participantType: "traveler",
          travelerCategory: "adult",
        },
      ],
      paymentSchedules: [
        {
          scheduleType: "deposit",
          status: "due",
          dueDate: "2026-06-15",
          currency: "EUR",
          amountCents: 20000,
        },
        {
          scheduleType: "balance",
          status: "pending",
          dueDate: "2026-06-30",
          currency: "EUR",
          amountCents: 30000,
        },
      ],
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    expect(outcome.result.booking.status).toBe("draft")
    expect(outcome.result.travelers).toHaveLength(2)
    expect(outcome.result.travelers[0]?.firstName).toBe("Alice")
    expect(outcome.result.paymentSchedules).toHaveLength(2)
    expect(outcome.result.travelCreditRedemption).toBeNull()
    expect(outcome.result.groupMembership).toBeNull()

    const bookingsRows = await db.select().from(bookings)
    expect(bookingsRows).toHaveLength(1)
    const travelerRows = await db
      .select()
      .from(bookingTravelers)
      .where(eq(bookingTravelers.bookingId, outcome.result.booking.id))
    expect(travelerRows).toHaveLength(2)
    const scheduleRows = await db
      .select()
      .from(bookingPaymentSchedules)
      .where(eq(bookingPaymentSchedules.bookingId, outcome.result.booking.id))
    expect(scheduleRows).toHaveLength(2)
  })

  it("rejects duplicate active bookings for the same billing party and slot", async () => {
    const { productId, optionId } = await seedProduct()
    const slot = await seedSlot({ productId, optionId })

    const first = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
    })

    expect(first.status).toBe("ok")
    if (first.status !== "ok") return

    const duplicate = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
    })

    expect(duplicate.status).toBe("duplicate_booking")
    if (duplicate.status !== "duplicate_booking") return
    expect(duplicate.existingBooking).toMatchObject({
      id: first.result.booking.id,
      bookingNumber: first.result.booking.bookingNumber,
      status: first.result.booking.status,
    })

    const bookingRows = await db.select().from(bookings)
    expect(bookingRows).toHaveLength(1)
  })

  it("allows duplicate active bookings when explicitly overridden", async () => {
    const { productId, optionId } = await seedProduct()
    const slot = await seedSlot({ productId, optionId })

    const first = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
    })
    expect(first.status).toBe("ok")

    const second = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      allowDuplicate: true,
    })

    expect(second.status).toBe("ok")
    const bookingRows = await db.select().from(bookings)
    expect(bookingRows).toHaveLength(2)
  })

  it("ignores cancelled bookings when checking duplicates", async () => {
    const { productId, optionId } = await seedProduct()
    const slot = await seedSlot({ productId, optionId })

    const first = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
    })
    expect(first.status).toBe("ok")
    if (first.status !== "ok") return

    await db
      .update(bookings)
      .set({ status: "cancelled" })
      .where(eq(bookings.id, first.result.booking.id))

    const second = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
    })

    expect(second.status).toBe("ok")
    const bookingRows = await db.select().from(bookings)
    expect(bookingRows).toHaveLength(2)
  })

  it("ignores expired bookings when checking duplicates", async () => {
    const { productId, optionId } = await seedProduct()
    const slot = await seedSlot({ productId, optionId })

    const first = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
    })
    expect(first.status).toBe("ok")
    if (first.status !== "ok") return

    await db
      .update(bookings)
      .set({ status: "expired" })
      .where(eq(bookings.id, first.result.booking.id))

    const second = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
    })

    expect(second.status).toBe("ok")
    const bookingRows = await db.select().from(bookings)
    expect(bookingRows).toHaveLength(2)
  })

  it("rejects payment schedules in a currency different from booking sell currency", async () => {
    const { productId } = await seedProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      catalogSellAmountCents: 33000,
      confirmedSellAmountCents: 33000,
      paymentSchedules: [
        {
          scheduleType: "deposit",
          status: "pending",
          dueDate: "2026-02-21",
          currency: "RON",
          amountCents: 16500,
        },
        {
          scheduleType: "balance",
          status: "pending",
          dueDate: "2026-05-20",
          currency: "EUR",
          amountCents: 16500,
        },
      ],
    })

    expect(outcome.status).toBe("invalid_payment_schedules")
    if (outcome.status !== "invalid_payment_schedules") return
    expect(outcome.issues).toContainEqual({
      path: ["paymentSchedules", 0, "currency"],
      message: "paymentSchedules[0].currency must equal the booking's sellCurrency (EUR); got RON",
    })

    const bookingsRows = await db.select().from(bookings)
    expect(bookingsRows).toHaveLength(0)
  })

  it("rejects payment schedule totals that do not match confirmed booking total", async () => {
    const { productId } = await seedProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      catalogSellAmountCents: 33000,
      confirmedSellAmountCents: 33000,
      paymentSchedules: [
        {
          scheduleType: "deposit",
          status: "pending",
          dueDate: "2026-02-21",
          currency: "EUR",
          amountCents: 16500,
        },
      ],
    })

    expect(outcome.status).toBe("invalid_payment_schedules")
    if (outcome.status !== "invalid_payment_schedules") return
    expect(outcome.issues).toContainEqual({
      path: ["paymentSchedules"],
      message:
        "paymentSchedules amountCents sum (16500) must equal the persisted booking total (33000)",
    })

    const bookingsRows = await db.select().from(bookings)
    expect(bookingsRows).toHaveLength(0)
  })

  it("rejects tax lines in a currency different from booking sell currency", async () => {
    const { productId } = await seedProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      taxLines: [
        {
          name: "Foreign VAT",
          currency: "USD",
          amountCents: 9500,
          includedInPrice: true,
        },
      ],
    })

    expect(outcome.status).toBe("invalid_tax_lines")
    if (outcome.status !== "invalid_tax_lines") return
    expect(outcome.issues).toContainEqual({
      path: ["taxLines", 0, "currency"],
      message: "taxLines[0].currency must equal the booking's sellCurrency (EUR); got USD",
    })

    const bookingsRows = await db.select().from(bookings)
    expect(bookingsRows).toHaveLength(0)
  })

  it("rejects already-paid schedules without an explicit payment date", async () => {
    const { productId } = await seedProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      paymentSchedules: [
        {
          scheduleType: "balance",
          status: "paid",
          dueDate: "2026-06-15",
          currency: "EUR",
          amountCents: 50000,
          notes: JSON.stringify({
            alreadyPaid: true,
            paymentDate: null,
            paymentMethod: "bank_transfer",
            paymentReference: "BT-PAID-1",
          }),
        },
      ],
    })

    expect(outcome.status).toBe("invalid_payment_schedules")
    if (outcome.status !== "invalid_payment_schedules") return
    expect(outcome.issues).toContainEqual({
      path: ["paymentSchedules", 0, "notes", "paymentDate"],
      message: "paymentSchedules[0] marked paid requires notes.paymentDate",
    })

    const bookingsRows = await db.select().from(bookings)
    expect(bookingsRows).toHaveLength(0)
  })

  it("rejects already-paid schedules with non-string payment dates", async () => {
    const { productId } = await seedProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      paymentSchedules: [
        {
          scheduleType: "balance",
          status: "paid",
          dueDate: "2026-06-15",
          currency: "EUR",
          amountCents: 50000,
          notes: JSON.stringify({
            alreadyPaid: true,
            paymentDate: 123,
            paymentMethod: "bank_transfer",
            paymentReference: "BT-PAID-1",
          }),
        },
      ],
    })

    expect(outcome.status).toBe("invalid_payment_schedules")
    if (outcome.status !== "invalid_payment_schedules") return
    expect(outcome.issues).toContainEqual({
      path: ["paymentSchedules", 0, "notes", "paymentDate"],
      message: "paymentSchedules[0] marked paid requires notes.paymentDate",
    })

    const bookingsRows = await db.select().from(bookings)
    expect(bookingsRows).toHaveLength(0)
  })

  it("creates an invoice and completed payment records for already-paid schedules", async () => {
    const { productId } = await seedProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      paymentSchedules: [
        {
          scheduleType: "balance",
          status: "paid",
          dueDate: "2026-06-15",
          currency: "EUR",
          amountCents: 50000,
          notes: JSON.stringify({
            alreadyPaid: true,
            paymentDate: "2026-06-10",
            paymentMethod: "bank_transfer",
            paymentReference: "BT-PAID-1",
          }),
        },
      ],
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    expect(outcome.result.invoice?.bookingId).toBe(outcome.result.booking.id)
    expect(outcome.result.invoiceDocument.status).toBe("not_requested")
    expect(outcome.result.payments).toHaveLength(1)
    expect(outcome.result.payments[0]?.status).toBe("completed")
    expect(outcome.result.payments[0]?.referenceNumber).toBe("BT-PAID-1")

    const invoiceRows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.bookingId, outcome.result.booking.id))
    expect(invoiceRows).toHaveLength(1)
    expect(invoiceRows[0]?.status).toBe("paid")

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceRows[0]!.id))
    expect(paymentRows).toHaveLength(1)
  })

  it("previews exact paid invoice settlement consequences before cancellation", async () => {
    const { productId } = await seedProduct()
    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      initialStatus: "confirmed",
      ...bookingParty(),
      paymentSchedules: [
        {
          scheduleType: "balance",
          status: "paid",
          dueDate: "2026-06-15",
          currency: "EUR",
          amountCents: 50_000,
          notes: JSON.stringify({
            alreadyPaid: true,
            paymentDate: "2026-06-10",
            paymentMethod: "bank_transfer",
            paymentReference: "BT-CANCEL-1",
          }),
        },
      ],
    })
    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return

    const preview = await loadBookingStatusConsequencePreview(
      db,
      outcome.result.booking.id,
      "cancel",
      false,
      true,
    )
    expect(preview.financialSettlement).toMatchObject({
      actionRequired: true,
      consequence:
        "Paid invoices remain paid; an operator must record a refund, credit note, or explicit no-refund decision.",
      settlementRecorderAvailable: true,
      requiredDecisionOptions: ["refund", "credit_note", "no_refund"],
      paidByCurrency: { EUR: 50_000 },
      schedulesToClose: [],
      paidInvoices: [
        expect.objectContaining({
          invoiceNumber: outcome.result.invoice?.invoiceNumber,
          currency: "EUR",
          paidCents: 50_000,
          status: "paid",
        }),
      ],
    })
  })

  it("requests an invoice rendition only when invoice document generation is enabled", async () => {
    const { productId } = await seedProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      documentGeneration: {
        contractDocument: false,
        invoiceDocument: true,
      },
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    expect(outcome.result.invoice?.bookingId).toBe(outcome.result.booking.id)
    expect(outcome.result.invoiceDocument.status).toBe("requested")

    const renditionRows = await db
      .select()
      .from(invoiceRenditions)
      .where(eq(invoiceRenditions.invoiceId, outcome.result.invoice!.id))
    expect(renditionRows).toHaveLength(1)
    expect(renditionRows[0]?.status).toBe("pending")
  })

  it("uses the configured Finance runtime when creating a booking invoice", async () => {
    const { productId } = await seedProduct()
    let dueDateResolverCalls = 0

    const outcome = await createBooking(
      db,
      {
        productId,
        bookingNumber: nextBookingNumber(),
        ...bookingParty(),
        documentGeneration: {
          contractDocument: false,
          invoiceDocument: true,
        },
      },
      {
        runtime: {
          async invoiceDueDateResolver() {
            dueDateResolverCalls += 1
            return "2026-12-31"
          },
        },
      },
    )

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    expect(dueDateResolverCalls).toBe(1)
    expect(outcome.result.invoice?.dueDate).toBe("2026-12-31")
  })

  it("creates explicit booking item lines for multiple selected units", async () => {
    const { productId, optionId, unitId } = await seedProduct()
    const secondUnitId = `opun_bc_single_${productSeq}`
    await db.execute(sql`
      INSERT INTO option_units (id, option_id, name, unit_type, is_required, min_quantity, sort_order)
      VALUES (${secondUnitId}, ${optionId}, 'Additional person', 'person', false, 1, 1)
    `)

    const outcome = await createBooking(db, {
      productId,
      optionId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      catalogSellAmountCents: 30000,
      confirmedSellAmountCents: 30000,
      itemLines: [
        {
          optionUnitId: unitId,
          quantity: 2,
          title: "Double room",
          unitSellAmountCents: 10000,
          totalSellAmountCents: 20000,
        },
        {
          optionUnitId: secondUnitId,
          quantity: 1,
          title: "Additional person",
          unitSellAmountCents: 10000,
          totalSellAmountCents: 10000,
        },
      ],
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return

    const itemRows = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, outcome.result.booking.id))
    expect(itemRows).toHaveLength(2)
    expect(
      itemRows
        .map((item) => [item.optionUnitId, item.quantity] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ).toEqual(
      [
        [unitId, 2],
        [secondUnitId, 1],
      ].sort(([left], [right]) => left.localeCompare(right)),
    )
  })

  it("links explicit item and per-person extra lines to travelers", async () => {
    const { productId, optionId, unitId } = await seedProduct()
    await seedPersistedPricing({
      productId,
      optionId,
      unitId,
      unitAmountCents: 25_000,
      extra: {
        productExtraId: "lunch",
        optionExtraConfigId: `oexc_lunch_${productSeq}`,
        amountCents: 1_000,
        pricingMode: "per_person",
      },
    })

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelers: [
        {
          clientTravelerKey: "trav:lead",
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler",
          isPrimary: true,
        },
        {
          clientTravelerKey: "trav:child",
          firstName: "Child",
          lastName: "Traveler",
          participantType: "traveler",
          travelerCategory: "child",
        },
      ],
      itemLines: [
        {
          clientLineKey: `unit:${unitId}`,
          optionUnitId: unitId,
          quantity: 2,
          title: "Adult",
          travelerKeys: ["trav:lead", "trav:child"],
        },
      ],
      extraLines: [
        {
          clientLineKey: "extra:lunch",
          productExtraId: "lunch",
          name: "Lunch",
          pricingMode: "per_person",
          pricedPerPerson: true,
          quantity: 2,
          sellCurrency: "EUR",
          unitSellAmountCents: 1000,
          totalSellAmountCents: 2000,
          travelerKeys: ["trav:lead", "trav:child"],
        },
      ],
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return

    // Two travelers × (1 item + 1 extra) = 4 link rows when the
    // server stamps `metadata.bookingCreateLineKey` on each item and
    // resolves it through `linkBookingCreateItemsToTravelers`.
    const links = await db
      .select()
      .from(bookingItemTravelers)
      // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      .where(sql`${bookingItemTravelers.bookingItemId} IN (
        SELECT ${bookingItems.id}
        FROM ${bookingItems}
        WHERE ${bookingItems.bookingId} = ${outcome.result.booking.id}
      )`)
    expect(links).toHaveLength(4)
  })

  it("links item and extra lines to reordered travelers through stable keys", async () => {
    const { productId, optionId, unitId, childUnitId } = await seedProduct({
      ageBandedUnits: true,
    })
    await seedPersistedPricing({
      productId,
      optionId,
      unitId,
      unitAmountCents: 25_000,
      extra: {
        productExtraId: "lunch",
        optionExtraConfigId: `oexc_lunch_${productSeq}`,
        amountCents: 1_000,
        pricingMode: "per_person",
      },
    })

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelers: [
        {
          clientTravelerKey: "trav:child",
          firstName: "Child",
          lastName: "Traveler",
          participantType: "traveler",
          travelerCategory: "child",
        },
        {
          clientTravelerKey: "trav:lead",
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler",
          travelerCategory: "adult",
          isPrimary: true,
        },
      ],
      itemLines: [
        {
          clientLineKey: `unit:${unitId}`,
          optionUnitId: unitId,
          quantity: 1,
          title: "Adult",
          travelerKeys: ["trav:lead"],
        },
        {
          clientLineKey: `unit:${childUnitId}`,
          optionUnitId: childUnitId,
          quantity: 1,
          title: "Child",
          travelerKeys: ["trav:child"],
        },
      ],
      extraLines: [
        {
          clientLineKey: "extra:lunch",
          productExtraId: "lunch",
          name: "Lunch",
          pricingMode: "per_person",
          pricedPerPerson: true,
          quantity: 1,
          sellCurrency: "EUR",
          unitSellAmountCents: 1000,
          totalSellAmountCents: 1000,
          travelerKeys: ["trav:child"],
        },
      ],
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return

    const linkedRows = await db.execute<{ item_title: string; traveler_last_name: string }>(sql`
      SELECT bi.title AS item_title, bt.last_name AS traveler_last_name
      FROM booking_item_travelers bit
      JOIN booking_items bi ON bi.id = bit.booking_item_id
      JOIN booking_travelers bt ON bt.id = bit.traveler_id
      WHERE bi.booking_id = ${outcome.result.booking.id}
      ORDER BY bi.title, bt.last_name
    `)
    expect(linkedRows).toEqual([
      { item_title: "Adult", traveler_last_name: "Lead" },
      { item_title: "Child", traveler_last_name: "Traveler" },
      { item_title: "Lunch", traveler_last_name: "Traveler" },
    ])
  })

  it("creates a multi-day accommodation booking as one room item linked to both travelers", async () => {
    const { productId, roomUnitId } = await seedAccommodationProduct()
    const bundledTotalAmountCents = 60_000

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      catalogSellAmountCents: bundledTotalAmountCents,
      confirmedSellAmountCents: bundledTotalAmountCents,
      travelers: [
        {
          clientTravelerKey: "trav:lead",
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler",
          travelerCategory: "adult",
          isPrimary: true,
        },
        {
          clientTravelerKey: "trav:companion",
          firstName: "Bob",
          lastName: "Companion",
          participantType: "traveler",
          travelerCategory: "adult",
        },
      ],
      itemLines: [
        {
          clientLineKey: `unit:${roomUnitId}`,
          optionUnitId: roomUnitId,
          quantity: 1,
          title: "DBL room",
          unitSellAmountCents: bundledTotalAmountCents,
          totalSellAmountCents: bundledTotalAmountCents,
          travelerKeys: ["trav:lead", "trav:companion"],
        },
      ],
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    expect(outcome.result.booking.sellAmountCents).toBe(bundledTotalAmountCents)

    const itemRows = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, outcome.result.booking.id))
    expect(itemRows).toHaveLength(1)
    expect(itemRows[0]).toMatchObject({
      optionUnitId: roomUnitId,
      quantity: 1,
      totalSellAmountCents: bundledTotalAmountCents,
    })

    const links = await db
      .select()
      .from(bookingItemTravelers)
      .where(eq(bookingItemTravelers.bookingItemId, itemRows[0]!.id))
    expect(links).toHaveLength(2)
  })

  it("holds and restores passenger capacity for one two-traveler room item (12 -> 10 -> 12)", async () => {
    const { productId, optionId, roomUnitId } = await seedAccommodationProduct()
    const slot = await seedSlot({ productId, optionId, capacity: 12 })
    const outcome = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      bookingNumber: nextBookingNumber(),
      initialStatus: "on_hold",
      pax: 2,
      ...bookingParty(),
      travelers: [
        {
          clientTravelerKey: "trav:lead",
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler",
          isPrimary: true,
        },
        {
          clientTravelerKey: "trav:companion",
          firstName: "Bob",
          lastName: "Companion",
          participantType: "traveler",
        },
      ],
      itemLines: [
        {
          optionUnitId: roomUnitId,
          quantity: 1,
          title: "DBL room",
          travelerKeys: ["trav:lead", "trav:companion"],
        },
      ],
    })
    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return

    const remaining = async () => {
      const [row] = await db
        .select({ remainingPax: availabilitySlots.remainingPax })
        .from(availabilitySlots)
        .where(eq(availabilitySlots.id, slot.id))
      return row?.remainingPax
    }
    expect(await remaining()).toBe(10)

    const confirmed = await bookingsService.confirmBooking(
      db,
      outcome.result.booking.id,
      { note: "QA confirmation", suppressNotifications: true },
      "user_qa",
    )
    expect(confirmed.status).toBe("ok")
    expect(await remaining()).toBe(10)

    const cancelled = await bookingsService.cancelBooking(
      db,
      outcome.result.booking.id,
      { note: "QA lifecycle", suppressNotifications: true },
      "user_qa",
    )
    expect(cancelled.status).toBe("ok")
    expect(await remaining()).toBe(12)

    const replay = await bookingsService.cancelBooking(
      db,
      outcome.result.booking.id,
      { note: "QA lifecycle", suppressNotifications: true },
      "user_qa",
    )
    expect(replay.status).toBe("invalid_transition")
    expect(await remaining()).toBe(12)
    expect(
      await db
        .select({ name: eventOutboxTable.name, payload: eventOutboxTable.payload })
        .from(eventOutboxTable)
        .orderBy(asc(eventOutboxTable.createdAt)),
    ).toEqual([
      {
        name: "booking.confirmed",
        payload: expect.objectContaining({ suppressNotifications: true }),
      },
      {
        name: "booking.cancelled",
        payload: expect.objectContaining({ suppressNotifications: true }),
      },
    ])
  })

  it("uses persisted catalog pricing unless the current request explicitly overrides it", async () => {
    const firstProduct = await seedProduct()
    const persisted = await createBooking(db, {
      productId: firstProduct.productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
    })
    expect(persisted.status).toBe("ok")
    if (persisted.status !== "ok") return
    expect(persisted.result.booking.sellAmountCents).toBe(50_000)
    expect(persisted.result.booking.priceOverride).toBeNull()

    const secondProduct = await seedProduct()
    const overridden = await createBooking(
      db,
      {
        productId: secondProduct.productId,
        bookingNumber: nextBookingNumber(),
        ...bookingParty(),
        manualPriceOverride: {
          amountCents: 42_000,
          reason: "Current-request loyalty adjustment",
        },
        itemLines: [
          {
            optionUnitId: secondProduct.unitId,
            quantity: 2,
            unitSellAmountCents: 1,
            totalSellAmountCents: 2,
          },
        ],
        taxLines: [
          {
            name: "VAT",
            currency: "EUR",
            amountCents: 2_000,
            includedInPrice: true,
          },
        ],
        paymentSchedules: [
          {
            scheduleType: "balance",
            status: "pending",
            currency: "EUR",
            amountCents: 42_000,
            dueDate: "2026-08-15",
          },
        ],
        documentGeneration: { invoiceDocument: true },
      },
      { userId: "user_price_override" },
    )
    expect(overridden.status).toBe("ok")
    if (overridden.status !== "ok") return
    expect(overridden.result.booking.sellAmountCents).toBe(42_000)
    expect(overridden.result.booking.priceOverride).toMatchObject({
      isManual: true,
      originalAmountCents: 50_000,
      overriddenAmountCents: 42_000,
      reason: "Current-request loyalty adjustment",
      overriddenBy: "user_price_override",
    })
    const pricedItems = await db
      .select({
        unitSellAmountCents: bookingItems.unitSellAmountCents,
        totalSellAmountCents: bookingItems.totalSellAmountCents,
      })
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, overridden.result.booking.id))
    expect(pricedItems).toEqual([{ unitSellAmountCents: 21_000, totalSellAmountCents: 42_000 }])
    expect(overridden.result.paymentSchedules).toEqual([
      expect.objectContaining({ amountCents: 42_000, currency: "EUR" }),
    ])
    expect(overridden.result.invoice).toMatchObject({
      subtotalCents: 40_000,
      taxCents: 2_000,
      totalCents: 42_000,
    })
  })

  it("prices selected units and extras from persisted rules and keeps invoice totals aligned", async () => {
    const { productId, optionId, unitId } = await seedProduct({ pax: null })
    const productExtraId = `pex_bc_${productSeq}`
    const optionExtraConfigId = `oexc_bc_${productSeq}`
    await seedPersistedPricing({
      productId,
      optionId,
      unitId,
      unitAmountCents: 12_000,
      unitPricingMode: "per_unit",
      extra: {
        productExtraId,
        optionExtraConfigId,
        amountCents: 3_000,
        pricingMode: "per_person",
      },
    })

    const outcome = await createBooking(db, {
      productId,
      optionId,
      bookingNumber: nextBookingNumber(),
      pax: 1,
      ...bookingParty(),
      travelers: [
        ...bookingParty().travelers,
        {
          clientTravelerKey: "trav:companion",
          firstName: "Bob",
          lastName: "Companion",
          participantType: "traveler",
        },
      ],
      itemLines: [
        {
          optionUnitId: unitId,
          quantity: 2,
          unitSellAmountCents: 1,
          totalSellAmountCents: 2,
        },
      ],
      extraLines: [
        {
          productExtraId,
          optionExtraConfigId,
          name: "Caller-supplied extra name",
          pricingMode: "per_booking",
          pricedPerPerson: false,
          quantity: 1,
          sellCurrency: "EUR",
          unitSellAmountCents: 1,
          totalSellAmountCents: 1,
        },
      ],
      paymentSchedules: [
        {
          scheduleType: "balance",
          status: "pending",
          currency: "EUR",
          amountCents: 30_000,
          dueDate: "2026-08-15",
        },
      ],
      documentGeneration: { invoiceDocument: true },
    })
    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return

    expect(outcome.result.booking).toMatchObject({ pax: 2, sellAmountCents: 30_000 })
    const pricedItems = await db
      .select({
        itemType: bookingItems.itemType,
        unitSellAmountCents: bookingItems.unitSellAmountCents,
        totalSellAmountCents: bookingItems.totalSellAmountCents,
      })
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, outcome.result.booking.id))
      .orderBy(asc(bookingItems.itemType))
    expect(pricedItems).toEqual([
      { itemType: "unit", unitSellAmountCents: 12_000, totalSellAmountCents: 24_000 },
      { itemType: "extra", unitSellAmountCents: 3_000, totalSellAmountCents: 6_000 },
    ])
    expect(outcome.result.paymentSchedules).toEqual([
      expect.objectContaining({ amountCents: 30_000, currency: "EUR" }),
    ])
    expect(outcome.result.invoice).toMatchObject({
      subtotalCents: 30_000,
      taxCents: 0,
      totalCents: 30_000,
    })
  })

  it.each([
    "on_hold",
    "confirmed",
  ] as const)("cancels a %s allocation on a closed departure and restores capacity exactly once", async (initialStatus) => {
    const { productId, optionId, roomUnitId } = await seedAccommodationProduct()
    const slot = await seedSlot({ productId, optionId, capacity: 12 })
    const outcome = await createBooking(db, {
      productId,
      optionId,
      slotId: slot.id,
      bookingNumber: nextBookingNumber(),
      initialStatus,
      pax: 2,
      ...bookingParty(),
      itemLines: [{ optionUnitId: roomUnitId, quantity: 1 }],
    })
    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    await db
      .update(availabilitySlots)
      .set({ status: "closed" })
      .where(eq(availabilitySlots.id, slot.id))

    const cancelled = await bookingsService.cancelBooking(
      db,
      outcome.result.booking.id,
      { note: "closed departure cancellation" },
      "user_qa",
    )
    expect(cancelled.status).toBe("ok")
    expect(await bookingsService.getBookingById(db, outcome.result.booking.id)).toMatchObject({
      status: "cancelled",
    })
    expect(await bookingsService.listAllocations(db, outcome.result.booking.id)).toEqual([
      expect.objectContaining({ status: "cancelled", quantity: 2 }),
    ])
    const [slotAfter] = await db
      .select({ status: availabilitySlots.status, remainingPax: availabilitySlots.remainingPax })
      .from(availabilitySlots)
      .where(eq(availabilitySlots.id, slot.id))
    expect(slotAfter).toEqual({ status: "closed", remainingPax: 12 })

    const replay = await bookingsService.cancelBooking(
      db,
      outcome.result.booking.id,
      { note: "closed departure cancellation" },
      "user_qa",
    )
    expect(replay.status).toBe("invalid_transition")
    const [slotAfterReplay] = await db
      .select({ status: availabilitySlots.status, remainingPax: availabilitySlots.remainingPax })
      .from(availabilitySlots)
      .where(eq(availabilitySlots.id, slot.id))
    expect(slotAfterReplay).toEqual({ status: "closed", remainingPax: 12 })
  })

  it("rejects selected room units that cannot seat the booking pax", async () => {
    const { productId, singleRoomUnitId } = await seedSingleFirstAccommodationProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelers: [
        {
          clientTravelerKey: "trav:lead",
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler",
          travelerCategory: "adult",
          isPrimary: true,
        },
        {
          firstName: "Bob",
          lastName: "Companion",
          participantType: "traveler",
          travelerCategory: "adult",
        },
      ],
      itemLines: [
        {
          optionUnitId: singleRoomUnitId,
          quantity: 1,
          title: "SGL room",
        },
      ],
    })

    expect(outcome).toEqual({
      status: "room_occupancy_insufficient",
      pax: 2,
      occupancyMax: 1,
      shortfall: 1,
    })
    expect(await db.select().from(bookings)).toHaveLength(0)
    expect(await db.select().from(bookingItems)).toHaveLength(0)
  })

  it("defaults missing room occupancy max to one seat per selected room", async () => {
    const { productId, singleRoomUnitId } = await seedSingleFirstAccommodationProduct({
      singleRoomOccupancyMax: null,
    })

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelers: [
        {
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler",
          travelerCategory: "adult",
          isPrimary: true,
        },
        {
          firstName: "Bob",
          lastName: "Companion",
          participantType: "traveler",
          travelerCategory: "adult",
        },
      ],
      itemLines: [
        {
          optionUnitId: singleRoomUnitId,
          quantity: 2,
          title: "SGL room",
        },
      ],
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return

    const itemRows = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, outcome.result.booking.id))
    expect(itemRows).toHaveLength(1)
    expect(itemRows[0]).toMatchObject({
      optionUnitId: singleRoomUnitId,
      quantity: 2,
    })
  })

  it("rejects omitted accommodation item lines when the seeded room cannot seat pax", async () => {
    const { productId } = await seedSingleFirstAccommodationProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelers: [
        {
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler",
          travelerCategory: "adult",
          isPrimary: true,
        },
        {
          firstName: "Bob",
          lastName: "Companion",
          participantType: "traveler",
          travelerCategory: "adult",
        },
      ],
    })

    expect(outcome).toEqual({
      status: "room_occupancy_insufficient",
      pax: 2,
      occupancyMax: 1,
      shortfall: 1,
    })
    expect(await db.select().from(bookings)).toHaveLength(0)
    expect(await db.select().from(bookingItems)).toHaveLength(0)
  })

  it("rejects duplicate stable traveler keys", async () => {
    const { productId, unitId } = await seedProduct()

    const result = bookingCreateSchema.safeParse({
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelers: [
        {
          clientTravelerKey: "trav:duplicate",
          firstName: "Alice",
          lastName: "Lead",
          participantType: "traveler",
          travelerCategory: "adult",
          isPrimary: true,
        },
        {
          clientTravelerKey: "trav:duplicate",
          firstName: "Bob",
          lastName: "Traveler",
          participantType: "traveler",
          travelerCategory: "adult",
        },
      ],
      itemLines: [
        {
          clientLineKey: `unit:${unitId}`,
          optionUnitId: unitId,
          quantity: 1,
          title: "Adult",
          travelerKeys: ["trav:duplicate"],
        },
      ],
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Duplicate clientTravelerKey: trav:duplicate",
        }),
      ]),
    )
  })

  it("rejects item and extra lines that reference unknown stable traveler keys", async () => {
    const { productId, unitId } = await seedProduct()

    const result = bookingCreateSchema.safeParse({
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelers: [
        {
          clientTravelerKey: "trav:lead",
          firstName: "Alice",
          lastName: "Lead",
          participantType: "traveler",
          travelerCategory: "adult",
          isPrimary: true,
        },
      ],
      itemLines: [
        {
          clientLineKey: `unit:${unitId}`,
          optionUnitId: unitId,
          quantity: 1,
          title: "Adult",
          travelerKeys: ["trav:missing-item"],
        },
      ],
      extraLines: [
        {
          clientLineKey: "extra:lunch",
          productExtraId: "lunch",
          name: "Lunch",
          pricingMode: "per_person",
          pricedPerPerson: true,
          quantity: 1,
          sellCurrency: "EUR",
          unitSellAmountCents: 1000,
          totalSellAmountCents: 1000,
          travelerKeys: ["trav:missing-extra"],
        },
      ],
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["itemLines", 0, "travelerKeys", 0],
          message: "Unknown travelerKey: trav:missing-item",
        }),
        expect.objectContaining({
          path: ["extraLines", 0, "travelerKeys", 0],
          message: "Unknown travelerKey: trav:missing-extra",
        }),
      ]),
    )
  })

  it("rejects booking-create payloads that drift from the server draft resolver", async () => {
    const { productId, unitId, childUnitId, infantUnitId } = await seedProduct({
      ageBandedUnits: true,
    })
    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelers: [
        {
          clientTravelerKey: "trav:lead",
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler",
          travelerCategory: "adult",
          isPrimary: true,
        },
        {
          clientTravelerKey: "trav:child",
          firstName: "Child",
          lastName: "Traveler",
          participantType: "traveler",
          travelerCategory: "child",
        },
        {
          clientTravelerKey: "trav:infant",
          firstName: "Infant",
          lastName: "Traveler",
          participantType: "traveler",
          travelerCategory: "infant",
        },
      ],
      itemLines: [
        {
          clientLineKey: `unit:${unitId}`,
          optionUnitId: unitId,
          quantity: 3,
          title: "Adult",
          travelerKeys: ["trav:lead", "trav:child", "trav:infant"],
        },
      ],
    })

    expect(outcome.status).toBe("payload_resolver_mismatch")
    if (outcome.status !== "payload_resolver_mismatch") return
    expect(outcome.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          optionUnitId: unitId,
          submittedQuantity: 3,
          resolvedQuantity: 1,
        }),
        expect.objectContaining({
          optionUnitId: childUnitId,
          submittedQuantity: 0,
          resolvedQuantity: 1,
        }),
        expect.objectContaining({
          optionUnitId: infantUnitId,
          submittedQuantity: 0,
          resolvedQuantity: 1,
        }),
      ]),
    )
    expect(await db.select().from(bookings)).toHaveLength(0)
    expect(await db.select().from(bookingTravelers)).toHaveLength(0)
    expect(await db.select().from(bookingItems)).toHaveLength(0)
  })

  it("accepts explicit aggregate age-banded lines without per-traveler assignments", async () => {
    const { productId, unitId, childUnitId, infantUnitId } = await seedProduct({
      ageBandedUnits: true,
    })

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelers: [
        {
          firstName: "Alice",
          lastName: "Lead",
          email: "alice@example.com",
          participantType: "traveler",
          isPrimary: true,
        },
        {
          firstName: "Child",
          lastName: "Traveler",
          participantType: "traveler",
        },
        {
          firstName: "Infant",
          lastName: "Traveler",
          participantType: "traveler",
        },
      ],
      itemLines: [
        {
          optionUnitId: unitId,
          quantity: 1,
          title: "Adult",
        },
        {
          optionUnitId: childUnitId,
          quantity: 1,
          title: "Child",
        },
        {
          optionUnitId: infantUnitId,
          quantity: 1,
          title: "Infant",
        },
      ],
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return

    const itemRows = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, outcome.result.booking.id))
    expect(itemRows.map((item) => [item.optionUnitId, item.quantity])).toEqual([
      [unitId, 1],
      [childUnitId, 1],
      [infantUnitId, 1],
    ])
  })

  it("redeems travel credit and decrements remaining balance", async () => {
    const { productId } = await seedProduct()
    const travelCredit = await seedTravelCredit({ remainingAmountCents: 25000 })

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelCreditRedemption: {
        travelCreditId: travelCredit.id,
        amountCents: 10000,
      },
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    expect(outcome.result.travelCreditRedemption?.travelCredit.remainingAmountCents).toBe(15000)
    expect(outcome.result.travelCreditRedemption?.redemption.amountCents).toBe(10000)

    const [updatedTravelCredit] = await db
      .select()
      .from(travelCredits)
      .where(eq(travelCredits.id, travelCredit.id))
    expect(updatedTravelCredit?.remainingAmountCents).toBe(15000)

    const redemptionRows = await db
      .select()
      .from(travelCreditRedemptions)
      .where(eq(travelCreditRedemptions.travelCreditId, travelCredit.id))
    expect(redemptionRows).toHaveLength(1)
    expect(redemptionRows[0]?.bookingId).toBe(outcome.result.booking.id)
  })

  it("rolls back booking + travelers when travel credit has insufficient balance", async () => {
    const { productId } = await seedProduct()
    const travelCredit = await seedTravelCredit({ remainingAmountCents: 500 })

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelers: [{ firstName: "Will", lastName: "Rollback", participantType: "traveler" }],
      paymentSchedules: [
        {
          scheduleType: "balance",
          dueDate: "2026-06-30",
          currency: "EUR",
          amountCents: 10000,
        },
      ],
      travelCreditRedemption: { travelCreditId: travelCredit.id, amountCents: 2000 },
    })

    expect(outcome.status).toBe("travel_credit_insufficient_balance")
    expect(await db.select().from(bookings)).toHaveLength(0)
    expect(await db.select().from(bookingTravelers)).toHaveLength(0)
    expect(await db.select().from(bookingPaymentSchedules)).toHaveLength(0)

    // Travel credit balance untouched.
    const [same] = await db
      .select()
      .from(travelCredits)
      .where(eq(travelCredits.id, travelCredit.id))
    expect(same?.remainingAmountCents).toBe(500)
  })

  it("returns travel_credit_not_found for an unknown travel credit", async () => {
    const { productId } = await seedProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelCreditRedemption: { travelCreditId: "vchr_missing", amountCents: 1000 },
    })

    expect(outcome.status).toBe("travel_credit_not_found")
    expect(await db.select().from(bookings)).toHaveLength(0)
  })

  it("returns travel_credit_inactive for a non-active travel credit", async () => {
    const { productId } = await seedProduct()
    const travelCredit = await seedTravelCredit({ status: "void" })

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelCreditRedemption: { travelCreditId: travelCredit.id, amountCents: 1000 },
    })
    expect(outcome.status).toBe("travel_credit_inactive")
  })

  it("returns travel_credit_expired for past expiresAt", async () => {
    const { productId } = await seedProduct()
    const travelCredit = await seedTravelCredit({ expiresAt: new Date("2020-01-01") })

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelCreditRedemption: { travelCreditId: travelCredit.id, amountCents: 1000 },
    })
    expect(outcome.status).toBe("travel_credit_expired")
  })

  it("creates a new booking group and attaches the booking as primary", async () => {
    const { productId } = await seedProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      groupMembership: {
        action: "create",
        kind: "shared_room",
        label: "My shared group",
      },
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    expect(outcome.result.groupMembership?.member.role).toBe("primary")

    const groupRows = await db.select().from(bookingGroups)
    expect(groupRows).toHaveLength(1)
    expect(groupRows[0]?.label).toBe("My shared group")
    expect(groupRows[0]?.primaryBookingId).toBe(outcome.result.booking.id)
  })

  it("joins an existing booking group", async () => {
    const { productId } = await seedProduct()
    const group = await seedBookingGroup()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      groupMembership: {
        action: "join",
        groupId: group.id,
        role: "shared",
      },
    })

    expect(outcome.status).toBe("ok")
    if (outcome.status !== "ok") return
    expect(outcome.result.groupMembership?.groupId).toBe(group.id)
    expect(outcome.result.groupMembership?.member.role).toBe("shared")
  })

  it("returns group_not_found for missing group (nothing written)", async () => {
    const { productId } = await seedProduct()

    const outcome = await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelers: [{ firstName: "Orphan", lastName: "Ghost", participantType: "traveler" }],
      groupMembership: { action: "join", groupId: "bgrp_missing", role: "shared" },
    })

    expect(outcome.status).toBe("group_not_found")
    expect(await db.select().from(bookings)).toHaveLength(0)
    expect(await db.select().from(bookingTravelers)).toHaveLength(0)
  })

  it("returns product_not_found for unknown productId", async () => {
    const outcome = await createBooking(db, {
      productId: "prod_nope",
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
    })

    expect(outcome.status).toBe("product_not_found")
    expect(await db.select().from(bookings)).toHaveLength(0)
  })

  it("leaves payment_instruments untouched when travel credit orchestration runs", async () => {
    // Regression guard: travel credit redemption must not mutate payment instruments;
    // the new orchestrator should never write to it.
    const { productId } = await seedProduct()
    const travelCredit = await seedTravelCredit({ remainingAmountCents: 20000 })

    await createBooking(db, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      travelCreditRedemption: { travelCreditId: travelCredit.id, amountCents: 5000 },
    })

    expect(await db.select().from(paymentInstruments)).toHaveLength(0)
  })

  it("settles one durable booking, result ledger, and outbox entry across exact replays", async () => {
    const { productId, unitId } = await seedProduct()
    const idempotencyKey = "finance-booking-create-replay"
    const command = await durableCommand(idempotencyKey, {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
      itemLines: [{ optionUnitId: unitId, quantity: 1 }],
      taxLines: [{ name: "VAT", currency: "EUR", amountCents: 9500, includedInPrice: true }],
    })

    const first = await executeFinanceBookingCreateCommand(command)
    const replay = await executeFinanceBookingCreateCommand(command)

    expect(first).toMatchObject({ replayed: false })
    expect(replay).toEqual(
      expect.objectContaining({
        replayed: true,
        value: { bookingId: first.value.bookingId },
      }),
    )
    expect(await db.select().from(bookings)).toHaveLength(1)
    expect(await db.select().from(bookingItemTaxLines)).toHaveLength(1)
    expect(await db.select().from(eventOutboxTable)).toEqual([
      expect.objectContaining({
        eventId: financeBookingCreatedEventId(first.value.bookingId),
        name: "booking.created",
      }),
    ])
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(
          and(
            eq(actionLedgerEntries.idempotencyKey, idempotencyKey),
            eq(actionLedgerEntries.status, "succeeded"),
          ),
        ),
    ).toHaveLength(1)
  })

  it("fences concurrent commands behind one durable booking creation", async () => {
    const { productId } = await seedProduct()
    const command = await durableCommand("finance-booking-create-concurrent", {
      productId,
      bookingNumber: nextBookingNumber(),
      ...bookingParty(),
    })

    const results = await Promise.all([
      executeFinanceBookingCreateCommand(command),
      executeFinanceBookingCreateCommand(command),
    ])

    expect(results.map((result) => result.replayed).sort()).toEqual([false, true])
    expect(new Set(results.map((result) => result.value.bookingId)).size).toBe(1)
    expect(await db.select().from(bookings)).toHaveLength(1)
    expect(await db.select().from(eventOutboxTable)).toHaveLength(1)
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.idempotencyKey, "finance-booking-create-concurrent")),
    ).toHaveLength(2)
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(
          and(
            eq(actionLedgerEntries.idempotencyKey, "finance-booking-create-concurrent"),
            eq(actionLedgerEntries.status, "succeeded"),
          ),
        ),
    ).toHaveLength(1)
  })

  it("rolls back the booking, claim, result, and outbox after an injected crash", async () => {
    const { productId, unitId } = await seedProduct()
    const idempotencyKey = "finance-booking-create-crash"
    await expect(
      executeFinanceBookingCreateCommand({
        ...(await durableCommand(idempotencyKey, {
          productId,
          bookingNumber: nextBookingNumber(),
          ...bookingParty(),
          itemLines: [{ optionUnitId: unitId, quantity: 1 }],
          taxLines: [{ name: "VAT", currency: "EUR", amountCents: 9500, includedInPrice: true }],
        })),
        testHooks: {
          async afterDomainCreate() {
            throw new Error("injected finance booking-create crash")
          },
        },
      }),
    ).rejects.toThrow("injected finance booking-create crash")

    expect(await db.select().from(bookings)).toHaveLength(0)
    expect(await db.select().from(bookingItemTaxLines)).toHaveLength(0)
    expect(await db.select().from(eventOutboxTable)).toHaveLength(0)
    expect(
      await db
        .select()
        .from(actionLedgerEntries)
        .where(eq(actionLedgerEntries.idempotencyKey, idempotencyKey)),
    ).toHaveLength(0)
  })

  async function durableCommand(
    idempotencyKey: string,
    commandInput: Parameters<typeof executeFinanceBookingCreateCommand>[0]["commandInput"],
  ) {
    const admitted = await mintFinanceBookingCreateAdmission(idempotencyKey)
    return {
      db,
      context: {
        userId: "user_finance_booking_create",
        callerType: "session" as const,
        actor: "staff" as const,
        organizationId: "tenant_finance_booking_create",
      },
      commandInput,
      admitted,
    }
  }
})

async function mintFinanceBookingCreateAdmission(
  idempotencyKey: string,
): Promise<ToolHandlerActionPolicyContext> {
  let admitted: ToolHandlerActionPolicyContext | undefined
  const registry = createToolRegistry()
  registry.register(
    defineTool({
      owner: "@voyant-travel/finance",
      capabilityId: FINANCE_BOOKING_CREATE_HANDLER_POLICY.capabilityId,
      capabilityVersion: FINANCE_BOOKING_CREATE_HANDLER_POLICY.capabilityVersion,
      name: FINANCE_BOOKING_CREATE_HANDLER_POLICY.canonicalName,
      description: "Mint authentic Finance booking-create admission for integration coverage.",
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.literal(true) }),
      requiredScopes: [],
      audience: { source: "grant", allowed: ["staff"] },
      tier: "destructive",
      riskPolicy: {
        destructive: true,
        reversible: false,
        dryRunSupported: false,
        confirmationRequired: true,
        sideEffects: ["data-write", "external-booking", "payment"],
      },
      actionPolicyEnforcement: "handler",
      async handler(_args, context) {
        admitted = context.handlerActionPolicy
        return { ok: true as const }
      },
    }),
    { actionPolicy: FINANCE_BOOKING_CREATE_HANDLER_POLICY.actionPolicy },
  )
  await registry.dispatch(
    FINANCE_BOOKING_CREATE_HANDLER_POLICY.canonicalName,
    {},
    {
      db: {},
      actor: "staff",
      audience: "staff",
      tenantId: "tenant_finance_booking_create",
      resolverScope: {
        locale: "en-GB",
        audience: "staff",
        market: "default",
        actor: "staff",
      },
      handlerActionPolicy: {
        ...FINANCE_BOOKING_CREATE_HANDLER_POLICY,
        actionPolicy: {
          ...FINANCE_BOOKING_CREATE_HANDLER_POLICY.actionPolicy,
          enforcement: "handler",
          invocation: {
            controlField: "_voyant",
            requiredFields: ["confirmed", "idempotencyKey"],
            optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
            fingerprintAlgorithm: "action-ledger-command-v1",
          },
        },
        invocation: { confirmed: true, idempotencyKey },
      },
    },
  )
  if (!admitted) throw new Error("Tool registry did not mint Finance booking-create admission")
  return admitted
}
