import type { AncillaryOfferGroupV1 } from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import { describe, expect, it, vi } from "vitest"
import {
  ancillaryQuoteRequestFromSelection,
  enrichRequirementsWithAncillaries,
  withAncillaryOffers,
} from "./ancillary-enrichment.js"
import type { BookingRequirementsV1 } from "./contracts.js"

const SELECTION = {
  configure: { dateRange: { checkIn: "2026-09-10", checkOut: "2026-09-20" } },
  travelers: [
    { rowId: "t1", band: "adult", dateOfBirth: "1990-05-01" },
    { rowId: "t2", band: "child" },
  ],
}

function request(overrides: Record<string, unknown> = {}) {
  return ancillaryQuoteRequestFromSelection({
    bookingSessionId: "sess-1",
    selection: SELECTION,
    currency: "EUR",
    now: new Date("2026-08-16T00:00:00Z"),
    ...overrides,
  })
}

const REQUIREMENTS = {
  showsAncillaries: false,
  paymentIntents: ["card"],
} as unknown as BookingRequirementsV1

function group(): AncillaryOfferGroupV1 {
  return { kind: "insurance", label: "Travel insurance", offers: [], diagnostics: [] }
}

describe("quote request derivation", () => {
  it("carries ages and dates and nothing that identifies anyone", () => {
    const derived = request()
    expect(derived).not.toBeNull()
    expect(Object.keys(derived ?? {}).sort()).toEqual([
      "bookingSessionId",
      "currency",
      "destinationCountries",
      "travelers",
      "tripEndDate",
      "tripStartDate",
    ])
    expect(Object.keys(derived?.travelers[0] ?? {}).sort()).toEqual(["age", "band", "ref"])
  })

  it("computes an age from the date of birth as at the trip start", () => {
    expect(request()?.travelers[0]?.age).toBe(36)
  })

  it("falls back to a band age when a traveller has given no date of birth", () => {
    expect(request()?.travelers[1]?.age).toBe(8)
  })

  it("declines to build a request when the trip window is unknown", () => {
    expect(request({ selection: { travelers: SELECTION.travelers } })).toBeNull()
  })

  it("declines to build a request when there is no currency to quote in", () => {
    expect(request({ currency: undefined })).toBeNull()
  })

  it("declines to build a request when no traveller can be aged", () => {
    expect(
      request({ selection: { configure: SELECTION.configure, travelers: [{ rowId: "t1" }] } }),
    ).toBeNull()
  })
})

describe("folding offers into the descriptor", () => {
  it("leaves the descriptor untouched when nothing is connected", () => {
    expect(withAncillaryOffers(REQUIREMENTS, [])).toBe(REQUIREMENTS)
  })

  it("shows the step for a connected source that happens to have no offers", () => {
    const enriched = withAncillaryOffers(REQUIREMENTS, [group()])
    expect(enriched.showsAncillaries).toBe(true)
    expect(enriched.ancillaries?.groups).toHaveLength(1)
  })
})

describe("enrichment", () => {
  it("does nothing when no resolver is wired", async () => {
    const enriched = await enrichRequirementsWithAncillaries({
      requirements: REQUIREMENTS,
      request: request(),
      resolve: undefined,
    })
    expect(enriched.showsAncillaries).toBe(false)
  })

  it("does not ask when the selection cannot support a request", async () => {
    const resolve = vi.fn()
    await enrichRequirementsWithAncillaries({
      requirements: REQUIREMENTS,
      request: null,
      resolve,
    })
    expect(resolve).not.toHaveBeenCalled()
  })

  it("degrades to no offers when the resolver itself fails", async () => {
    const onError = vi.fn()
    const enriched = await enrichRequirementsWithAncillaries({
      requirements: REQUIREMENTS,
      request: request(),
      resolve: async () => {
        throw new Error("provider fan-out exploded")
      },
      onError,
    })
    expect(enriched.showsAncillaries).toBe(false)
    expect(onError).toHaveBeenCalledOnce()
  })

  it("folds in what the resolver returned", async () => {
    const enriched = await enrichRequirementsWithAncillaries({
      requirements: REQUIREMENTS,
      request: request(),
      resolve: async () => [group()],
    })
    expect(enriched.showsAncillaries).toBe(true)
  })
})
