import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it, vi } from "vitest"

import { loadRecentlyUpdatedAvailabilityPushSlots } from "../../src/channel-push/boundary-sql.js"
import { reconcileBookingLinks } from "../../src/channel-push/reconciler.js"

const dialect = new PgDialect()

describe("channel-push query parameters", () => {
  it("encodes the booking reconciliation timestamp before it reaches the driver", async () => {
    let whereSql: unknown
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((value: unknown) => {
            whereSql = value
            return {
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => []),
              })),
            }
          }),
        })),
      })),
    }

    await reconcileBookingLinks({ staleAfterMs: 0 }, {
      db,
      registry: { resolveByConnection: () => undefined },
    } as never)

    const query = dialect.sqlToQuery(whereSql as never)
    expect(query.params).toHaveLength(2)
    expect(query.params[0]).toBe("ok")
    expect(typeof query.params[1]).toBe("string")
    expect(() => new Date(query.params[1] as string).toISOString()).not.toThrow()
  })

  it("encodes the availability cursor before it reaches the driver", async () => {
    const updatedAfter = new Date("2026-07-29T03:45:47.000Z")
    let params: unknown[] = []
    const db = {
      execute: vi.fn(async (query) => {
        params = dialect.sqlToQuery(query).params
        return []
      }),
    }

    await loadRecentlyUpdatedAvailabilityPushSlots(db as never, {
      updatedAfter,
      limit: 500,
    })

    expect(params).toEqual([updatedAfter.toISOString(), 500])
  })
})
