import assert from "node:assert/strict"
import test from "node:test"

import {
  checkAgainstBaseline,
  checkWritesAgainstBaseline,
  countReachIns,
  countWriteReachIns,
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

// ---- cross-module writes ----------------------------------------------------
//
// A write is a strictly worse reach-in than a read: a *Ref mirror is read-only
// by construction, so the mirror answer is unavailable, and the write bypasses
// whatever the owner does on its own writes. These assert it is measured apart.

test("a write into another module's table is counted", () => {
  const counts = countWriteReachIns([{ importer: "finance", names: ["bookings"] }], ownership)
  assert.equal(counts.get("finance->bookings"), 1)
})

test("a module writing its own table is not a reach-in", () => {
  assert.equal(
    countWriteReachIns([{ importer: "bookings", names: ["bookings"] }], ownership).size,
    0,
  )
})

test("writing a local *Ref mirror is not a reach-in", () => {
  // The mirror IS the sanctioned escape hatch for reads; it must not be counted
  // as a write reach-in just because it appears in a mutating position.
  assert.equal(
    countWriteReachIns([{ importer: "finance", names: ["bookingsRef"] }], ownership).size,
    0,
  )
})

test("a foundation table is exempt", () => {
  assert.equal(countWriteReachIns([{ importer: "finance", names: ["users"] }], ownership).size, 0)
})

test("a write pair with no baseline fails, and names the remedy", () => {
  const counts = countWriteReachIns([{ importer: "legal", names: ["bookings"] }], ownership)
  const violations = checkWritesAgainstBaseline(counts, {})
  assert.equal(violations.length, 1)
  assert.match(violations[0], /may not mutate/)
  // The remedy differs from a read's, so the message must not offer a mirror.
  assert.match(violations[0], /mirror is read-only and is not an option/)
})

test("a write pair that grew fails", () => {
  const counts = countWriteReachIns(
    [{ importer: "finance", names: ["bookings", "bookingItems"] }],
    ownership,
  )
  assert.equal(checkWritesAgainstBaseline(counts, { "finance->bookings": 1 }).length, 1)
})

test("a write pair at or below its baseline passes", () => {
  const counts = countWriteReachIns([{ importer: "finance", names: ["bookings"] }], ownership)
  assert.deepEqual(checkWritesAgainstBaseline(counts, { "finance->bookings": 2 }), [])
})
