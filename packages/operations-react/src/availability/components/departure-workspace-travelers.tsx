"use client"

import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components"
import { UserPlus, Users } from "lucide-react"
import type { AvailabilityUiMessages } from "../i18n/index.js"
import type { AllocationManifestBooking, DepartureSummary } from "../index.js"
import { DepartureSection, StatCard, StatGrid } from "./departure-stat.js"

/**
 * Travelers: who is actually coming, and whether the names match what was
 * sold.
 *
 * The counters are the summary's whole-departure aggregates; the rows are the
 * allocation manifest's page. That split is deliberate — a paged manifest can
 * never move a headline number (`service-departure-summary.ts`), so "3 names
 * missing" stays true no matter how much of the roster is on screen.
 */
export function DepartureTravelersSection({
  summary,
  bookings,
  resourceLabelById,
  messages,
  onCreateBooking,
  onOpenBooking,
}: {
  summary: DepartureSummary | null
  bookings: ReadonlyArray<AllocationManifestBooking>
  /** Allocation resource id → its operator-facing label, for the seat column. */
  resourceLabelById: ReadonlyMap<string, string>
  messages: AvailabilityUiMessages
  /** Next action when nobody is booked yet (AC7). */
  onCreateBooking?: () => void
  onOpenBooking?: (bookingId: string) => void
}) {
  const copy = messages.details.departure.travelers
  const travelers = summary?.travelers ?? null
  const rows = bookings.flatMap((booking) =>
    booking.travelers.map((traveler) => ({ booking, traveler })),
  )

  return (
    <div className="flex flex-col gap-6">
      <DepartureSection slot="departure-traveler-counters" title={copy.title}>
        <StatGrid className="sm:grid-cols-5">
          <StatCard label={copy.enteredLabel}>{String(travelers?.entered ?? 0)}</StatCard>
          <StatCard label={copy.leadLabel}>{String(travelers?.lead ?? 0)}</StatCard>
          <StatCard label={copy.seatedLabel}>{String(travelers?.assigned ?? 0)}</StatCard>
          <StatCard
            label={copy.unseatedLabel}
            tone={travelers && travelers.unassigned > 0 ? "attention" : "default"}
          >
            {String(travelers?.unassigned ?? 0)}
          </StatCard>
          {/* `missing` is signed: positive means names are outstanding, negative
              means more travelers were entered than pax were sold. */}
          <StatCard
            label={travelers && travelers.missing < 0 ? copy.excessLabel : copy.missingLabel}
            tone={travelers && travelers.missing !== 0 ? "attention" : "default"}
          >
            {String(Math.abs(travelers?.missing ?? 0))}
          </StatCard>
        </StatGrid>
      </DepartureSection>

      {rows.length === 0 ? (
        <Empty data-slot="departure-travelers-empty" className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{copy.emptyTitle}</EmptyTitle>
            <EmptyDescription>{copy.emptyDescription}</EmptyDescription>
          </EmptyHeader>
          {onCreateBooking ? (
            <Button onClick={onCreateBooking}>
              <UserPlus data-icon="inline-start" aria-hidden="true" />
              {copy.emptyAction}
            </Button>
          ) : null}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.columnTraveler}</TableHead>
                <TableHead>{copy.columnBooking}</TableHead>
                <TableHead>{copy.columnStatus}</TableHead>
                <TableHead>{copy.columnSeat}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ booking, traveler }) => {
                const seats = Object.values(traveler.allocations)
                  .map((resourceId) => resourceLabelById.get(resourceId) ?? null)
                  .filter((label): label is string => Boolean(label))

                return (
                  <TableRow key={traveler.id}>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{traveler.fullName}</span>
                        {traveler.isLeadTraveler ? (
                          <Badge variant="secondary">{copy.leadBadge}</Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      {onOpenBooking ? (
                        <Button
                          variant="link"
                          className="h-auto p-0"
                          onClick={() => onOpenBooking(booking.id)}
                          aria-label={copy.openBookingAction}
                        >
                          {booking.bookingNumber}
                        </Button>
                      ) : (
                        booking.bookingNumber
                      )}
                    </TableCell>
                    <TableCell className="capitalize">
                      {booking.status.replace(/[._-]/g, " ")}
                    </TableCell>
                    <TableCell>
                      {seats.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {seats.map((label) => (
                            <Badge key={label} variant="outline">
                              {label}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          {copy.unseatedBadge}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
