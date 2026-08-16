import { describe, expect, it } from "vitest"

import { cruisesUiEn } from "../i18n/en.js"
import type { ShipRecord } from "../schemas.js"
import { shipCoverImage, shipSpecs, shipSummary } from "./ship-presentation.js"

const messages = cruisesUiEn.shipsAdmin

/** A ship row with every column empty — the shape a sparse sourced vessel has. */
const bareShip: ShipRecord = {
  id: "cruise_ships_01",
  lineSupplierId: null,
  name: "MS Test",
  slug: "ms-test",
  shipType: "ocean",
  capacityGuests: null,
  capacityCrew: null,
  cabinCount: null,
  deckCount: null,
  lengthMeters: null,
  cruisingSpeedKnots: null,
  yearBuilt: null,
  yearRefurbished: null,
  imo: null,
  description: null,
  deckPlanUrl: null,
  gallery: null,
  amenities: null,
  externalRefs: null,
  isActive: true,
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
}

const ship = (overrides: Partial<ShipRecord> = {}): ShipRecord => ({ ...bareShip, ...overrides })

describe("ship specifications", () => {
  it("prints only the specs the record actually carries", () => {
    const specs = shipSpecs(ship({ capacityGuests: 2600, deckCount: 14 }), messages.specLabels)
    expect(specs.map((s) => s.key)).toEqual(["guests", "decks"])
    expect(specs.map((s) => s.value)).toEqual(["2600", "14"])
  })

  it("prints nothing at all for a row with no specifications", () => {
    // A sparse sourced vessel would otherwise render a grid of em dashes and
    // bury the two facts that did come through.
    expect(shipSpecs(bareShip, messages.specLabels)).toEqual([])
  })

  it("treats a zero capacity as an unfilled column, not a capacity", () => {
    expect(shipSpecs(ship({ capacityGuests: 0 }), messages.specLabels)).toEqual([])
  })

  it("drops the numeric column's trailing zeros without touching real digits", () => {
    const specs = shipSpecs(
      ship({ lengthMeters: "294.00", cruisingSpeedKnots: "21.50" }),
      messages.specLabels,
    )
    expect(specs.map((s) => s.value)).toEqual(["294 m", "21.5 kn"])
  })

  it("keeps an IMO, which is the one spec that is not a measurement", () => {
    const specs = shipSpecs(ship({ imo: "9714710" }), messages.specLabels)
    expect(specs).toEqual([{ key: "imo", label: messages.specLabels.imo, value: "9714710" }])
  })
})

describe("ship summary line", () => {
  const summaryMessages = {
    types: messages.types,
    guestsShort: messages.guestsShort,
    decksShort: messages.decksShort,
  }

  it("leads with the vessel type and adds only what is known", () => {
    expect(shipSummary(ship({ shipType: "river", capacityGuests: 180 }), summaryMessages)).toBe(
      "River · 180 guests",
    )
  })

  it("falls back to the raw code for a type with no label", () => {
    const unknown = ship({ shipType: "submarine" as ShipRecord["shipType"] })
    expect(shipSummary(unknown, summaryMessages)).toBe("submarine")
  })
})

describe("ship cover image", () => {
  it("takes the first usable gallery entry", () => {
    expect(shipCoverImage(ship({ gallery: ["  ", "https://img/a.jpg"] }))).toBe("https://img/a.jpg")
  })

  it("reports none for an empty or absent gallery", () => {
    expect(shipCoverImage(ship({ gallery: [] }))).toBeNull()
    expect(shipCoverImage(bareShip)).toBeNull()
  })
})
