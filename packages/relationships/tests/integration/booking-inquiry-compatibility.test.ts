import { OpenAPIHono } from "@hono/zod-openapi"
import {
  createBookingInquiryAdminRoutes,
  createBookingInquiryPublicRoutes,
} from "@voyant-travel/bookings"
import { bookingsCanonicalInquiryIntakeRuntimePort } from "@voyant-travel/bookings/inquiry-intake-runtime-port"
import {
  legacyBookingInquiryReadRuntime,
  legacyBookingInquiryReadRuntimePort,
} from "@voyant-travel/bookings/legacy-inquiry-read-runtime-port"
import { bookingInquiries } from "@voyant-travel/bookings/schema"
import { createEventBus, generateLinkTableSql } from "@voyant-travel/core"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createBookingsRuntime } from "../../../bookings/src/runtime.js"
import { runLegacyInquiryCutoverBatch } from "../../src/legacy-inquiry-cutover.js"
import { createRelationshipsRuntimePortContribution } from "../../src/runtime-contributor.js"
import { inquiries, inquiryLegacySources } from "../../src/schema.js"
import { inquiryOptionUnitLink, inquiryProductLink } from "../../src/standard-links.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

async function requestFingerprint(input: {
  channelId: string
  productId: string
  departureId: string | null
  contact: {
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
  }
  locale: string
  message: string
}) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(input)),
  )
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

describe.skipIf(!DB_AVAILABLE)("Booking Inquiry compatibility over canonical Inquiry", () => {
  // biome-ignore lint/suspicious/noExplicitAny: shared integration database fixture.
  let db: any
  let service: NonNullable<
    ReturnType<typeof createBookingsRuntime>["options"]["bookingInquiryIntake"]
  >

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    for (const definition of [inquiryProductLink, inquiryOptionUnitLink]) {
      const ddl = generateLinkTableSql(definition)
      await db.execute(sql.raw(ddl.createTable))
      for (const index of ddl.indexes) await db.execute(sql.raw(index))
    }
    const contribution = createRelationshipsRuntimePortContribution({
      primitives: {
        database: { resolve: () => db, transaction: (_bindings, operation) => operation(db) },
        config: { read: () => undefined },
      } as never,
      hasRuntimePort: (port) => port.id === legacyBookingInquiryReadRuntimePort.id,
      getRuntimePort: async <T>(port) =>
        (port.id === legacyBookingInquiryReadRuntimePort.id
          ? legacyBookingInquiryReadRuntime
          : {
              resolveRegistry: async () => ({ all: () => [] }),
              resolveRegistryForWrite: async () => ({ all: () => [] }),
            }) as unknown as T,
      getRuntimePorts: async <T>() =>
        [
          {
            kind: "product" as const,
            targetExists: async () => true,
            resolveSnapshot: async () => ({ title: "Danube Escape" }),
          },
          {
            kind: "option_unit" as const,
            targetExists: async () => true,
            resolveSnapshot: async () => ({
              title: "April departure",
              startDate: "2027-04-01",
            }),
          },
        ] as unknown as T[],
    })
    const inquiryIntake = contribution[bookingsCanonicalInquiryIntakeRuntimePort.id] as Parameters<
      typeof createBookingsRuntime
    >[0]["inquiryIntake"]
    service = createBookingsRuntime({
      inquiryIntake,
      accommodation: { enrichOverviewItems: async () => new Map() },
      customFields: {
        resolveRegistry: async () => ({ all: () => [] }),
        resolveRegistryForWrite: async () => ({ all: () => [] }),
      } as never,
      finance: {
        quoteBookingAmendment: async () => {
          throw new Error("not used")
        },
        recordBookingAmendment: async () => {
          throw new Error("not used")
        },
      },
      relationships: {
        loadPersonTravelSnapshot: async () => null,
        upsertPersonFromContact: async () => null,
        getPersonById: async () => null,
        getOrganizationById: async () => null,
      },
    }).options.bookingInquiryIntake as typeof service
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    for (const definition of [inquiryProductLink, inquiryOptionUnitLink]) {
      await db.execute(sql.raw(`DELETE FROM "${definition.tableName}"`))
    }
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  it("keeps new canonical submissions and pre-cutover rows visible through admin GET/list", async () => {
    const [legacy] = await db
      .insert(bookingInquiries)
      .values({
        idempotencyKey: "legacy-key",
        requestFingerprint: "legacy-fingerprint",
        channelId: "channel_1",
        productId: "prod_legacy",
        departureId: null,
        contactEmail: "legacy@example.com",
        locale: "en",
        message: "Legacy inquiry",
      })
      .returning()
    const eventBus = createEventBus()
    const received = vi.fn()
    eventBus.subscribe("booking.inquiry.created", received)
    const publicApp = new OpenAPIHono()
      .use("*", async (c, next) => {
        c.set("db" as never, db)
        c.set("eventBus" as never, eventBus)
        c.set("publicChannel" as never, { channelId: "channel_1", channelStatus: "active" })
        await next()
      })
      .route("/", createBookingInquiryPublicRoutes(service))
    const createdResponse = await publicApp.request("/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "canonical-key" },
      body: JSON.stringify({
        productId: "prod_new",
        departureId: "departure_new",
        contact: { firstName: "Ana", email: "ana@example.com" },
        locale: "en",
        message: "Canonical inquiry",
      }),
    })
    expect(createdResponse.status).toBe(201)
    const created = (await createdResponse.json()).data
    expect(await db.select().from(bookingInquiries)).toHaveLength(1)
    expect(await db.select().from(inquiries).where(eq(inquiries.id, created.id))).toHaveLength(1)

    const adminApp = new OpenAPIHono()
      .use("*", async (c, next) => {
        c.set("db" as never, db)
        await next()
      })
      .route("/", createBookingInquiryAdminRoutes(service))
    const canonicalGet = await adminApp.request(`/inquiries/${created.id}`)
    expect(canonicalGet.status).toBe(200)
    await expect(canonicalGet.json()).resolves.toMatchObject({
      data: { id: created.id, productId: "prod_new" },
    })
    const legacyGet = await adminApp.request(`/inquiries/${legacy.id}`)
    expect(legacyGet.status).toBe(200)
    const list = await adminApp.request("/inquiries")
    expect((await list.json()).data.map((row: { id: string }) => row.id)).toEqual([
      created.id,
      legacy.id,
    ])
    expect(received).toHaveBeenCalledTimes(1)
  })

  it("adopts and replays a historical identity before the scheduled cutover runs", async () => {
    const command = {
      idempotencyKey: "historical-replay",
      channelId: "channel_1",
      productId: "prod_legacy",
      departureId: null,
      contact: {
        firstName: "Ana",
        lastName: "Popescu",
        email: "ana@example.com",
        phone: null,
      },
      locale: "en",
      message: "Historical inquiry",
    }
    await db.insert(bookingInquiries).values([
      {
        id: "binq_a",
        idempotencyKey: "historical-a",
        requestFingerprint: "fixture-a",
        channelId: "channel_1",
        productId: "prod_a",
        locale: "en",
        message: "Historical A",
      },
      {
        id: "binq_b",
        idempotencyKey: "historical-b",
        requestFingerprint: "fixture-b",
        channelId: "channel_1",
        productId: "prod_b",
        locale: "en",
        message: "Historical B",
      },
    ])
    const [legacy] = await db
      .insert(bookingInquiries)
      .values({
        id: "binq_c",
        idempotencyKey: command.idempotencyKey,
        channelId: command.channelId,
        productId: command.productId,
        departureId: command.departureId,
        contactFirstName: command.contact.firstName,
        contactLastName: command.contact.lastName,
        contactEmail: command.contact.email,
        contactPhone: command.contact.phone,
        locale: command.locale,
        message: command.message,
        requestFingerprint: await requestFingerprint({
          channelId: command.channelId,
          productId: command.productId,
          departureId: command.departureId,
          contact: command.contact,
          locale: command.locale,
          message: command.message,
        }),
      })
      .returning()
    const replay = await service.submit(db, command)
    expect(replay).toMatchObject({
      status: "replayed",
      inquiry: {
        id: legacy.id,
        idempotencyKey: command.idempotencyKey,
        requestFingerprint: legacy.requestFingerprint,
        productId: command.productId,
      },
    })
    expect(await db.select().from(inquiries)).toHaveLength(1)

    const cutoverInput = {
      db,
      reader: legacyBookingInquiryReadRuntime,
      authorities: [
        {
          kind: "product" as const,
          targetExists: async () => true,
          resolveSnapshot: async () => ({ title: "Danube Escape" }),
        },
      ],
      limit: 1,
    }
    const first = await runLegacyInquiryCutoverBatch(cutoverInput)
    const second = await runLegacyInquiryCutoverBatch(cutoverInput)
    const third = await runLegacyInquiryCutoverBatch(cutoverInput)
    expect(first).toMatchObject({ migrated: 1, replayed: 0 })
    expect(second).toMatchObject({ migrated: 1, replayed: 0 })
    expect(third).toMatchObject({ migrated: 0, replayed: 1, remaining: 0 })
    expect(await db.select().from(inquiries)).toHaveLength(3)
    expect(await db.select().from(inquiryLegacySources)).toHaveLength(3)
  })
})
