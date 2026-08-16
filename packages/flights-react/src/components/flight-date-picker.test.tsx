// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { FareCalendarDay } from "@voyant-travel/flights/contract/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { VoyantFlightsProvider } from "../provider.js"
import { FlightDatePicker } from "./flight-date-picker.js"

/**
 * Pinned "today". The picker's whole job is relative to now — what's in the
 * past, which month opens, which window it quotes — so the clock is an input,
 * not ambient state.
 */
const TODAY = new Date(2026, 7, 16) // 2026-08-16, local

function priced(date: string, amount: string): FareCalendarDay {
  return { date, available: true, cheapestPrice: { amount, currency: "EUR" } }
}

function soldOut(date: string): FareCalendarDay {
  return { date, available: false }
}

/** A spread wide enough to band: cheapest, middle, dearest, and one sold out. */
const AUGUST_DAYS: FareCalendarDay[] = [
  priced("2026-08-17", "89.00"),
  priced("2026-08-18", "140.00"),
  priced("2026-08-19", "260.00"),
  soldOut("2026-08-20"),
  priced("2026-08-21", "95.00"),
  priced("2026-08-22", "180.00"),
  priced("2026-08-23", "410.00"),
]

function fetcherFor(days: FareCalendarDay[], status = 200) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (!url.includes("/flights/fare-calendar")) return Response.json({})
    if (status !== 200) {
      return Response.json({ error: "nope" }, { status })
    }
    return Response.json({ days })
  })
}

function renderPicker({
  fetcher,
  origin = "LHR",
  destination = "JFK",
  onChange = vi.fn(),
  minDate,
  disabled,
}: {
  fetcher: (url: string, init?: RequestInit) => Promise<Response>
  origin?: string | null
  destination?: string | null
  onChange?: (next: string | null) => void
  minDate?: string | null
  disabled?: boolean
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <VoyantFlightsProvider baseUrl="/api" fetcher={fetcher}>
        <FlightDatePicker
          value={null}
          onChange={onChange}
          origin={origin}
          destination={destination}
          passengers={{ adults: 1 }}
          cabin="economy"
          minDate={minDate}
          disabled={disabled}
          placeholder="Depart"
        />
      </VoyantFlightsProvider>
    </QueryClientProvider>,
  )
}

function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: "Depart" }))
}

/**
 * The day button for a given day-of-month in the open grid. react-day-picker
 * labels days in ordinal form ("Monday, August 17th, 2026"), so the match has
 * to allow the suffix or it silently finds nothing and every assertion on the
 * result passes vacuously.
 */
function dayButton(dayOfMonth: number, month = "August") {
  const label = new RegExp(`${month} ${dayOfMonth}(st|nd|rd|th), `)
  const found = screen
    .getAllByRole("button")
    .find((button) => label.test(button.getAttribute("aria-label") ?? ""))
  if (!found) throw new Error(`No day button for ${month} ${dayOfMonth}`)
  return found
}

/** Band classes are applied to the day cell, which styles the price inside it. */
function bandingOf(priceText: string) {
  return screen.getByText(priceText).closest("td")?.className ?? ""
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe("FlightDatePicker", () => {
  it("quotes the visible month plus the next, starting no earlier than today", async () => {
    const fetcher = fetcherFor(AUGUST_DAYS)
    renderPicker({ fetcher })

    await waitFor(() => expect(fetcher).toHaveBeenCalled())

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({
      origin: "LHR",
      destination: "JFK",
      from: "2026-08-16",
      to: "2026-09-30",
    })
  })

  it("shows the cheapest price on each quoted day", async () => {
    renderPicker({ fetcher: fetcherFor(AUGUST_DAYS) })
    openPicker()

    expect(await screen.findByText("€89")).toBeInstanceOf(HTMLElement)
    expect(screen.getByText("€260")).toBeInstanceOf(HTMLElement)
  })

  // The complaint that started this: a calendar that looks identical on every
  // day tells you nothing about where the flights are.
  it("bands prices so cheap and expensive days do not look alike", async () => {
    renderPicker({ fetcher: fetcherFor(AUGUST_DAYS) })
    openPicker()
    await screen.findByText("€89")

    expect(bandingOf("€89")).toContain("emerald")
    expect(bandingOf("€410")).toContain("rose")
    expect(bandingOf("€89")).not.toEqual(bandingOf("€410"))
  })

  it("makes a sold-out day unselectable", async () => {
    const onChange = vi.fn()
    renderPicker({ fetcher: fetcherFor(AUGUST_DAYS), onChange })
    openPicker()
    await screen.findByText("€89")

    const soldOut = dayButton(20)
    expect(soldOut.hasAttribute("disabled")).toBe(true)

    fireEvent.click(soldOut)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("keeps a day the provider never quoted selectable", async () => {
    const onChange = vi.fn()
    // 2026-08-25 is absent from the response entirely — unknown, not sold out.
    renderPicker({ fetcher: fetcherFor(AUGUST_DAYS), onChange })
    openPicker()
    await screen.findByText("€89")

    const unquoted = dayButton(25)
    expect(unquoted.hasAttribute("disabled")).toBe(false)

    fireEvent.click(unquoted)
    expect(onChange).toHaveBeenCalledWith("2026-08-25")
  })

  // A long-haul business quote is five digits and will not fit in a day cell.
  it("compacts a fare too long to fit in a cell", async () => {
    renderPicker({
      fetcher: fetcherFor([
        priced("2026-08-17", "89.00"),
        priced("2026-08-18", "12450.00"),
        priced("2026-08-19", "260.00"),
      ]),
    })
    openPicker()

    expect(await screen.findByText("€12.5K")).toBeInstanceOf(HTMLElement)
    // ...while an ordinary fare stays exact.
    expect(screen.getByText("€89")).toBeInstanceOf(HTMLElement)
  })

  it("stays dormant until the route is known", () => {
    const fetcher = fetcherFor(AUGUST_DAYS)
    renderPicker({ fetcher, destination: null })

    expect(fetcher).not.toHaveBeenCalled()
  })

  // The return leg of a one-way trip: no date there is selectable, so quoting
  // one spends a supplier call on nothing.
  it("stays dormant while disabled", () => {
    const fetcher = fetcherFor(AUGUST_DAYS)
    renderPicker({ fetcher, disabled: true })

    expect(fetcher).not.toHaveBeenCalled()
  })

  // A connector without the capability is the common case, not a failure.
  it("still offers a working calendar when the connector cannot quote", async () => {
    const onChange = vi.fn()
    const fetcher = fetcherFor([], 501)
    renderPicker({ fetcher, onChange })

    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    openPicker()

    const anyDay = dayButton(25)
    expect(anyDay.hasAttribute("disabled")).toBe(false)

    fireEvent.click(anyDay)
    expect(onChange).toHaveBeenCalledWith("2026-08-25")
  })

  it("never offers a date before the outbound it returns from", async () => {
    const fetcher = fetcherFor(AUGUST_DAYS)
    renderPicker({ fetcher, minDate: "2026-08-22" })

    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))
    expect(body.from).toBe("2026-08-22")

    openPicker()
    await screen.findByText("€180")
    expect(dayButton(18).hasAttribute("disabled")).toBe(true)
  })
})
