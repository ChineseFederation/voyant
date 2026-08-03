import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { afterEach, describe, expect, it } from "vitest"

const migrationDirectory = new URL("../../migrations/", import.meta.url)
const migrations = [
  "0000_bookings_baseline.sql",
  "0001_service_voucher_vocabulary.sql",
  "20260716000300_namespace_custom_field_values.sql",
  "20260729120000_booking_first_acceptance.sql",
  "20260729120100_persist_notification_suppression.sql",
  "20260801161000_booking_origin_storefront_channel.sql",
  "20260802160000_booking_traveler_amendments.sql",
  "20260802180000_priced_roster_amendments.sql",
  "20260802200000_booking_v1_status_cutover.sql",
] as const

const readMigration = (filename: (typeof migrations)[number]) =>
  readFileSync(new URL(filename, migrationDirectory), "utf8")

describe("Booking v1 status cutover data migration", () => {
  let client: PGlite | undefined

  afterEach(async () => {
    await client?.close()
    client = undefined
  })

  it("applies cleanly to an empty installation", async () => {
    client = new PGlite()
    for (const migration of migrations) {
      await client.exec(readMigration(migration))
    }

    const status = await client.query<{ columnDefault: string | null }>(`
      SELECT column_default AS "columnDefault"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'bookings'
        AND column_name = 'status'
    `)
    expect(status.rows).toEqual([{ columnDefault: null }])
  })

  it("preserves commitments, removes attempts, and restores their capacity", async () => {
    client = new PGlite()
    for (const migration of migrations.slice(0, -1)) {
      await client.exec(readMigration(migration))
    }

    await client.exec(`
      CREATE TABLE "availability_slots" (
        "id" text PRIMARY KEY NOT NULL,
        "unlimited" boolean DEFAULT false NOT NULL,
        "status" text NOT NULL,
        "initial_pax" integer,
        "remaining_pax" integer,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      INSERT INTO "availability_slots" (
        "id", "status", "initial_pax", "remaining_pax"
      ) VALUES ('slot_shared', 'sold_out', 10, 3);

      INSERT INTO "bookings" (
        "id", "booking_number", "status", "sell_currency", "accepted_at"
      ) VALUES
        ('booking_abandoned', 'BOOK-ABANDONED', 'draft', 'EUR', NULL),
        ('booking_accepted', 'BOOK-ACCEPTED', 'awaiting_payment', 'EUR', NULL),
        ('booking_cancelled', 'BOOK-CANCELLED', 'expired', 'EUR', now()),
        ('booking_fulfilled', 'BOOK-FULFILLED', 'draft', 'EUR', NULL);

      INSERT INTO "booking_items" (
        "id", "booking_id", "title", "status", "sell_currency"
      ) VALUES
        ('item_abandoned', 'booking_abandoned', 'Abandoned', 'on_hold', 'EUR'),
        ('item_accepted', 'booking_accepted', 'Accepted', 'on_hold', 'EUR'),
        ('item_cancelled', 'booking_cancelled', 'Cancelled', 'expired', 'EUR'),
        ('item_fulfilled', 'booking_fulfilled', 'Fulfilled', 'draft', 'EUR');

      INSERT INTO "booking_allocations" (
        "id", "booking_id", "booking_item_id", "availability_slot_id", "quantity", "status"
      ) VALUES (
        'allocation_abandoned',
        'booking_abandoned',
        'item_abandoned',
        'slot_shared',
        2,
        'held'
      );

      INSERT INTO "booking_fulfillments" (
        "id", "booking_id", "booking_item_id", "fulfillment_type", "delivery_channel", "status"
      ) VALUES (
        'fulfillment_committed',
        'booking_fulfilled',
        'item_fulfilled',
        'service_voucher',
        'download',
        'issued'
      );

      INSERT INTO "booking_session_states" ("id", "booking_id")
      VALUES ('session_accepted', 'booking_accepted');
    `)

    await client.exec(readMigration("20260802200000_booking_v1_status_cutover.sql"))

    const bookings = await client.query<{ id: string; status: string }>(`
      SELECT "id", "status"::text AS "status"
      FROM "bookings"
      ORDER BY "id"
    `)
    expect(bookings.rows).toEqual([
      { id: "booking_accepted", status: "confirmed" },
      { id: "booking_cancelled", status: "cancelled" },
      { id: "booking_fulfilled", status: "confirmed" },
    ])

    const items = await client.query<{ id: string; status: string }>(`
      SELECT "id", "status"::text AS "status"
      FROM "booking_items"
      ORDER BY "id"
    `)
    expect(items.rows).toEqual([
      { id: "item_accepted", status: "confirmed" },
      { id: "item_cancelled", status: "cancelled" },
      { id: "item_fulfilled", status: "confirmed" },
    ])

    const availability = await client.query<{ remainingPax: number; status: string }>(`
      SELECT "remaining_pax" AS "remainingPax", "status"
      FROM "availability_slots"
      WHERE "id" = 'slot_shared'
    `)
    expect(availability.rows).toEqual([{ remainingPax: 5, status: "open" }])

    const sessionTable = await client.query<{ tableName: string | null }>(`
      SELECT to_regclass('public.booking_session_states')::text AS "tableName"
    `)
    expect(sessionTable.rows).toEqual([{ tableName: null }])

    const enumValues = await client.query<{ enumName: string; value: string }>(`
      SELECT type.typname AS "enumName", enum.enumlabel AS "value"
      FROM pg_type type
      JOIN pg_enum enum ON enum.enumtypid = type.oid
      WHERE type.typname IN ('booking_status', 'booking_item_status')
      ORDER BY type.typname, enum.enumsortorder
    `)
    expect(enumValues.rows).toEqual([
      { enumName: "booking_item_status", value: "confirmed" },
      { enumName: "booking_item_status", value: "cancelled" },
      { enumName: "booking_item_status", value: "fulfilled" },
      { enumName: "booking_status", value: "confirmed" },
      { enumName: "booking_status", value: "in_progress" },
      { enumName: "booking_status", value: "completed" },
      { enumName: "booking_status", value: "cancelled" },
    ])

    const bookingColumns = await client.query<{
      columnDefault: string | null
      columnName: string
    }>(`
      SELECT column_name AS "columnName", column_default AS "columnDefault"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'bookings'
        AND column_name IN (
          'status',
          'hold_expires_at',
          'expired_at',
          'awaiting_payment_at',
          'paid_at'
        )
      ORDER BY column_name
    `)
    expect(bookingColumns.rows).toEqual([{ columnDefault: null, columnName: "status" }])
  })

  it("fails before mutation when an attempt has an ambiguous supplier effect", async () => {
    client = new PGlite()
    for (const migration of migrations.slice(0, -1)) {
      await client.exec(readMigration(migration))
    }

    await client.exec(`
      CREATE TABLE "availability_slots" (
        "id" text PRIMARY KEY NOT NULL,
        "unlimited" boolean DEFAULT false NOT NULL,
        "status" text NOT NULL,
        "initial_pax" integer,
        "remaining_pax" integer,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      INSERT INTO "availability_slots" (
        "id", "status", "initial_pax", "remaining_pax"
      ) VALUES ('slot_ambiguous', 'sold_out', 2, 0);

      INSERT INTO "bookings" (
        "id", "booking_number", "status", "sell_currency", "external_booking_ref"
      ) VALUES (
        'booking_ambiguous',
        'BOOK-AMBIGUOUS',
        'draft',
        'EUR',
        'SUPPLIER-UNKNOWN'
      );

      INSERT INTO "booking_items" (
        "id", "booking_id", "title", "status", "sell_currency"
      ) VALUES ('item_ambiguous', 'booking_ambiguous', 'Ambiguous', 'on_hold', 'EUR');

      INSERT INTO "booking_allocations" (
        "id", "booking_id", "booking_item_id", "availability_slot_id", "quantity", "status"
      ) VALUES (
        'allocation_ambiguous',
        'booking_ambiguous',
        'item_ambiguous',
        'slot_ambiguous',
        2,
        'held'
      );
    `)

    await expect(
      client.exec(readMigration("20260802200000_booking_v1_status_cutover.sql")),
    ).rejects.toThrow(/uncommitted Booking with an external reference/)

    const booking = await client.query<{ status: string }>(`
      SELECT "status"::text AS "status"
      FROM "bookings"
      WHERE "id" = 'booking_ambiguous'
    `)
    expect(booking.rows).toEqual([{ status: "draft" }])

    const availability = await client.query<{ remainingPax: number; status: string }>(`
      SELECT "remaining_pax" AS "remainingPax", "status"
      FROM "availability_slots"
      WHERE "id" = 'slot_ambiguous'
    `)
    expect(availability.rows).toEqual([{ remainingPax: 0, status: "sold_out" }])

    const sessionTable = await client.query<{ tableName: string | null }>(`
      SELECT to_regclass('public.booking_session_states')::text AS "tableName"
    `)
    expect(sessionTable.rows).toEqual([{ tableName: "booking_session_states" }])
  })
})
