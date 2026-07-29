import { describe, expect, it } from "vitest"

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
