import type { Context } from "hono"
import { describe, expect, it, vi } from "vitest"

import {
  createStorefrontAvailabilityReadModelInvalidationSubscriber,
  departuresDocKey,
  departuresDocPrefix,
  invalidateDeparturesReadModel,
  readThroughDepartures,
} from "../../src/departures-read-model.js"

function fakeKv() {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn(async <T = string>(key: string, options?: { type?: "json" | "text" }) => {
      const value = store.get(key)
      if (value === undefined) return null
      return (options?.type === "json" ? JSON.parse(value) : value) as T | null
    }),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
      store.set(key, value)
      return options
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
    list: vi.fn(async ({ prefix }: { prefix?: string } = {}) => ({
      keys: [...store.keys()]
        .filter((key) => !prefix || key.startsWith(prefix))
        .map((name) => ({ name })),
    })),
  }
}

function ctxWith(kv: ReturnType<typeof fakeKv> | undefined): Context<never> {
  return { env: { CACHE: kv } } as never
}

describe("departuresDocKey", () => {
  it("is stable across param order and skips nullish params", () => {
    const a = departuresDocKey("prod_1", { from: "2026-07-01", limit: 50, to: undefined })
    const b = departuresDocKey("prod_1", { limit: 50, from: "2026-07-01" })
    expect(a).toBe(b)
    expect(a).toContain("prod_1")
  })

  it("differs per product and per params", () => {
    expect(departuresDocKey("prod_1", {})).not.toBe(departuresDocKey("prod_2", {}))
    expect(departuresDocKey("prod_1", { limit: 10 })).not.toBe(
      departuresDocKey("prod_1", { limit: 20 }),
    )
  })
})

describe("readThroughDepartures", () => {
  it("computes once and serves the repeat from KV", async () => {
    const kv = fakeKv()
    const compute = vi.fn(async () => ({ data: [{ id: "dep_1" }] }))
    const key = departuresDocKey("prod_1", {})

    const first = await readThroughDepartures(ctxWith(kv), key, compute)
    const second = await readThroughDepartures(ctxWith(kv), key, compute)

    expect(first).toEqual({ data: [{ id: "dep_1" }] })
    expect(second).toEqual({ data: [{ id: "dep_1" }] })
    expect(compute).toHaveBeenCalledOnce()
    // Exact availability-event invalidation is primary; TTL bounds missed
    // events and cache implementations without prefix listing.
    const putOptions = kv.put.mock.calls[0]?.[2] as { expirationTtl?: number }
    expect(putOptions?.expirationTtl).toBe(900)
  })

  it("degrades to live compute without a CACHE binding", async () => {
    const compute = vi.fn(async () => ({ data: [] }))
    await readThroughDepartures(ctxWith(undefined), "k", compute)
    await readThroughDepartures(ctxWith(undefined), "k", compute)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it("degrades to live compute when KV reads throw", async () => {
    const kv = fakeKv()
    kv.get.mockRejectedValue(new Error("kv down"))
    const compute = vi.fn(async () => ({ data: [] }))

    const result = await readThroughDepartures(ctxWith(kv), "k", compute)

    expect(result).toEqual({ data: [] })
    expect(compute).toHaveBeenCalledOnce()
  })
})

describe("invalidateDeparturesReadModel", () => {
  it("deletes every query variant for one product only", async () => {
    const kv = fakeKv()
    kv.store.set(departuresDocKey("prod_1", {}), "one")
    kv.store.set(departuresDocKey("prod_1", { limit: 20 }), "two")
    kv.store.set(departuresDocKey("prod_2", {}), "other")

    await invalidateDeparturesReadModel(kv, "prod_1")

    expect(kv.list).toHaveBeenCalledWith({ prefix: departuresDocPrefix("prod_1") })
    expect(kv.store.has(departuresDocKey("prod_1", {}))).toBe(false)
    expect(kv.store.has(departuresDocKey("prod_1", { limit: 20 }))).toBe(false)
    expect(kv.store.has(departuresDocKey("prod_2", {}))).toBe(true)
  })
})

describe("availability read-model subscriber", () => {
  it("invalidates the affected product without reading Postgres", async () => {
    const kv = fakeKv()
    kv.store.set(departuresDocKey("prod_1", {}), "cached")
    let handler: ((event: { data: unknown }) => Promise<void>) | undefined
    const eventBus = {
      subscribe: vi.fn(
        (_eventType: string, registered: (event: { data: unknown }) => Promise<void>) => {
          handler = registered
        },
      ),
    }
    const subscriber = createStorefrontAvailabilityReadModelInvalidationSubscriber()

    subscriber.register({
      bindings: { CACHE: kv },
      container: {} as never,
      eventBus: eventBus as never,
    })
    await handler?.({ data: { productId: "prod_1", slotId: "slot_1" } })

    expect(eventBus.subscribe).toHaveBeenCalledWith(
      "availability.slot.changed",
      expect.any(Function),
      { inline: false },
    )
    expect(kv.store.has(departuresDocKey("prod_1", {}))).toBe(false)
  })
})
