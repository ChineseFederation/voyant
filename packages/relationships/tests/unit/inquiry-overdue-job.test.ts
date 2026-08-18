import { describe, expect, it, vi } from "vitest"

import { emitFirstResponseOverdueEvents } from "../../src/inquiry-overdue-job.js"

describe("inquiry first-response overdue scan", () => {
  it("emits deterministic outbox events and reports only newly inserted rows", async () => {
    const lockedRows = [{ id: "inq_1", firstResponseDueAt: new Date("2026-08-18T08:00:00.000Z") }]
    const lock = vi.fn(async () => lockedRows)
    const where = vi.fn(() => ({ for: lock }))
    const tx = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => [
              { id: "inq_1", firstResponseDueAt: new Date("2026-08-18T08:00:00.000Z") },
            ]),
          })),
        })),
      })),
    }
    const db = {
      transaction: vi.fn(async (operation: (database: typeof tx) => Promise<number>) =>
        operation(tx),
      ),
    }
    const insertEvents = vi.fn(async (_db, events) => [{ id: "out_1", ...events[0] }])

    await expect(
      emitFirstResponseOverdueEvents(
        db as never,
        new Date("2026-08-18T09:00:00.000Z"),
        insertEvents as never,
      ),
    ).resolves.toBe(1)

    expect(insertEvents).toHaveBeenCalledWith(tx, [
      {
        name: "inquiry.first_response_overdue",
        data: { id: "inq_1", firstResponseDueAt: "2026-08-18T08:00:00.000Z" },
        metadata: {
          eventId: "inquiry-first-response-overdue:inq_1:2026-08-18T08:00:00.000Z",
        },
      },
    ])
    expect(lock).toHaveBeenCalledWith("update", { skipLocked: true })
  })

  it("does not enqueue when another scan already claimed the overdue window", async () => {
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(async () => [
              { id: "inq_1", firstResponseDueAt: new Date("2026-08-18T08:00:00.000Z") },
            ]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({ returning: vi.fn(async () => []) })),
        })),
      })),
    }
    const db = {
      transaction: vi.fn(async (operation: (database: typeof tx) => Promise<number>) =>
        operation(tx),
      ),
    }
    const insertEvents = vi.fn()

    await expect(
      emitFirstResponseOverdueEvents(db as never, new Date(), insertEvents as never),
    ).resolves.toBe(0)
    expect(insertEvents).not.toHaveBeenCalled()
  })

  it("skips an inquiry locked by a concurrent response command", async () => {
    const lock = vi.fn(async () => [])
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ for: lock })) })),
      })),
      insert: vi.fn(),
    }
    const db = {
      transaction: vi.fn(async (operation: (database: typeof tx) => Promise<number>) =>
        operation(tx),
      ),
    }

    await expect(emitFirstResponseOverdueEvents(db as never, new Date())).resolves.toBe(0)
    expect(lock).toHaveBeenCalledWith("update", { skipLocked: true })
    expect(tx.insert).not.toHaveBeenCalled()
  })

  it("rolls back a claim when the outbox insert fails so the next scan retries it", async () => {
    let claimed = false
    const dueAt = new Date("2026-08-18T08:00:00.000Z")
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(async () => [{ id: "inq_1", firstResponseDueAt: dueAt }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => {
              if (claimed) return []
              claimed = true
              return [{ id: "inq_1", firstResponseDueAt: dueAt }]
            }),
          })),
        })),
      })),
    }
    const db = {
      transaction: vi.fn(async (operation: (database: typeof tx) => Promise<number>) => {
        const before = claimed
        try {
          return await operation(tx)
        } catch (error) {
          claimed = before
          throw error
        }
      }),
    }
    const insertEvents = vi
      .fn()
      .mockRejectedValueOnce(new Error("outbox unavailable"))
      .mockResolvedValueOnce([{ id: "out_1" }])

    await expect(
      emitFirstResponseOverdueEvents(db as never, new Date(), insertEvents as never),
    ).rejects.toThrow("outbox unavailable")
    await expect(
      emitFirstResponseOverdueEvents(db as never, new Date(), insertEvents as never),
    ).resolves.toBe(1)

    expect(db.transaction).toHaveBeenCalledTimes(2)
    expect(insertEvents).toHaveBeenCalledTimes(2)
  })
})
