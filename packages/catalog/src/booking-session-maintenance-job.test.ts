import { describe, expect, it, vi } from "vitest"

import type { BookingSessionModule } from "./booking-engine/index.js"
import { runCatalogBookingSessionMaintenance } from "./booking-session-maintenance-job.js"

describe("Booking Session maintenance job", () => {
  it("expires due Sessions before purging terminal PII under explicit system authority", async () => {
    const expireDueSessions = vi.fn(async () => ({ expired: 3 }))
    const purgeTerminalSessions = vi.fn(async () => ({ purged: 2 }))
    const module = { expireDueSessions, purgeTerminalSessions } as unknown as BookingSessionModule
    const now = new Date("2026-08-01T12:00:00.000Z")

    await expect(
      runCatalogBookingSessionMaintenance({
        resolveModule: () => module,
        reportFailure: vi.fn(),
        now: () => now,
        resolveRetentionMs: () => 7 * 24 * 60 * 60 * 1000,
        batchSize: 50,
      }),
    ).resolves.toEqual({ expired: 3, purged: 2 })

    expect(expireDueSessions).toHaveBeenCalledWith(
      { limit: 50 },
      expect.objectContaining({
        actorKind: "staff",
        principalId: "system:catalog-booking-session-maintenance",
        staffAuthority: { admitted: true, reason: "scheduled_retention" },
      }),
    )
    expect(purgeTerminalSessions).toHaveBeenCalledWith(
      { before: new Date("2026-07-25T12:00:00.000Z"), limit: 50 },
      expect.objectContaining({
        staffAuthority: { admitted: true, reason: "scheduled_retention" },
      }),
    )
    expect(expireDueSessions.mock.invocationCallOrder[0]).toBeLessThan(
      purgeTerminalSessions.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
  })

  it("reports one phase failure and still runs the other phase", async () => {
    const failure = new Error("expiry unavailable")
    const reportFailure = vi.fn()
    const module = {
      expireDueSessions: vi.fn(async () => {
        throw failure
      }),
      purgeTerminalSessions: vi.fn(async () => ({ purged: 1 })),
    } as unknown as BookingSessionModule

    await expect(
      runCatalogBookingSessionMaintenance({ resolveModule: () => module, reportFailure }),
    ).rejects.toThrow("Booking Session maintenance did not complete.")
    expect(reportFailure).toHaveBeenCalledWith(failure, { operation: "expire" })
    expect(module.purgeTerminalSessions).toHaveBeenCalledOnce()
  })
})
