"use client"

import { Button } from "@voyant-travel/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@voyant-travel/ui/components/command"
import { Popover, PopoverContent, PopoverTrigger } from "@voyant-travel/ui/components/popover"
import { cn } from "@voyant-travel/ui/lib/utils"
import { ChevronDown, MapPin } from "lucide-react"
import { useMemo, useState } from "react"
import { useServedMarkets } from "../hooks/use-served-markets.js"
import { useFlightsUiMessagesOrDefault } from "../i18n/index.js"
import { type AirportDto, useAirportSearch } from "../index.js"
import {
  matchRecentAirports,
  noteAirportSelected,
  type RecentAirport,
  readRecentAirports,
} from "../recent-routes.js"
import type { ServedMarketsResponseDto } from "../schemas.js"

export interface AirportComboboxProps {
  /** Selected IATA code, or null when nothing is selected. */
  value: string | null
  onChange: (next: string | null, airport: AirportDto | null) => void
  /** Trigger placeholder when nothing is selected (e.g. "From", "To"). */
  placeholder?: string
  /**
   * Which side of the route this picker fills. Only affects ordering: a
   * connector may declare different origins and destinations.
   */
  side?: "origin" | "destination"
  className?: string
  disabled?: boolean
}

/**
 * Single-line typeahead airport picker. Trigger reads as one of:
 *   - placeholder (no selection)
 *   - "LHR · London" (selection in current result set)
 *   - "LHR" (selection but airport not in current result page)
 *
 * Backed by `useAirportSearch` (debounced server query).
 */
export function AirportCombobox({
  value,
  onChange,
  placeholder,
  side = "origin",
  className,
  disabled,
}: AirportComboboxProps) {
  const messages = useFlightsUiMessagesOrDefault().airportCombobox
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  // Ask for more than fits so the reference list still has depth after the
  // operator's own airports are lifted out of it into their own groups.
  const search = useAirportSearch(input, { enabled: open, limit: 40 })
  const servedMarkets = useServedMarkets({ enabled: open })
  const airports = search.data?.data ?? []
  const selected = value ? airports.find((a) => a.iataCode === value) : null

  // Read once per open, not per keystroke: the ranking should hold still
  // while the user types into it.
  const remembered = useMemo(() => (open ? readRecentAirports() : []), [open])

  const groups = useMemo(
    () =>
      groupAirports({
        airports,
        recent: matchRecentAirports(remembered, input),
        servedCodes: servedMarketCodes(servedMarkets.data, side),
        messages,
      }),
    [airports, remembered, input, servedMarkets.data, side, messages],
  )

  const select = (airport: AirportDto) => {
    noteAirportSelected(airport)
    onChange(airport.iataCode, airport)
    setOpen(false)
    setInput("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("h-10 justify-between gap-2 px-3", className)}
          />
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          {value ? (
            <span className="truncate text-sm">
              <span className="font-mono font-medium">{value}</span>
              {selected && (
                <span className="ml-1.5 font-normal text-muted-foreground">{selected.city}</span>
              )}
            </span>
          ) : (
            <span className="truncate text-sm text-muted-foreground">
              {placeholder ?? messages.placeholder}
            </span>
          )}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={input}
            onValueChange={setInput}
            placeholder={messages.searchPlaceholder}
          />
          <CommandList>
            <CommandEmpty>{search.isLoading ? messages.searching : messages.empty}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.key} heading={group.heading}>
                {group.airports.map((a) => (
                  <CommandItem
                    key={a.iataCode}
                    value={`${group.key} ${a.iataCode} ${a.city} ${a.name}`}
                    onSelect={() => {
                      select(a)
                    }}
                  >
                    <span className="mr-2 inline-flex w-10 justify-center rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium">
                      {a.iataCode}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{a.city}</span>
                      <span className="truncate text-xs text-muted-foreground">{a.name}</span>
                    </div>
                    <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                      {a.country}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

interface AirportGroup {
  key: "recent" | "served" | "all"
  heading: string
  airports: AirportDto[]
}

/**
 * Split the reference results into three bands, most relevant first:
 *
 *   1. airports this operator has actually searched (local memory)
 *   2. airports the connector declares it sells (`flight/served-markets`)
 *   3. everything else the reference returned
 *
 * Each airport appears exactly once, in the highest band that claims it.
 * Nothing is ever removed — a stale served-markets declaration must not be
 * able to hide an airport the operator needs, so the third group always
 * carries the remainder.
 */
function groupAirports({
  airports,
  recent,
  servedCodes,
  messages,
}: {
  airports: AirportDto[]
  recent: RecentAirport[]
  servedCodes: Set<string>
  messages: ReturnType<typeof useFlightsUiMessagesOrDefault>["airportCombobox"]
}): AirportGroup[] {
  const byCode = new Map(airports.map((airport) => [airport.iataCode, airport]))

  // Recent airports keep their own order (most-used first), not the
  // reference's — that ranking is the entire point of remembering them. They
  // render from local memory, so one that fell off the current result page
  // still appears.
  const recentAirports: AirportDto[] = recent.map(
    (entry) =>
      byCode.get(entry.iataCode) ?? {
        iataCode: entry.iataCode,
        city: entry.city,
        name: entry.name,
        country: entry.country,
      },
  )
  const claimed = new Set(recentAirports.map((airport) => airport.iataCode))

  const served: AirportDto[] = []
  const rest: AirportDto[] = []
  for (const airport of airports) {
    if (claimed.has(airport.iataCode)) continue
    if (servedCodes.has(airport.iataCode)) served.push(airport)
    else rest.push(airport)
  }

  const groups: AirportGroup[] = []
  if (recentAirports.length > 0) {
    groups.push({ key: "recent", heading: messages.recentHeading, airports: recentAirports })
  }
  if (served.length > 0) {
    groups.push({ key: "served", heading: messages.servedHeading, airports: served })
  }
  if (rest.length > 0) {
    // Only name the last group when something sits above it; on its own it is
    // simply "the list" and a heading would be noise.
    const heading = groups.length > 0 ? messages.allHeading : ""
    groups.push({ key: "all", heading, airports: rest })
  }
  return groups
}

/** The side of the network this picker cares about. */
function servedMarketCodes(
  markets: ServedMarketsResponseDto | undefined,
  side: "origin" | "destination",
): Set<string> {
  if (!markets) return new Set()
  const codes = side === "destination" ? (markets.destinations ?? markets.origins) : markets.origins
  return new Set(codes)
}
