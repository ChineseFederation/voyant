import { describe, expect, it } from "vitest"

import {
  InMemoryLegacyPathUsageStore,
  LEGACY_REDIRECT_KEYS,
  resolveAndCountLegacyRedirect,
  resolveLegacyRedirect,
} from "../src/legacy-compat.js"

describe("resolveLegacyRedirect", () => {
  it("redirects each superseded family to its canonical successor", () => {
    expect(resolveLegacyRedirect("/extras/opt_123")).toMatchObject({
      family: "extras",
      to: "/products",
      status: 308,
    })
    expect(resolveLegacyRedirect("/extras")).toMatchObject({ to: "/products" })
    expect(resolveLegacyRedirect("/catalog/scheduled/prod_9")).toMatchObject({
      family: "catalog",
      to: "/products/prod_9",
    })
    expect(resolveLegacyRedirect("/catalog/scheduled")).toMatchObject({ to: "/products" })
    expect(resolveLegacyRedirect("/product/prod_9")).toMatchObject({
      family: "product",
      to: "/products/prod_9",
    })
    expect(resolveLegacyRedirect("/availability/slots/avsl_1")).toMatchObject({
      family: "availability",
      to: "/operations/availability/avsl_1",
    })
  })

  it("tolerates a trailing slash", () => {
    expect(resolveLegacyRedirect("/product/prod_9/")).toMatchObject({ to: "/products/prod_9" })
  })

  it("returns null for a path that is not superseded", () => {
    expect(resolveLegacyRedirect("/products/prod_9")).toBeNull()
    expect(resolveLegacyRedirect("/operations/availability/avsl_1")).toBeNull()
    expect(resolveLegacyRedirect("/")).toBeNull()
  })
})

describe("InMemoryLegacyPathUsageStore", () => {
  it("seeds every known key at zero so 'no usage' is explicit, not missing", () => {
    const store = new InMemoryLegacyPathUsageStore()
    const snapshot = store.snapshot()
    expect(snapshot.map((r) => r.key).sort()).toEqual([...LEGACY_REDIRECT_KEYS].sort())
    expect(snapshot.every((r) => r.hits === 0 && r.lastSeenAt === null)).toBe(true)
  })

  it("counts hits per key and stamps the last-seen instant", () => {
    const store = new InMemoryLegacyPathUsageStore()
    store.record("product.detail", new Date("2026-08-04T10:00:00Z"))
    store.record("product.detail", new Date("2026-08-04T11:00:00Z"))
    const row = store.snapshot().find((r) => r.key === "product.detail")
    expect(row?.hits).toBe(2)
    expect(row?.lastSeenAt).toBe("2026-08-04T11:00:00.000Z")
  })
})

describe("resolveAndCountLegacyRedirect", () => {
  it("resolves and records a hit in one call, and leaves non-legacy paths alone", async () => {
    const store = new InMemoryLegacyPathUsageStore()
    const now = new Date("2026-08-04T12:00:00Z")

    const hit = await resolveAndCountLegacyRedirect(store, "/extras/opt_1", now)
    expect(hit?.to).toBe("/products")
    expect(store.snapshot().find((r) => r.key === "extras.detail")?.hits).toBe(1)

    const miss = await resolveAndCountLegacyRedirect(store, "/products/opt_1", now)
    expect(miss).toBeNull()
  })

  it("never throws when the store's record fails — the redirect still resolves", async () => {
    const flakyStore = {
      record() {
        throw new Error("counter down")
      },
      snapshot() {
        return []
      },
    }
    const hit = await resolveAndCountLegacyRedirect(flakyStore, "/product/prod_9", new Date())
    expect(hit?.to).toBe("/products/prod_9")
  })
})
