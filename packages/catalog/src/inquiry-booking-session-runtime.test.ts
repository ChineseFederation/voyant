import { eventOutboxTable } from "@voyant-travel/db/schema"
import { eq } from "drizzle-orm"
import { describe, expect, it, vi } from "vitest"
import { bookingSessionsTable } from "./booking-engine/sessions-schema.js"
import { bookingSessionCreateIdempotencyKey } from "./booking-engine/sessions-service.js"
import { createCatalogInquiryBookingSessionRuntime } from "./inquiry-booking-session-runtime.js"

function database(existingId?: string) {
  const outboxValues: unknown[] = []
  const tx = {
    execute: vi.fn(async () => undefined),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({ limit: async () => (existingId ? [{ id: existingId }] : []) }),
      }),
    })),
    insert: vi.fn(() => ({
      values: (values: unknown[]) => {
        outboxValues.push(...values)
        return { onConflictDoNothing: () => ({ returning: async () => [] }) }
      },
    })),
  }
  return {
    tx,
    db: { transaction: vi.fn(async (operation) => operation(tx)) },
    outboxValues,
  }
}

describe("Catalog Inquiry Booking Session runtime", () => {
  it("passes staff authority and reports a newly created session", async () => {
    const { db, tx, outboxValues } = database()
    const createSession = vi.fn(async () => ({
      kind: "session_created" as const,
      session: { id: "bks_1", scope: { locale: "en", market: "default" } },
    }))
    const runtime = createCatalogInquiryBookingSessionRuntime(
      async () => ({ createSession }) as never,
    )

    await expect(
      runtime.createForInquiry({
        db: db as never,
        idempotencyKey: "owner-key",
        target: { kind: "product", productId: "prod_1" },
        selection: { partySize: 2 },
        actorId: "staff_1",
        organizationId: "org_1",
        channelId: "channel_1",
      }),
    ).resolves.toEqual({ kind: "created", bookingSessionId: "bks_1" })

    expect(tx.execute).toHaveBeenCalledOnce()
    expect(outboxValues).toEqual([
      expect.objectContaining({
        eventId: "evt_catalog_booking_session_created_bks_1",
        name: "catalog.booking-session.created",
        metadata: expect.objectContaining({ category: "domain", source: "service" }),
      }),
    ])
    expect(createSession).toHaveBeenCalledWith(
      {
        idempotencyKey: "owner-key",
        target: { kind: "product", productId: "prod_1" },
        selection: { partySize: 2 },
      },
      {
        actorKind: "staff",
        principalId: "staff_1",
        organizationId: "org_1",
        storefront: { channelId: "channel_1" },
        staffAuthority: { admitted: true, reason: "inquiry_conversion" },
      },
    )
  })

  it("delegates an existing key to the owner for conflict validation before replay", async () => {
    const { db, outboxValues } = database("bks_existing")
    const createSession = vi.fn(async () => ({
      kind: "session_created" as const,
      session: { id: "bks_existing", scope: { locale: "en", market: "default" } },
    }))
    const runtime = createCatalogInquiryBookingSessionRuntime(
      async () => ({ createSession }) as never,
    )

    await expect(
      runtime.createForInquiry({
        db: db as never,
        idempotencyKey: "owner-key",
        target: { kind: "product", productId: "prod_1" },
        actorId: "staff_1",
      }),
    ).resolves.toEqual({ kind: "replayed", bookingSessionId: "bks_existing" })
    expect(createSession).toHaveBeenCalledOnce()
    expect(outboxValues).toEqual([])
  })

  it.each([
    ["idempotency_conflict", "idempotency_conflict"],
    ["invalid_selection", "invalid_selection"],
    ["target_not_found", "target_unavailable"],
  ] as const)("maps the owner refusal %s", async (ownerReason, expectedReason) => {
    const { db } = database()
    const runtime = createCatalogInquiryBookingSessionRuntime(
      async () =>
        ({
          createSession: vi.fn(async () => ({
            kind: "rejected" as const,
            error: { kind: ownerReason },
          })),
        }) as never,
    )

    await expect(
      runtime.createForInquiry({
        db: db as never,
        idempotencyKey: "owner-key",
        target: { kind: "product", productId: "prod_1" },
        actorId: "staff_1",
      }),
    ).resolves.toEqual({ kind: "refused", reason: expectedReason })
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)("Catalog Inquiry replay persistence", () => {
  it("classifies the real owner-scoped persisted key as a replay without another owner event", async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    const db = createTestDb()
    const access = {
      actorKind: "staff" as const,
      principalId: "staff_replay",
      staffAuthority: { admitted: true as const, reason: "inquiry_conversion" },
    }
    const persistedKey = await bookingSessionCreateIdempotencyKey(
      "owner-key-real",
      access,
      undefined,
    )
    await db
      .delete(bookingSessionsTable)
      .where(eq(bookingSessionsTable.id, "bses_01J00000000000000000000001"))
    await db.insert(bookingSessionsTable).values({
      id: "bses_01J00000000000000000000001",
      createIdempotencyKey: persistedKey,
      createRequestFingerprint: "fingerprint",
      actorKind: "staff",
      ownerPrincipalId: "staff_replay",
      locale: "en",
      market: "default",
      targetKind: "product",
      productId: "prod_01J00000000000000000000001",
      state: "active",
      revision: 1,
      statePayload: {},
      expiresAt: new Date(Date.now() + 60_000),
    })
    const createSession = vi.fn(async () => ({
      kind: "session_created" as const,
      session: {
        id: "bses_01J00000000000000000000001",
        scope: { locale: "en", market: "default" },
      },
    }))
    const runtime = createCatalogInquiryBookingSessionRuntime(
      async () => ({ createSession }) as never,
    )

    await expect(
      runtime.createForInquiry({
        db,
        idempotencyKey: "owner-key-real",
        target: { kind: "product", productId: "prod_01J00000000000000000000001" },
        actorId: "staff_replay",
      }),
    ).resolves.toEqual({
      kind: "replayed",
      bookingSessionId: "bses_01J00000000000000000000001",
    })
    expect(
      (await db.select().from(eventOutboxTable)).filter(
        (row) => row.name === "catalog.booking-session.created",
      ),
    ).toHaveLength(0)
    await db
      .delete(bookingSessionsTable)
      .where(eq(bookingSessionsTable.id, "bses_01J00000000000000000000001"))
  })
})
