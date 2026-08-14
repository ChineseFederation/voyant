import assert from "node:assert/strict"
import test from "node:test"

import { keyKindForPath, resolveMountPath } from "../lib/openapi-key-kind.mjs"

/**
 * The derivation the generator writes and the checker enforces. These pin the
 * decisions that are easy to get subtly wrong and impossible to notice: silence
 * meaning "secret", guarded intake beating a broader publishable prefix, and a
 * root-mounted module not swallowing the whole public surface.
 */

const bundle = (overrides) => ({
  surface: "public",
  mount: "/v1/public/catalog",
  ...overrides,
})

test("an undeclared path is secret — silence is a denial, not an omission", () => {
  assert.equal(keyKindForPath([bundle({})], "/v1/public/catalog/search"), "secret")
  assert.equal(keyKindForPath([], "/v1/public/anything"), "secret")
})

test("`publishable: true` covers the mount and everything under it", () => {
  const bundles = [bundle({ publishable: true })]
  assert.equal(keyKindForPath(bundles, "/v1/public/catalog"), "publishable")
  assert.equal(keyKindForPath(bundles, "/v1/public/catalog/search"), "publishable")
})

test("a sibling mount with a shared prefix is not covered", () => {
  const bundles = [bundle({ publishable: true })]
  assert.equal(keyKindForPath(bundles, "/v1/public/catalogue/search"), "secret")
})

test("a path list opens only the named sub-paths", () => {
  const bundles = [bundle({ publishable: ["/search", "slots"] })]
  assert.equal(keyKindForPath(bundles, "/v1/public/catalog/search"), "publishable")
  assert.equal(keyKindForPath(bundles, "/v1/public/catalog/slots/today"), "publishable")
  assert.equal(keyKindForPath(bundles, "/v1/public/catalog/booking-sessions"), "secret")
})

test("guarded intake wins over a broader publishable declaration", () => {
  // The storefront root mounts at /v1/public and declares both. If ordering
  // were the other way round, /leads would inherit the mount's publishable
  // reach and the intake guard would never be consulted.
  const bundles = [bundle({ mount: "/v1/public", publishable: true, guardedIntake: ["/leads"] })]
  assert.equal(keyKindForPath(bundles, "/v1/public/departures"), "publishable")
  assert.equal(keyKindForPath(bundles, "/v1/public/leads"), "secret")
})

test("guarded intake declared on one bundle beats a publishable mount on another", () => {
  const bundles = [
    bundle({ mount: "/v1/public/bookings", publishable: true }),
    bundle({ mount: "/v1/public/bookings", guardedIntake: ["/inquiries"] }),
  ]
  assert.equal(keyKindForPath(bundles, "/v1/public/bookings/overview"), "publishable")
  assert.equal(keyKindForPath(bundles, "/v1/public/bookings/inquiries"), "secret")
})

test("an admin bundle cannot make a path publishable", () => {
  const bundles = [bundle({ surface: "admin", mount: "/v1/admin/catalog", publishable: true })]
  assert.equal(keyKindForPath(bundles, "/v1/admin/catalog/products"), "secret")
})

test("mounts resolve the way the runtime resolves them", () => {
  assert.equal(
    resolveMountPath({ id: "@x/y", localId: "storefront" }, { surface: "public", mount: "/" }),
    "/v1/public",
  )
  assert.equal(
    resolveMountPath({ id: "@x/y", localId: "storefront" }, { surface: "public" }),
    "/v1/public/storefront",
  )
  assert.equal(
    resolveMountPath({ id: "@x/y#extra" }, { surface: "admin", mount: "catalog" }),
    "/v1/admin/catalog",
  )
  assert.equal(
    resolveMountPath({ id: "@x/y" }, { surface: "public", mount: "/v1/public/custom" }),
    "/v1/public/custom",
  )
})
