import { describe, expect, it } from "vitest"

import { catalogUiEn } from "../i18n/en.js"
import { makeProductCard } from "./catalog-page-cards.js"

const messages = catalogUiEn.catalogPage
const card = makeProductCard((id) => String(id), messages, "en-GB")

/**
 * Catalog documents carry departures in two frames (#4116): bare local
 * calendar dates and ISO instants. The card must render whichever it gets
 * on the calendar day the document meant, not the viewer's.
 */
describe("product card departure note", () => {
  it("renders a bare local date on its own calendar day, whatever the viewer's zone", () => {
    // 2026-09-26 in Bucharest. `new Date("2026-09-26")` is UTC midnight, so
    // formatting in a viewer zone west of UTC used to render "25".
    const note = card.footerNote?.({
      nextDepartureDate: "2026-09-26",
      departureTimezone: "Europe/Bucharest",
    })
    expect(note).toContain("26")
    expect(note).not.toContain("25")
  })

  it("renders an instant in the departure's declared zone, not UTC", () => {
    // 21:00Z on the 25th is already the 26th in Bucharest.
    const note = card.footerNote?.({
      nextDepartureDate: "2026-09-25T21:00:00Z",
      departureTimezone: "Europe/Bucharest",
    })
    expect(note).toContain("26")
  })

  it("falls back to UTC for an instant when the document declares no zone", () => {
    const note = card.footerNote?.({ nextDepartureDate: "2026-09-25T21:00:00Z" })
    expect(note).toContain("25")
  })

  it("still renders when the document carries an unusable zone", () => {
    const note = card.footerNote?.({
      nextDepartureDate: "2026-09-26",
      departureTimezone: "Not/AZone",
    })
    expect(note).toContain("26")
  })

  it("keeps the departure count alongside the date", () => {
    const note = card.footerNote?.({
      nextDepartureDate: "2026-09-26",
      departureTimezone: "Europe/Bucharest",
      availableDeparturesCount: 3,
    })
    expect(note).toContain("3 departures")
  })
})
