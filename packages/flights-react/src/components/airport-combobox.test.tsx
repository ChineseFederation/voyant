// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { VoyantFlightsProvider } from "../provider.js"
import {
  clearRecentAirports,
  noteAirportSelected,
  rememberSearchedAirports,
} from "../recent-routes.js"
import type { AirportDto } from "../schemas.js"
import { AirportCombobox } from "./airport-combobox.js"

function airport(iataCode: string, city: string, name: string): AirportDto {
  return { iataCode, city, name, country: "XX" }
}

const LHR = airport("LHR", "London", "Heathrow")
const OTP = airport("OTP", "Bucharest", "Otopeni")
const FNC = airport("FNC", "Funchal", "Madeira")
const NRT = airport("NRT", "Tokyo", "Narita")

const REFERENCE = [LHR, OTP, FNC, NRT]

function fetcherFor({
  airports = REFERENCE,
  servedMarkets,
}: {
  airports?: AirportDto[]
  servedMarkets?: { origins: string[]; destinations?: string[] } | number
} = {}) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes("/served-markets")) {
      if (typeof servedMarkets === "number") {
        return Response.json({ error: "nope" }, { status: servedMarkets })
      }
      if (!servedMarkets) return Response.json({ error: "nope" }, { status: 501 })
      return Response.json(servedMarkets)
    }
    if (url.includes("/reference/airports")) {
      const query = new URL(url, "http://localhost").searchParams.get("q")?.toLowerCase()
      const data = query
        ? airports.filter((a) =>
            [a.iataCode, a.city, a.name].some((field) => field.toLowerCase().includes(query)),
          )
        : airports
      return Response.json({ data })
    }
    return Response.json({ data: [] })
  })
}

function renderCombobox(fetcher: (url: string, init?: RequestInit) => Promise<Response>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <VoyantFlightsProvider baseUrl="/api" fetcher={fetcher}>
        <AirportCombobox value={null} onChange={vi.fn()} placeholder="From" side="origin" />
      </VoyantFlightsProvider>
    </QueryClientProvider>,
  )
}

function openCombobox() {
  fireEvent.click(screen.getByRole("button", { name: /From/ }))
}

/**
 * The option labels under a named group heading, in render order. cmdk renders
 * the heading as a sibling of the `role=group` items container, so the shared
 * ancestor is the command-group wrapper rather than the group itself.
 */
function optionsUnder(heading: string): string[] {
  const group = screen.getByText(heading).closest("[data-slot=command-group]")
  if (!group) throw new Error(`No group for heading ${heading}`)
  return within(group as HTMLElement)
    .getAllByRole("option")
    .map((option) => option.textContent ?? "")
}

/** Record airports as genuinely searched, which is what promotes them. */
function haveSearched(...airports: AirportDto[]) {
  for (const a of airports) noteAirportSelected(a)
  rememberSearchedAirports(airports.map((a) => a.iataCode))
}

// The command list virtualizes, which needs ResizeObserver; jsdom lacks it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub)
  // Active-item tracking scrolls the highlighted option into view.
  Element.prototype.scrollIntoView = vi.fn()
  clearRecentAirports()
})

afterEach(() => {
  clearRecentAirports()
  cleanup()
})

describe("AirportCombobox grouping", () => {
  it("leads with the airports this operator has actually searched", async () => {
    haveSearched(OTP)
    renderCombobox(fetcherFor())
    openCombobox()

    // Remembered airports render immediately from local memory; wait for the
    // reference page to land before comparing the two groups.
    await screen.findByText("All airports")
    expect(optionsUnder("Your routes").join()).toContain("OTP")
    // ...and it is not repeated further down.
    expect(optionsUnder("All airports").join()).not.toContain("OTP")
  })

  it("ranks a route flown more often above one flown once", async () => {
    haveSearched(OTP)
    haveSearched(LHR)
    haveSearched(LHR)
    renderCombobox(fetcherFor())
    openCombobox()

    await screen.findByText("Your routes")
    const [first, second] = optionsUnder("Your routes")
    expect(first).toContain("LHR")
    expect(second).toContain("OTP")
  })

  it("groups the connector's declared network above the global reference", async () => {
    renderCombobox(fetcherFor({ servedMarkets: { origins: ["FNC"] } }))
    openCombobox()

    await screen.findByText("Served by your providers")
    expect(optionsUnder("Served by your providers").join()).toContain("FNC")
    expect(optionsUnder("All airports").join()).toContain("NRT")
  })

  // The rule that keeps a stale declaration from amputating the product.
  it("still offers airports the connector does not declare", async () => {
    renderCombobox(fetcherFor({ servedMarkets: { origins: ["FNC"] } }))
    openCombobox()

    await screen.findByText("Served by your providers")
    const everything = screen.getAllByRole("option").map((option) => option.textContent ?? "")
    for (const code of ["LHR", "OTP", "FNC", "NRT"]) {
      expect(everything.join()).toContain(code)
    }
  })

  it("reads the destination side of an asymmetric network", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <VoyantFlightsProvider
          baseUrl="/api"
          fetcher={fetcherFor({ servedMarkets: { origins: ["OTP"], destinations: ["FNC"] } })}
        >
          <AirportCombobox value={null} onChange={vi.fn()} placeholder="To" side="destination" />
        </VoyantFlightsProvider>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: /To/ }))

    await screen.findByText("Served by your providers")
    expect(optionsUnder("Served by your providers").join()).toContain("FNC")
    expect(optionsUnder("Served by your providers").join()).not.toContain("OTP")
  })

  it("shows one unheaded list when there is no signal to group by", async () => {
    renderCombobox(fetcherFor({ servedMarkets: 501 }))
    openCombobox()

    await waitFor(() => expect(screen.getAllByRole("option").length).toBe(REFERENCE.length))
    expect(screen.queryByText("Your routes")).toBeNull()
    expect(screen.queryByText("Served by your providers")).toBeNull()
    expect(screen.queryByText("All airports")).toBeNull()
  })

  // "Your routes" that ignores the query is just a list in the way.
  it("narrows remembered airports to the typeahead", async () => {
    haveSearched(OTP)
    renderCombobox(fetcherFor())
    openCombobox()
    await screen.findByText("Your routes")

    fireEvent.change(screen.getByPlaceholderText(/Type city or IATA/), {
      target: { value: "tokyo" },
    })

    await waitFor(() => expect(screen.queryByText("Your routes")).toBeNull())
    expect(
      screen
        .getAllByRole("option")
        .map((o) => o.textContent ?? "")
        .join(),
    ).toContain("NRT")
  })

  it("keeps a remembered airport visible even when the reference page drops it", async () => {
    haveSearched(OTP)
    // The reference no longer returns OTP at all — local memory carries it.
    renderCombobox(fetcherFor({ airports: [LHR, FNC, NRT] }))
    openCombobox()

    await screen.findByText("Your routes")
    expect(optionsUnder("Your routes").join()).toContain("Bucharest")
  })
})
