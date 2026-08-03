import { describe, expect, it } from "vitest"

import type { KVStore } from "../src/cache.js"
import { createMemoryKvNamespace } from "../src/memory-kv.js"
import { createTieredKvStore } from "../src/tiered-kv.js"

describe("createMemoryKvNamespace", () => {
  it("expires entries after expirationTtl seconds", async () => {
    let clock = 1_000
    const kv = createMemoryKvNamespace({ now: () => clock })
    await kv.put("k", "v", { expirationTtl: 30 })
    expect(await kv.get("k")).toBe("v")
    clock += 30_001
    expect(await kv.get("k")).toBeNull()
  })

  it("evicts least-recently-used entries past maxEntries", async () => {
    const kv = createMemoryKvNamespace({ maxEntries: 2 })
    await kv.put("a", "1")
    await kv.put("b", "2")
    await kv.get("a")
    await kv.put("c", "3")
    expect(await kv.get("a")).toBe("1")
    expect(await kv.get("b")).toBeNull()
    expect(await kv.get("c")).toBe("3")
  })

  it("lists fresh keys by prefix", async () => {
    let clock = 1_000
    const kv = createMemoryKvNamespace({ now: () => clock })
    await kv.put("p:a", "1")
    await kv.put("p:b", "2", { expirationTtl: 1 })
    await kv.put("q:c", "3")
    clock += 1_001
    await expect(kv.list?.({ prefix: "p:" })).resolves.toEqual({ keys: [{ name: "p:a" }] })
  })
})

describe("createMemoryKvNamespace putIfAbsent", () => {
  it("elects exactly one winner among concurrent callers on the same key", async () => {
    const kv = createMemoryKvNamespace()

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) => kv.putIfAbsent?.("lock", `caller-${index}`)),
    )

    expect(results.filter((won) => won === true)).toHaveLength(1)
    expect(results.filter((won) => won === false)).toHaveLength(4)
  })

  it("makes the winner's value the readable value", async () => {
    const kv = createMemoryKvNamespace()

    await expect(kv.putIfAbsent?.("k", "winner")).resolves.toBe(true)
    await expect(kv.putIfAbsent?.("k", "loser")).resolves.toBe(false)

    expect(await kv.get("k")).toBe("winner")
  })

  it("applies the TTL to the entry the winner wrote", async () => {
    let clock = 1_000
    const kv = createMemoryKvNamespace({ now: () => clock })

    await expect(kv.putIfAbsent?.("k", "v", { expirationTtl: 30 })).resolves.toBe(true)
    clock += 29_000
    expect(await kv.get("k")).toBe("v")

    clock += 1_001
    expect(await kv.get("k")).toBeNull()
  })

  it("treats an expired entry as absent so a later caller wins the slot again", async () => {
    let clock = 1_000
    const kv = createMemoryKvNamespace({ now: () => clock })

    await expect(kv.putIfAbsent?.("k", "first", { expirationTtl: 30 })).resolves.toBe(true)
    await expect(kv.putIfAbsent?.("k", "blocked", { expirationTtl: 30 })).resolves.toBe(false)

    clock += 30_001
    await expect(kv.putIfAbsent?.("k", "second", { expirationTtl: 30 })).resolves.toBe(true)
    expect(await kv.get("k")).toBe("second")
  })

  it("respects LRU eviction for entries it writes", async () => {
    const kv = createMemoryKvNamespace({ maxEntries: 2 })

    await expect(kv.putIfAbsent?.("a", "1")).resolves.toBe(true)
    await expect(kv.putIfAbsent?.("b", "2")).resolves.toBe(true)
    await kv.get("a")
    await expect(kv.putIfAbsent?.("c", "3")).resolves.toBe(true)

    expect(await kv.get("a")).toBe("1")
    expect(await kv.get("b")).toBeNull()
    expect(await kv.get("c")).toBe("3")
  })
})

describe("createTieredKvStore", () => {
  it("writes through to L1 and L2 and deletes both", async () => {
    const l1 = createMemoryKvNamespace()
    const l2 = createMemoryKvNamespace()
    const kv = createTieredKvStore(l1, l2)

    await kv.put("k", "v")
    expect(await l1.get("k")).toBe("v")
    expect(await l2.get("k")).toBe("v")

    await kv.delete("k")
    expect(await l1.get("k")).toBeNull()
    expect(await l2.get("k")).toBeNull()
  })

  it("promotes L2 hits into L1 with a bounded TTL", async () => {
    let clock = 1_000
    const l1 = createMemoryKvNamespace({ now: () => clock })
    const l2 = createMemoryKvNamespace()
    const kv = createTieredKvStore(l1, l2, { l2PromotionTtlSeconds: 1 })

    await l2.put("k", JSON.stringify({ ok: true }))
    await expect(kv.get("k", { type: "json" })).resolves.toEqual({ ok: true })
    expect(await l1.get("k")).toBe(JSON.stringify({ ok: true }))

    clock += 1_001
    expect(await l1.get("k")).toBeNull()
  })

  it("bounds write-through L1 entries without shortening the L2 TTL", async () => {
    let clock = 1_000
    const l1 = createMemoryKvNamespace({ now: () => clock })
    const l2 = createMemoryKvNamespace({ now: () => clock })
    const kv = createTieredKvStore(l1, l2)

    await kv.put("k", "v", { expirationTtl: 900 })
    clock += 60_001

    expect(await l1.get("k")).toBeNull()
    expect(await l2.get("k")).toBe("v")
  })

  it("preserves a write-through TTL shorter than the L1 bound", async () => {
    let clock = 1_000
    const l1 = createMemoryKvNamespace({ now: () => clock })
    const l2 = createMemoryKvNamespace({ now: () => clock })
    const kv = createTieredKvStore(l1, l2)

    await kv.put("k", "v", { expirationTtl: 30 })
    clock += 30_001

    expect(await l1.get("k")).toBeNull()
    expect(await l2.get("k")).toBeNull()
  })
})

describe("createTieredKvStore putIfAbsent", () => {
  /** An L2 that cannot elect atomically, so the tier must not offer election. */
  function kvWithoutElection(): KVStore {
    const inner = createMemoryKvNamespace()
    return {
      get: (key, getOptions) => inner.get(key, getOptions as { type?: "json" | "text" }),
      put: (key, value, putOptions) => inner.put(key, value, putOptions),
      delete: (key) => inner.delete(key),
    }
  }

  it("omits putIfAbsent when L2 cannot elect", () => {
    const kv = createTieredKvStore(createMemoryKvNamespace(), kvWithoutElection())

    expect(kv.putIfAbsent).toBeUndefined()
  })

  it("exposes putIfAbsent when L2 can elect", () => {
    const kv = createTieredKvStore(createMemoryKvNamespace(), createMemoryKvNamespace())

    expect(typeof kv.putIfAbsent).toBe("function")
  })

  it("loses the election to an L2 holder even when L1 has nothing", async () => {
    const l1 = createMemoryKvNamespace()
    const l2 = createMemoryKvNamespace()
    const kv = createTieredKvStore(l1, l2)

    await l2.put("k", "held-elsewhere")

    // L1 is empty, so a per-process election would have returned true.
    expect(await l1.get("k")).toBeNull()
    await expect(kv.putIfAbsent?.("k", "mine")).resolves.toBe(false)
    expect(await l2.get("k")).toBe("held-elsewhere")
  })

  it("wins the election against an L1-only holder because L2 decides", async () => {
    const l1 = createMemoryKvNamespace()
    const l2 = createMemoryKvNamespace()
    const kv = createTieredKvStore(l1, l2)

    await l1.put("k", "stale-local")

    await expect(kv.putIfAbsent?.("k", "winner")).resolves.toBe(true)
    expect(await l2.get("k")).toBe("winner")
    expect(await l1.get("k")).toBe("winner")
  })

  it("mirrors the winner's value into L1 so it reads back through the tier", async () => {
    const l1 = createMemoryKvNamespace()
    const l2 = createMemoryKvNamespace()
    const kv = createTieredKvStore(l1, l2)

    await expect(kv.putIfAbsent?.("k", "winner", { expirationTtl: 30 })).resolves.toBe(true)

    expect(await l1.get("k")).toBe("winner")
    expect(await kv.get("k")).toBe("winner")
  })

  it("does not mirror into L1 when the election was lost", async () => {
    const l1 = createMemoryKvNamespace()
    const l2 = createMemoryKvNamespace()
    const kv = createTieredKvStore(l1, l2)

    await l2.put("k", "held-elsewhere")
    await expect(kv.putIfAbsent?.("k", "mine")).resolves.toBe(false)

    expect(await l1.get("k")).toBeNull()
  })

  it("caps the mirrored L1 entry at l2PromotionTtlSeconds without shortening L2", async () => {
    let clock = 1_000
    const l1 = createMemoryKvNamespace({ now: () => clock })
    const l2 = createMemoryKvNamespace({ now: () => clock })
    const kv = createTieredKvStore(l1, l2)

    await expect(kv.putIfAbsent?.("k", "winner", { expirationTtl: 900 })).resolves.toBe(true)
    clock += 60_001

    expect(await l1.get("k")).toBeNull()
    expect(await l2.get("k")).toBe("winner")
  })

  it("elects exactly one winner among concurrent tier callers", async () => {
    const kv = createTieredKvStore(createMemoryKvNamespace(), createMemoryKvNamespace())

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) => kv.putIfAbsent?.("lock", `caller-${index}`)),
    )

    expect(results.filter((won) => won === true)).toHaveLength(1)
    expect(results.filter((won) => won === false)).toHaveLength(4)
  })
})
