import assert from "node:assert/strict"
import test from "node:test"

import { checkDescriptions } from "../checks/manifests/descriptions.ts"

const described = { name: "@x/described", description: "Does a thing." }
const blank = { name: "@x/blank" }
const whitespace = { name: "@x/whitespace", description: "   " }
const privatePkg = { name: "@x/private", private: true }

test("a described package passes", () => {
  assert.deepEqual(checkDescriptions([described], []).violations, [])
})

test("a new package without a description fails", () => {
  const { violations } = checkDescriptions([blank], [])
  assert.equal(violations.length, 1)
  assert.match(violations[0], /@x\/blank: published packages need a description/)
})

test("a whitespace-only description does not count", () => {
  assert.equal(checkDescriptions([whitespace], []).violations.length, 1)
})

test("private packages are exempt", () => {
  const { violations, checked } = checkDescriptions([privatePkg], [])
  assert.deepEqual(violations, [])
  assert.equal(checked, 0)
})

test("an allowlisted package is tolerated", () => {
  assert.deepEqual(checkDescriptions([blank], ["@x/blank"]).violations, [])
})

test("an allowlisted package that gained a description is reported for removal", () => {
  const { violations, fixed } = checkDescriptions([described], ["@x/described"])
  assert.deepEqual(violations, [])
  assert.deepEqual(fixed, ["@x/described"])
})

test("an allowlist entry for a package that no longer exists fails", () => {
  // Otherwise a deleted package leaves a permanent entry and the list stops
  // being a truthful count of what is outstanding.
  const { violations } = checkDescriptions([described], ["@x/deleted"])
  assert.match(violations[0], /no longer exists/)
})
