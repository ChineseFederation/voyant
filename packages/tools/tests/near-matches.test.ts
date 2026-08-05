/**
 * voyant#3950: near-match suggestions for an unregistered tool name.
 *
 * The behaviour worth pinning is not "finds close names" but the two judgement
 * calls around it — that an ambiguous nearest match does NOT become a confident
 * `didYouMean`, and that a name with nothing close returns nothing rather than
 * the whole registry.
 */
import { describe, expect, it } from "vitest"

import { boundedEditDistance, findNearMatches } from "../src/near-matches.js"

describe("boundedEditDistance", () => {
  it("counts a transposition as one edit", () => {
    // The mistakes this exists to catch are typing mistakes, and treating a
    // swap as two edits pushes the name it should have found out of tolerance.
    expect(boundedEditDistance("get_bokoing", "get_booking", 3)).toBe(1)
  })

  it("stops early instead of computing a distance it will not use", () => {
    // The contract is only "greater than max", not the true distance.
    expect(boundedEditDistance("aaaaaaaa", "zzzzzzzz", 2)).toBeGreaterThan(2)
  })

  it("is zero for an exact match", () => {
    expect(boundedEditDistance("list_bookings", "list_bookings", 3)).toBe(0)
  })
})

describe("findNearMatches", () => {
  const KNOWN = ["list_bookings", "get_booking", "create_booking", "list_products", "get_product"]

  it("suggests the intended name for a typo", () => {
    const { candidates, didYouMean } = findNearMatches("get_bokoing", KNOWN)
    expect(didYouMean).toBe("get_booking")
    expect(candidates).toContain("get_booking")
  })

  it("withholds didYouMean when two names are equally close", () => {
    // "get_bookings" is one edit from `get_booking` (drop the s) and one from
    // `list_bookings` is not — construct a genuine tie instead.
    const tie = findNearMatches("xat", ["cat", "bat"])
    expect(tie.didYouMean).toBeUndefined()
    // Both still offered — the agent picks, rather than being sent confidently
    // to whichever happened to sort first.
    expect(tie.candidates).toEqual(["bat", "cat"])
  })

  it("returns nothing when no name is close", () => {
    // The failure mode being replaced: dumping every registered name into the
    // error. Nothing close must mean nothing returned, not everything returned.
    expect(findNearMatches("completely_unrelated_zzz", KNOWN)).toEqual({ candidates: [] })
  })

  it("caps how many candidates it offers", () => {
    const many = Array.from({ length: 40 }, (_, i) => `get_thing${i}`)
    expect(findNearMatches("get_thing", many, 5).candidates).toHaveLength(5)
  })

  it("never suggests the name that was asked for", () => {
    expect(findNearMatches("get_booking", KNOWN).candidates).not.toContain("get_booking")
  })
})
