import assert from "node:assert/strict"
import test from "node:test"

import {
  checkAgainstBaseline,
  countReachIns,
  improvements,
} from "../checks/schema/table-privacy.ts"

const ownership = {
  owners: new Map([
    ["bookings", "bookings"],
    ["bookingItems", "bookings"],
    ["bookingsRef", "finance"],
    ["users", "db"],
  ]),
}

test("a reach-in into another domain is counted", () => {
  const counts = countReachIns([{ importer: "finance", names: ["bookings"] }], ownership)
  assert.equal(counts.get("finance->bookings"), 1)
})

test("a package importing its own table is not a reach-in", () => {
  assert.equal(countReachIns([{ importer: "bookings", names: ["bookings"] }], ownership).size, 0)
})

test("Foundation packages are exempt", () => {
  // db, core, utils, types and schema-kit sit below the domain layer.
  assert.equal(countReachIns([{ importer: "auth", names: ["users"] }], ownership).size, 0)
})

test("a *Ref mirror is not a reach-in — that is the sanctioned route", () => {
  assert.equal(countReachIns([{ importer: "finance", names: ["bookingsRef"] }], ownership).size, 0)
})

test("a pair growing beyond its baseline fails", () => {
  const counts = new Map([["finance->bookings", 31]])
  assert.match(checkAgainstBaseline(counts, { "finance->bookings": 30 })[0], /baseline allows 30/)
})

test("a brand new pair always fails", () => {
  const counts = new Map([["legal->finance", 1]])
  assert.match(checkAgainstBaseline(counts, {})[0], /no baseline/)
})

test("a pair at or below its baseline passes", () => {
  assert.deepEqual(
    checkAgainstBaseline(new Map([["finance->bookings", 29]]), { "finance->bookings": 30 }),
    [],
  )
})

test("an improved pair is reported so the baseline can be tightened", () => {
  const better = improvements(new Map([["finance->bookings", 29]]), { "finance->bookings": 30 })
  assert.match(better[0], /now 29, baseline still 30/)
})
