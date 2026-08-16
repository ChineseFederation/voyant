"use client"

import type {
  CabinClass,
  FlightSearchRequest,
  FlightSlice,
  PassengerCounts,
} from "@voyant-travel/flights/contract/types"
import { Button } from "@voyant-travel/ui/components/button"
import { ToggleGroup, ToggleGroupItem } from "@voyant-travel/ui/components/toggle-group"
import { ArrowLeftRight, Search } from "lucide-react"
import { useState } from "react"
import { useFlightsUiMessagesOrDefault } from "../i18n/index.js"
import { rememberSearchedAirports } from "../recent-routes.js"
import { AirportCombobox } from "./airport-combobox.js"
import { FlightDatePicker } from "./flight-date-picker.js"
import { PaxCabinPopover } from "./pax-cabin-popover.js"

export type TripType = "one_way" | "round_trip"

export interface FlightSearchFormProps {
  /** Called when the user submits a complete search. */
  onSearch: (request: FlightSearchRequest) => void
  /** Disable the submit button (e.g. while a search is in flight). */
  loading?: boolean
  /** Optional initial values. */
  initial?: Partial<FlightSearchRequest> & { tripType?: TripType }
}

export function FlightSearchForm({ onSearch, loading, initial }: FlightSearchFormProps) {
  const messages = useFlightsUiMessagesOrDefault().flightSearchForm
  const initialSlices = initial?.slices ?? []
  const [tripType, setTripType] = useState<TripType>(
    initial?.tripType ?? (initialSlices.length === 2 ? "round_trip" : "one_way"),
  )
  const [origin, setOrigin] = useState<string | null>(initialSlices[0]?.origin ?? null)
  const [destination, setDestination] = useState<string | null>(
    initialSlices[0]?.destination ?? null,
  )
  const [departureDate, setDepartureDate] = useState<string | null>(
    initialSlices[0]?.departureDate ?? null,
  )
  const [returnDate, setReturnDate] = useState<string | null>(
    initialSlices[1]?.departureDate ?? null,
  )

  const initialPax: PassengerCounts = initial?.passengers ?? {
    adults: 1,
    children: 0,
    infants: 0,
  }
  const [passengers, setPassengers] = useState<PassengerCounts>(initialPax)
  const [cabin, setCabin] = useState<CabinClass>(initial?.cabin ?? "economy")

  const swap = () => {
    const o = origin
    setOrigin(destination)
    setDestination(o)
  }

  const ready =
    origin != null &&
    destination != null &&
    departureDate != null &&
    (tripType === "one_way" || returnDate != null) &&
    passengers.adults > 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || origin == null || destination == null || departureDate == null) return
    // Only a submitted search counts — this is what puts an operator's own
    // airports at the top of the picker next time.
    rememberSearchedAirports([origin, destination])
    const slices: FlightSlice[] = [{ origin, destination, departureDate }]
    if (tripType === "round_trip" && returnDate) {
      slices.push({
        origin: destination,
        destination: origin,
        departureDate: returnDate,
      })
    }
    onSearch({ slices, passengers, cabin })
  }

  return (
    <form onSubmit={submit} className="rounded-md border bg-card px-5 py-5 shadow-sm">
      {/* Single horizontal row. Every control is h-10 so the bar reads as
          one continuous strip. flex-wrap lets it stack at narrow widths. */}
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          size="lg"
          variant="outline"
          value={[tripType]}
          onValueChange={(v: string[]) => {
            const next = v[0] as TripType | undefined
            if (next) setTripType(next)
          }}
        >
          <ToggleGroupItem size="lg" value="round_trip">
            {messages.roundTrip}
          </ToggleGroupItem>
          <ToggleGroupItem size="lg" value="one_way">
            {messages.oneWay}
          </ToggleGroupItem>
        </ToggleGroup>

        {/* From | swap | To group — flush together so they read as a unit. */}
        <div className="flex flex-1 items-center gap-1">
          <AirportCombobox
            value={origin}
            onChange={setOrigin}
            side="origin"
            placeholder={messages.fromPlaceholder}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={swap}
            aria-label={messages.swapAriaLabel}
            className="size-10 shrink-0"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <AirportCombobox
            value={destination}
            onChange={setDestination}
            side="destination"
            placeholder={messages.toPlaceholder}
            className="flex-1"
          />
        </div>

        {/* Date pair — flush together so the trip dates read as a unit. Each
            picker prices the leg it selects, so the return shows the fare for
            coming back rather than repeating the outbound. */}
        <div className="flex items-center gap-1">
          <FlightDatePicker
            value={departureDate}
            onChange={setDepartureDate}
            origin={origin}
            destination={destination}
            passengers={passengers}
            cabin={cabin}
            placeholder={messages.departPlaceholder}
            className="h-10 flex-1 min-w-32"
          />
          <FlightDatePicker
            value={returnDate}
            onChange={setReturnDate}
            origin={destination}
            destination={origin}
            passengers={passengers}
            cabin={cabin}
            minDate={departureDate}
            placeholder={messages.returnPlaceholder}
            disabled={tripType === "one_way"}
            className="h-10 flex-1 min-w-32"
          />
        </div>

        <PaxCabinPopover
          passengers={passengers}
          cabin={cabin}
          onChange={(next) => {
            setPassengers(next.passengers)
            setCabin(next.cabin)
          }}
        />

        <Button type="submit" size="lg" disabled={!ready || loading} className="shrink-0 px-6">
          <Search className="mr-2 h-4 w-4" />
          {loading ? messages.searching : messages.search}
        </Button>
      </div>
    </form>
  )
}
