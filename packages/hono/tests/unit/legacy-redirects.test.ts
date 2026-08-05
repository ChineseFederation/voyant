import {
  getLegacyPathUsageStore,
  InMemoryLegacyPathUsageStore,
  resetLegacyPathUsageStore,
} from "@voyant-travel/core"
import { Hono } from "hono"
import { afterEach, describe, expect, it } from "vitest"

import { legacyRedirects } from "../../src/middleware/legacy-redirects.js"

/**
 * Exercises the middleware as an HTTP edge, not as a wrapper around the pure
 * resolver: a real request in, a real `Location` header out, and the counter
 * moved. The resolver's own table is covered in `@voyant-travel/core`.
 */
function appWith(store?: InMemoryLegacyPathUsageStore) {
  const app = new Hono()
  app.use("*", legacyRedirects(store ? { store } : {}))
  app.all("*", (c) => c.text("FELL THROUGH", 200))
  return app
}

afterEach(() => {
  resetLegacyPathUsageStore()
})

describe("legacyRedirects", () => {
  it("redirects each superseded family and counts the hit", async () => {
    const store = new InMemoryLegacyPathUsageStore()
    const app = appWith(store)

    const cases: [string, string, string][] = [
      ["/extras/opt_1", "/products", "extras.detail"],
      ["/catalog/scheduled/prod_9", "/products/prod_9", "catalog.scheduled.detail"],
      ["/product/prod_9", "/products/prod_9", "product.detail"],
      ["/availability/slots/avsl_1", "/operations/availability/avsl_1", "availability.slot"],
    ]

    for (const [from, to, key] of cases) {
      const response = await app.request(from)
      expect(response.status).toBe(308)
      expect(response.headers.get("location")).toBe(to)
      expect(store.snapshot().find((row) => row.key === key)?.hits).toBe(1)
    }
  })

  it("carries the query string onto the successor", async () => {
    const response = await appWith(new InMemoryLegacyPathUsageStore()).request(
      "/product/prod_9?tab=pricing&from=email",
    )

    expect(response.headers.get("location")).toBe("/products/prod_9?tab=pricing&from=email")
  })

  it("falls through for a path that is not superseded, and counts nothing", async () => {
    const store = new InMemoryLegacyPathUsageStore()

    const response = await appWith(store).request("/products/prod_9")

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("FELL THROUGH")
    expect(store.snapshot().every((row) => row.hits === 0)).toBe(true)
  })

  it("records into the process-wide store when the host binds none", async () => {
    const response = await appWith().request("/extras")

    expect(response.status).toBe(308)
    expect(response.headers.get("location")).toBe("/products")
    const snapshot = await getLegacyPathUsageStore().snapshot()
    expect(snapshot.find((row) => row.key === "extras.index")?.hits).toBe(1)
  })

  it("still redirects when the counter throws", async () => {
    const app = new Hono()
    app.use(
      "*",
      legacyRedirects({
        store: {
          record() {
            throw new Error("counter down")
          },
          snapshot: () => [],
        },
      }),
    )
    app.all("*", (c) => c.text("FELL THROUGH", 200))

    const response = await app.request("/product/prod_9")

    expect(response.status).toBe(308)
    expect(response.headers.get("location")).toBe("/products/prod_9")
  })
})
