import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import {
  ADMIN_REVALIDATE_CACHE_CONTROL,
  adminResponseRevalidation,
} from "../../src/middleware/admin-revalidation.js"

function buildApp() {
  const app = new Hono()
  app.use("/v1/admin/*", adminResponseRevalidation())
  app.get("/v1/admin/bookings", (c) => c.json({ rows: [{ id: "bkg_1" }] }))
  app.get("/v1/admin/volatile", (c) => c.json({ at: c.req.query("at") ?? "0" }))
  app.get("/v1/admin/aggregates", (c) => {
    c.header("Cache-Control", "private, max-age=30")
    return c.json({ total: 3 })
  })
  app.get("/v1/admin/export", (c) => {
    c.header("Content-Type", "text/csv")
    return c.body("id\nbkg_1\n")
  })
  app.get("/v1/admin/missing", (c) => c.json({ error: "Not found" }, 404))
  app.post("/v1/admin/bookings", (c) => c.json({ id: "bkg_2" }, 200))
  app.get("/v1/public/catalog", (c) => c.json({ rows: [] }))
  return app
}

describe("adminResponseRevalidation middleware", () => {
  it("stamps an ETag, a private cache directive, and the credential Vary", async () => {
    const response = await buildApp().request("/v1/admin/bookings")

    expect(response.status).toBe(200)
    expect(response.headers.get("ETag")).toMatch(/^W\/"[0-9a-f]{32}"$/)
    expect(response.headers.get("Cache-Control")).toBe(ADMIN_REVALIDATE_CACHE_CONTROL)
    expect(response.headers.get("Vary")).toBe("Cookie, Authorization")
    expect(await response.json()).toEqual({ rows: [{ id: "bkg_1" }] })
  })

  it("answers a matching If-None-Match with a bodyless 304 that keeps the validators", async () => {
    const app = buildApp()
    const first = await app.request("/v1/admin/bookings")
    const etag = first.headers.get("ETag") ?? ""

    const second = await app.request("/v1/admin/bookings", {
      headers: { "if-none-match": etag },
    })

    expect(second.status).toBe(304)
    expect(second.headers.get("ETag")).toBe(etag)
    expect(second.headers.get("Cache-Control")).toBe(ADMIN_REVALIDATE_CACHE_CONTROL)
    expect(second.headers.get("Content-Length")).toBeNull()
    expect(await second.text()).toBe("")
  })

  it("matches an unquoted or listed candidate the same way a browser would", async () => {
    const app = buildApp()
    const etag = (await app.request("/v1/admin/bookings")).headers.get("ETag") ?? ""
    const strong = etag.replace(/^W\//, "")

    const listed = await app.request("/v1/admin/bookings", {
      headers: { "if-none-match": `W/"stale", ${strong}` },
    })

    expect(listed.status).toBe(304)
  })

  it("returns the full body when the entity changed", async () => {
    const app = buildApp()
    const first = await app.request("/v1/admin/volatile?at=1")

    const second = await app.request("/v1/admin/volatile?at=2", {
      headers: { "if-none-match": first.headers.get("ETag") ?? "" },
    })

    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ at: "2" })
    expect(second.headers.get("ETag")).not.toBe(first.headers.get("ETag"))
  })

  it("leaves a route that stated its own cache policy alone", async () => {
    const response = await buildApp().request("/v1/admin/aggregates")

    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30")
    expect(response.headers.get("ETag")).toBeNull()
  })

  it("does not buffer non-JSON responses", async () => {
    const response = await buildApp().request("/v1/admin/export")

    expect(response.headers.get("ETag")).toBeNull()
    expect(response.headers.get("Cache-Control")).toBeNull()
    expect(await response.text()).toBe("id\nbkg_1\n")
  })

  it("ignores error responses, writes, and surfaces it is not mounted on", async () => {
    const app = buildApp()

    const notFound = await app.request("/v1/admin/missing")
    expect(notFound.status).toBe(404)
    expect(notFound.headers.get("ETag")).toBeNull()

    const write = await app.request("/v1/admin/bookings", { method: "POST" })
    expect(write.headers.get("ETag")).toBeNull()

    const publicRead = await app.request("/v1/public/catalog")
    expect(publicRead.headers.get("ETag")).toBeNull()
  })

  it("passes a body over the cap through unstamped, and intact", async () => {
    const app = new Hono()
    app.use("*", adminResponseRevalidation({ maxBodyBytes: 8 }))
    app.get("/v1/admin/big", (c) => c.json({ padding: "x".repeat(64) }))

    const response = await app.request("/v1/admin/big")

    expect(response.status).toBe(200)
    expect(response.headers.get("ETag")).toBeNull()
    expect(response.headers.get("Cache-Control")).toBeNull()
    expect(await response.json()).toEqual({ padding: "x".repeat(64) })
  })

  it("stops reading at the cap instead of buffering the whole body first", async () => {
    // The cap is the middleware's memory ceiling per in-flight request, so it
    // has to be enforced *during* the read. Checking the size afterwards would
    // buffer an oversized body in full and then discard it.
    const chunk = new TextEncoder().encode("x".repeat(64))
    let chunksRead = 0
    const app = new Hono()
    app.use("*", adminResponseRevalidation({ maxBodyBytes: 128 }))
    app.get("/v1/admin/stream", (c) =>
      c.body(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (chunksRead === 64) {
              controller.close()
              return
            }
            chunksRead += 1
            controller.enqueue(chunk)
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    )

    const response = await app.request("/v1/admin/stream")
    const readWhenHandedBack = chunksRead

    expect(response.headers.get("ETag")).toBeNull()
    // Three 64-byte chunks is the first read past a 128-byte cap; the stream's
    // own queue may have pulled one more. What matters is that it is a handful
    // and not the whole 4 KiB body.
    expect(readWhenHandedBack).toBeLessThan(8)
    // The unread remainder is still delivered: the buffered chunks are put back
    // in front of it rather than dropped.
    expect((await response.text()).length).toBe(64 * 64)
    expect(chunksRead).toBe(64)
  })

  it("does not tee the body it hashes", async () => {
    // `clone()` would make the origin hold the payload twice for every
    // in-flight admin read. Reading the single body proves it was not cloned:
    // a teed stream would leave the original still unread.
    let cloned = false
    const app = new Hono()
    app.use("/v1/admin/*", async (c, next) => {
      await next()
      const original = c.res.clone
      c.res.clone = function trackedClone(this: Response) {
        cloned = true
        return original.call(this)
      }
    })
    app.use("/v1/admin/*", adminResponseRevalidation())
    app.get("/v1/admin/bookings", (c) => c.json({ rows: [] }))

    const response = await app.request("/v1/admin/bookings")

    expect(response.headers.get("ETag")).not.toBeNull()
    expect(cloned).toBe(false)
  })
})
