import { describe, expect, it } from "vitest"

import { catalogUiEn } from "../i18n/en.js"
import { makeCruiseCard, makeProductCard } from "./catalog-page-cards.js"

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
      nextDepartureAt: "2026-09-25T21:00:00Z",
      departureTimezone: "Europe/Bucharest",
    })
    expect(note).toContain("26")
  })

  it("falls back to UTC for an instant when the document declares no zone", () => {
    const note = card.footerNote?.({ nextDepartureAt: "2026-09-25T21:00:00Z" })
    expect(note).toContain("25")
  })

  it("prefers the instant over the calendar date when the document carries both", () => {
    // A real product document carries both frames. The instant is the one with
    // a time of day, so it wins.
    const note = card.footerNote?.({
      nextDepartureAt: "2026-09-25T21:00:00Z",
      nextDepartureDate: "2026-09-26",
      departureTimezone: "Europe/Bucharest",
    })
    expect(note).toMatch(/00:00|\d{2}:\d{2}/)
  })

  it("never reads a time out of the bare-date field, whatever it contains", () => {
    // `…Date` is bare in every document by convention (#4116). Treating an
    // instant-shaped value there as an instant is what let the hour and the
    // tooltip pass their tests while doing nothing in production.
    const note = card.footerNote?.({ nextDepartureDate: "2026-09-25T21:00:00Z" })
    expect(note).not.toMatch(/\d{2}:\d{2}/)
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

  it("shows the time of day for an instant, which is what distinguishes it", () => {
    const note = card.footerNote?.({
      nextDepartureAt: "2026-09-25T09:30:00Z",
      departureTimezone: "UTC",
    })
    expect(note).toMatch(/09:30/)
  })

  it("shows no time of day for a bare date, which has no clock reading", () => {
    const note = card.footerNote?.({ nextDepartureDate: "2026-09-26" })
    expect(note).not.toMatch(/\d{2}:\d{2}/)
  })
})

/**
 * The noun for a schedule entry is resolved once upstream (`scheduleTerm` on
 * the catalog document) so every surface agrees. Calling a timed Activity's
 * slots "departures" is the specific thing this guards against.
 */
describe("product card schedule term", () => {
  const noteFor = (scheduleTerm: string | undefined, count: number) =>
    card.footerNote?.({
      availableDeparturesCount: count,
      ...(scheduleTerm ? { scheduleTerm } : {}),
    })

  it("names each term with its own noun", () => {
    expect(noteFor("departure", 6)).toBe("6 departures")
    expect(noteFor("session", 6)).toBe("6 sessions")
    expect(noteFor("occurrence", 6)).toBe("6 dates")
  })

  it("singularizes each term", () => {
    expect(noteFor("departure", 1)).toBe("1 departure")
    expect(noteFor("session", 1)).toBe("1 session")
    expect(noteFor("occurrence", 1)).toBe("1 date")
  })

  it("falls back to departures for a document with no term or an unknown one", () => {
    expect(noteFor(undefined, 2)).toBe("2 departures")
    expect(noteFor("sailing", 2)).toBe("2 departures")
  })
})

describe("product card duration", () => {
  it("omits the nights on a single-day product rather than showing 0n", () => {
    expect(card.meta?.({ durationDays: 1 })).toBe("1d")
  })

  it("spans days and nights once there is an overnight", () => {
    expect(card.meta?.({ durationDays: 3 })).toBe("3d / 2n")
  })
})

/**
 * A timed departure has a wall clock in two places at once, and the card has
 * room for one. The other lives in the hover.
 */
describe("product card departure tooltip", () => {
  const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  it("gives both frames for an instant in a zone other than the reader's", () => {
    const away = viewerZone === "Pacific/Auckland" ? "America/Denver" : "Pacific/Auckland"
    const tooltip = card.footerNoteTooltip?.({
      nextDepartureAt: "2026-09-25T09:30:00Z",
      departureTimezone: away,
    })
    const lines = tooltip?.split("\n") ?? []
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain(away)
    expect(lines[1]).toContain(viewerZone)
  })

  it("offers nothing for a bare date, which has no time to convert", () => {
    expect(
      card.footerNoteTooltip?.({
        nextDepartureDate: "2026-09-26",
        departureTimezone: "Pacific/Auckland",
      }),
    ).toBeNull()
  })

  it("offers nothing when the reader is already in the departure's zone", () => {
    expect(
      card.footerNoteTooltip?.({
        nextDepartureAt: "2026-09-25T09:30:00Z",
        departureTimezone: viewerZone,
      }),
    ).toBeNull()
  })
})

/**
 * Cruises project `earliestDepartureCached` as a `date` column — a bare
 * calendar day with no clock reading. A sailing date has no "their time vs
 * your time" to disambiguate, so the card must not offer one.
 */
describe("cruise card departures", () => {
  const cruise = makeCruiseCard((id) => String(id), messages, "en-GB")

  it("declares no tooltip, because a sailing date carries no time", () => {
    expect(cruise.footerNoteTooltip).toBeUndefined()
  })

  it("renders the sailing date without inventing a time of day", () => {
    const note = cruise.footerNote?.({
      earliestDepartureCached: "2027-03-14",
      departureCount: 4,
    })
    expect(note).not.toMatch(/\d{2}:\d{2}/)
    expect(note).toContain("4 departures")
  })
})
