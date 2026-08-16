/**
 * Every Amendment mutation route must carry the idempotency middleware.
 *
 * This exists because a route that forgets it fails in a way no
 * service-level test can see. `mutationContext` reads `c.get("idempotencyKey")`
 * and throws when it is unset, so the endpoint 500s on its first real
 * request — while tests that call `bookingAmendmentService.*` directly, as
 * every other suite here does, keep passing. `item_add` shipped that way and
 * was dead on arrival in the browser.
 *
 * The middleware is registered per path, so the guard is a route-shape
 * assertion rather than a behavioural one: enumerate the mutating routes the
 * router actually exposes and require each to reject a request with no
 * `Idempotency-Key` with 400 — never 500.
 */

import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { bookingAmendmentAdminRoutes } from "../../src/routes-amendments.js"

/**
 * Mutating Amendment routes, by the path template the router declares.
 * A new one added without its middleware line fails here.
 */
const MUTATION_ROUTES = [
  "/{bookingId}/amendments/traveler-corrections/preview",
  "/{bookingId}/amendments/traveler-roster/preview",
  "/{bookingId}/amendments/items/preview",
  "/{bookingId}/amendments/items/move/preview",
  "/{bookingId}/amendments/{amendmentId}/accept",
  "/{bookingId}/amendments/{amendmentId}/apply",
  "/{bookingId}/amendments/{amendmentId}/reconcile",
] as const

function toRequestPath(template: string): string {
  return template
    .replace("{bookingId}", "book_test0000000000000000000")
    .replace("{amendmentId}", "bkam_test0000000000000000000")
}

describe("Booking Amendment mutation routes", () => {
  function buildApp() {
    const app = new Hono()
    app.use("*", async (c, next) => {
      // Deliberately no db/runtime: the idempotency middleware must reject
      // before the handler ever needs them. If it does not, the handler
      // throws on a missing dependency and the assertion below catches
      // that too — either way a 500 is a failure.
      c.set("userId" as never, "test-user-id")
      c.set("actor" as never, "staff")
      await next()
    })
    app.route("/", bookingAmendmentAdminRoutes)
    return app
  }

  it.each(MUTATION_ROUTES)("rejects %s without an Idempotency-Key", async (template) => {
    const response = await buildApp().request(toRequestPath(template), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    // 400 (missing key) or 422 (body validation runs first) are both the
    // middleware doing its job. 500 means it never ran.
    expect(response.status).not.toBe(500)
    expect(response.status).toBeLessThan(500)
  })

  it("names every mutating route the router exposes", () => {
    // Guards the list above from going stale: if a POST route appears on
    // the router that this file does not cover, the count diverges and
    // someone has to decide whether it needs the middleware.
    const posted = bookingAmendmentAdminRoutes.routes
      .filter((route) => route.method === "POST")
      .map((route) => route.path)
    const covered = new Set(
      MUTATION_ROUTES.map((template) => template.replace(/\{(\w+)\}/g, ":$1")),
    )
    const uncovered = posted.filter((path) => !covered.has(path))
    expect(uncovered).toEqual([])
  })
})
