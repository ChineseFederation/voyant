import { describe, expect, it, vi } from "vitest"

import { emitFirstResponseOverdueEvents } from "../../src/inquiry-overdue-job.js"

describe("inquiry first-response overdue scan", () => {
  it("emits deterministic outbox events and reports only newly inserted rows", async () => {
    const where = vi.fn(async () => [
      { id: "inq_1", firstResponseDueAt: new Date("2026-08-18T08:00:00.000Z") },
    ])
    const db = {
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
    const insertEvents = vi.fn(async (_db, events) => [{ id: "out_1", ...events[0] }])

    await expect(
      emitFirstResponseOverdueEvents(
        db as never,
        new Date("2026-08-18T09:00:00.000Z"),
        insertEvents as never,
      ),
    ).resolves.toBe(1)

    expect(insertEvents).toHaveBeenCalledWith(db, [
      {
        name: "inquiry.first_response_overdue",
        data: { id: "inq_1", firstResponseDueAt: "2026-08-18T08:00:00.000Z" },
        metadata: {
          eventId: "inquiry-first-response-overdue:inq_1:2026-08-18T08:00:00.000Z",
        },
      },
    ])
  })

  it("does not enqueue when another scan already claimed the overdue window", async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => [
            { id: "inq_1", firstResponseDueAt: new Date("2026-08-18T08:00:00.000Z") },
          ]),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({ returning: vi.fn(async () => []) })),
        })),
      })),
    }
    const insertEvents = vi.fn()

    await expect(
      emitFirstResponseOverdueEvents(db as never, new Date(), insertEvents as never),
    ).resolves.toBe(0)
    expect(insertEvents).not.toHaveBeenCalled()
  })
})
