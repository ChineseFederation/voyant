"use client"

import type {
  AllocationManifestTraveler,
  AllocationResource,
  SeatLayoutCell,
  SeatLayoutSpec,
} from "@voyant-travel/operations-react/availability"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@voyant-travel/ui/components"
import { Armchair, Crown, DoorOpen, Trash2, Users, X } from "lucide-react"
import { type ReactNode, useState } from "react"

import { useAllocationUiMessagesOrDefault } from "../i18n/index.js"
import {
  type AllocationOccupants,
  groupSeatsByVehicle,
  seatName,
  seatRows,
} from "./slot-allocation-model.js"
import {
  AllocationColumn,
  paymentStatusChipClass,
  paymentStatusTooltip,
  SeatPositionBadge,
  TravelerTile,
} from "./slot-allocation-shared.js"

export function VehicleSeatsView({
  seats,
  vehicles,
  occupants,
  sharingGroupLabels,
  onAssignTraveler,
  onUnassignTraveler,
  onRemoveResource,
  onBookingOpen,
  renderTravelerActions,
}: {
  seats: AllocationResource[]
  vehicles: AllocationResource[]
  occupants: AllocationOccupants
  sharingGroupLabels: Record<string, string>
  /** Assign an unallocated traveler to a specific seat resource. */
  onAssignTraveler: (travelerId: string, resourceId: string) => void
  /** Remove a traveler from their current seat (no resource id required). */
  onUnassignTraveler: (travelerId: string) => void
  /** Delete an empty manually-created seat. Occupied seats must be unassigned first. */
  onRemoveResource: (resourceId: string) => void
  /** Fired when the operator clicks a booking number on a seat / tile. */
  onBookingOpen?: (bookingId: string) => void
  renderTravelerActions?: (traveler: AllocationManifestTraveler) => ReactNode
}) {
  const messages = useAllocationUiMessagesOrDefault()
  const groups = groupSeatsByVehicle(seats, vehicles, messages)

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(18rem,22rem)_1fr]">
      <AllocationColumn
        id="unallocated"
        icon={<Users className="size-4" aria-hidden="true" />}
        title={messages.unallocated}
        description={messages.unallocatedDescription}
        count={occupants.unallocated.length}
        capacity={occupants.byTravelerId.size}
      >
        {occupants.unallocated.length === 0 ? (
          <p className="text-xs text-muted-foreground">{messages.unallocatedEmpty}</p>
        ) : (
          occupants.unallocated.map((traveler) => (
            <TravelerTile
              key={traveler.id}
              traveler={traveler}
              sharingGroupLabel={
                traveler.sharingGroupId ? sharingGroupLabels[traveler.sharingGroupId] : null
              }
              renderActions={renderTravelerActions}
            />
          ))
        )}
      </AllocationColumn>

      <div className="grid min-w-0 gap-4">
        {seats.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            {messages.noSeats}
          </div>
        ) : (
          groups.map((group) => (
            <Card key={group.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <Armchair className="size-4" aria-hidden="true" />
                  <span>{group.label}</span>
                  <Badge variant="outline">
                    {
                      group.seats.filter(
                        (seat) => (occupants.byResource.get(seat.id) ?? []).length > 0,
                      ).length
                    }
                    /{group.seats.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {group.layoutSpec ? (
                  <SpecGrid
                    spec={group.layoutSpec}
                    seats={group.seats}
                    occupants={occupants}
                    sharingGroupLabels={sharingGroupLabels}
                    onAssignTraveler={onAssignTraveler}
                    onUnassignTraveler={onUnassignTraveler}
                    onRemoveResource={onRemoveResource}
                    onBookingOpen={onBookingOpen}
                  />
                ) : (
                  <div className="grid gap-2">
                    {seatRows(group.seats).map((row) => (
                      <div
                        key={row.rowKey}
                        className="grid items-stretch gap-2"
                        style={{
                          gridTemplateColumns: `repeat(${row.seats.length}, minmax(4.25rem, 1fr))`,
                        }}
                      >
                        {row.seats.map((seat) => {
                          const seatOccupants = occupants.byResource.get(seat.id) ?? []
                          return (
                            <VehicleSeatCell
                              key={seat.id}
                              seat={seat}
                              occupant={seatOccupants[0] ?? null}
                              overflow={seatOccupants.length > 1}
                              unallocated={occupants.unallocated}
                              sharingGroupLabel={
                                seatOccupants[0]?.sharingGroupId
                                  ? sharingGroupLabels[seatOccupants[0].sharingGroupId]
                                  : null
                              }
                              onAssignTraveler={(travelerId) =>
                                onAssignTraveler(travelerId, seat.id)
                              }
                              onUnassignTraveler={onUnassignTraveler}
                              onRemoveResource={onRemoveResource}
                              onBookingOpen={onBookingOpen}
                            />
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

function VehicleSeatCell({
  seat,
  occupant,
  overflow,
  unallocated,
  sharingGroupLabel,
  onAssignTraveler,
  onUnassignTraveler,
  onRemoveResource,
  onBookingOpen,
}: {
  seat: AllocationResource
  occupant: AllocationManifestTraveler | null
  overflow: boolean
  unallocated: AllocationManifestTraveler[]
  sharingGroupLabel?: string | null
  onAssignTraveler: (travelerId: string) => void
  onUnassignTraveler: (travelerId: string) => void
  onRemoveResource: (resourceId: string) => void
  onBookingOpen?: (bookingId: string) => void
}) {
  const messages = useAllocationUiMessagesOrDefault()
  const [pickerOpen, setPickerOpen] = useState(false)
  const occupiedClasses = occupant ? paymentStatusChipClass(occupant.paymentStatus) : null
  const cellClasses = cn(
    "flex min-h-24 flex-col rounded-md border bg-background p-2 text-left text-xs",
    occupiedClasses,
    overflow ? "border-destructive bg-destructive/5" /* i18n-literal-ok CSS class token */ : null,
  )

  if (occupant) {
    return (
      <div
        id={`seat:${seat.id}`}
        className={cellClasses}
        title={paymentStatusTooltip(occupant.paymentStatus, messages)}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium">{seat.label ?? seatName(seat, messages)}</span>
          <SeatPositionBadge seat={seat} />
        </div>
        <div className="mt-2 min-w-0">
          <div className="flex items-center gap-1">
            {occupant.isLeadTraveler ? (
              <Crown className="size-3 text-amber-500" aria-label={messages.lead} />
            ) : null}
            {occupant.bookingSequence > 0 ? (
              <span className="text-muted-foreground tabular-nums" aria-hidden="true">
                ({occupant.bookingSequence})
              </span>
            ) : null}
            <span className="truncate font-medium">{occupant.fullName}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-muted-foreground">
            {onBookingOpen ? (
              <button
                type="button"
                onClick={() => onBookingOpen(occupant.bookingId)}
                className="hover:text-foreground hover:underline"
              >
                {occupant.bookingNumber}
              </button>
            ) : (
              <span>{occupant.bookingNumber}</span>
            )}
            {sharingGroupLabel ? (
              <Badge variant="secondary" className="max-w-full truncate text-[10px]">
                {sharingGroupLabel}
              </Badge>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-auto h-6 self-end px-1 text-xs"
          onClick={() => onUnassignTraveler(occupant.id)}
          aria-label={`${messages.remove}: ${occupant.fullName}`}
        >
          <X className="size-3" aria-hidden="true" />
        </Button>
      </div>
    )
  }

  const disabled = unallocated.length === 0
  return (
    <div id={`seat:${seat.id}`} className={cellClasses}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{seat.label ?? seatName(seat, messages)}</span>
        <div className="flex items-center gap-1">
          <SeatPositionBadge seat={seat} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => onRemoveResource(seat.id)}
            aria-label={`${messages.remove}: ${seat.label ?? seatName(seat, messages)}`}
          >
            <Trash2 className="size-3" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-auto h-7 w-full justify-center rounded border border-dashed text-muted-foreground"
              disabled={disabled}
              aria-label={messages.assignTraveler}
            >
              {disabled ? messages.assignTravelerEmpty : messages.assignTraveler}
            </Button>
          }
        />
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder={messages.assignTravelerSearch} />
            <CommandList>
              <CommandEmpty>{messages.assignTravelerEmpty}</CommandEmpty>
              <CommandGroup>
                {unallocated.map((traveler) => (
                  <CommandItem
                    key={traveler.id}
                    value={`${traveler.fullName} ${traveler.bookingNumber}`}
                    onSelect={() => {
                      onAssignTraveler(traveler.id)
                      setPickerOpen(false)
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{traveler.fullName}</span>
                      <span className="text-xs text-muted-foreground">
                        {traveler.bookingNumber}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/**
 * Render the bus as the operator drew it. Walks `layoutSpec.rows` and maps
 * each `"seat"` cell to its materialized resource by (row, seat-column-letter).
 * Other cell kinds render as visible spacers — doors as a striped row, voids
 * and aisles as gap tiles — so the rendered map mirrors the builder view.
 */
function SpecGrid({
  spec,
  seats,
  occupants,
  sharingGroupLabels,
  onAssignTraveler,
  onUnassignTraveler,
  onRemoveResource,
  onBookingOpen,
}: {
  spec: SeatLayoutSpec
  seats: AllocationResource[]
  occupants: AllocationOccupants
  sharingGroupLabels: Record<string, string>
  onAssignTraveler: (travelerId: string, resourceId: string) => void
  onUnassignTraveler: (travelerId: string) => void
  onRemoveResource: (resourceId: string) => void
  onBookingOpen?: (bookingId: string) => void
}) {
  const seatsByRowColumn = indexSeats(seats)
  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      {spec.rows.map((row, rowIndex) => {
        const rowNumber = rowIndex + 1
        let seatColumn = 0
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional within the bus layout. -- owner: availability-react; existing suppression is intentional pending typed cleanup.
            key={`spec-row-${rowIndex}`}
            className="grid items-stretch gap-2"
            style={{ gridTemplateColumns: `repeat(${row.cells.length}, minmax(4.25rem, 1fr))` }}
          >
            {row.cells.map((cell, cellIndex) => {
              if (cell === "seat") {
                seatColumn += 1
                const columnName = columnLetter(seatColumn)
                const seat = seatsByRowColumn.get(`${rowNumber}:${columnName}`)
                if (!seat) {
                  return (
                    <SpacerCell
                      // biome-ignore lint/suspicious/noArrayIndexKey: positional cell within a fixed row. -- owner: availability-react; existing suppression is intentional pending typed cleanup.
                      key={`spec-${rowIndex}-${cellIndex}`}
                      kind="void"
                    />
                  )
                }
                const seatOccupants = occupants.byResource.get(seat.id) ?? []
                return (
                  <VehicleSeatCell
                    key={seat.id}
                    seat={seat}
                    occupant={seatOccupants[0] ?? null}
                    overflow={seatOccupants.length > 1}
                    unallocated={occupants.unallocated}
                    sharingGroupLabel={
                      seatOccupants[0]?.sharingGroupId
                        ? sharingGroupLabels[seatOccupants[0].sharingGroupId]
                        : null
                    }
                    onAssignTraveler={(travelerId) => onAssignTraveler(travelerId, seat.id)}
                    onUnassignTraveler={onUnassignTraveler}
                    onRemoveResource={onRemoveResource}
                    onBookingOpen={onBookingOpen}
                  />
                )
              }
              return (
                <SpacerCell
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional cell within a fixed row. -- owner: availability-react; existing suppression is intentional pending typed cleanup.
                  key={`spec-${rowIndex}-${cellIndex}`}
                  kind={cell}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function SpacerCell({ kind }: { kind: Exclude<SeatLayoutCell, "seat"> }) {
  if (kind === "door") {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-md border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300">
        <DoorOpen className="size-5" aria-hidden="true" />
      </div>
    )
  }
  if (kind === "void") {
    return <div className="min-h-24 rounded-md border border-dashed border-muted-foreground/20" />
  }
  // aisle
  return <div className="min-h-24" aria-hidden="true" />
}

function indexSeats(seats: AllocationResource[]): Map<string, AllocationResource> {
  const map = new Map<string, AllocationResource>()
  for (const seat of seats) {
    const row = typeof seat.flags?.row === "number" ? seat.flags.row : null
    const column = typeof seat.flags?.column === "string" ? seat.flags.column : null
    if (row === null || column === null) continue
    map.set(`${row}:${column}`, seat)
  }
  return map
}

function columnLetter(value: number): string {
  let result = ""
  let n = value
  while (n > 0) {
    const remainder = (n - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}
