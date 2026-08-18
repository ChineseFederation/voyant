import { describe, expect, it, vi } from "vitest"

import { createCatalogInquiryBookingSessionRuntime } from "./inquiry-booking-session-runtime.js"

function database(existingId?: string) {
  const tx = {
    execute: vi.fn(async () => undefined),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({ limit: async () => (existingId ? [{ id: existingId }] : []) }),
      }),
    })),
  }
  return {
    tx,
    db: { transaction: vi.fn(async (operation) => operation(tx)) },
  }
}

describe("Catalog Inquiry Booking Session runtime", () => {
  it("passes staff authority and reports a newly created session", async () => {
    const { db, tx } = database()
    const createSession = vi.fn(async () => ({
      kind: "session_created" as const,
      session: { id: "bks_1" },
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
    const { db } = database("bks_existing")
    const createSession = vi.fn(async () => ({
      kind: "session_created" as const,
      session: { id: "bks_existing" },
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
