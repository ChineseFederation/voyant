"use client"

import {
  Badge,
  Button,
  cn,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@voyant-travel/ui/components"
import { UserPlus, Users } from "lucide-react"
import type { AvailabilityUiMessages } from "../i18n/index.js"
import type {
  AllocationManifestBooking,
  AllocationManifestTraveler,
  DepartureSummary,
} from "../index.js"
import { DepartureSection, StatCard, StatGrid } from "./departure-stat.js"

type TravelersCopy = AvailabilityUiMessages["details"]["departure"]["travelers"]

/**
 * Travelers: who is actually coming, and whether the names match what was
 * sold.
 *
 * **The roster is grouped by reservation, not flat.** A departure is bought in
 * parties — a family of four, a couple, a solo traveler — and the operator's
 * first question about any name is who it arrived with. The flat table
 * answered that by repeating the booking number on every row and asking the
 * reader to match strings by eye, which failed exactly where it mattered:
 * consecutive bookings whose numbers differ in one digit.
 *
 * Each reservation is its own bordered group carrying the facts that belong to
 * the party rather than to a person — who booked it, its status, whether it is
 * paid, and how many of its sold seats have names yet. The per-traveler row is
 * then only what is true of that traveler.
 *
 * The counters are the summary's whole-departure aggregates; the groups are the
 * allocation manifest's page. That split is deliberate — a paged manifest can
 * never move a headline number (`service-departure-summary.ts`), so "3 names
 * missing" stays true no matter how much of the roster is on screen.
 *
 * Everything seat-shaped — the Seated / Not seated counters and the Seat /
 * room column — renders only when the departure actually allocates positions
 * (`allocatesPositions`). A day excursion has no rooms and no seat map, and
 * reporting its whole roster as "not seated" against a plan that does not
 * exist is noise nobody can act on.
 */
export function DepartureTravelersSection({
  summary,
  bookings,
  resourceLabelById,
  allocatesPositions,
  messages,
  onCreateBooking,
  onOpenBooking,
}: {
  summary: DepartureSummary | null
  bookings: ReadonlyArray<AllocationManifestBooking>
  /** Allocation resource id → its operator-facing label, for the seat column. */
  resourceLabelById: ReadonlyMap<string, string>
  /** Whether this departure has a rooming / seating plan at all. */
  allocatesPositions: boolean
  messages: AvailabilityUiMessages
  /** Next action when nobody is booked yet (AC7). */
  onCreateBooking?: () => void
  onOpenBooking?: (bookingId: string) => void
}) {
  const copy = messages.details.departure.travelers
  const travelers = summary?.travelers ?? null
  const groups = orderReservations(bookings)

  return (
    <div className="flex flex-col gap-6">
      <DepartureSection slot="departure-traveler-counters" title={copy.title}>
        <StatGrid className={allocatesPositions ? "sm:grid-cols-5" : "sm:grid-cols-3"}>
          <StatCard label={copy.reservationsLabel}>
            {String(summary?.bookings.count ?? groups.length)}
          </StatCard>
          <StatCard
            label={copy.enteredLabel}
            hint={copy.leadHint.replace("{count}", String(travelers?.lead ?? 0))}
          >
            {String(travelers?.entered ?? 0)}
          </StatCard>
          {allocatesPositions ? (
            <>
              <StatCard label={copy.seatedLabel}>{String(travelers?.assigned ?? 0)}</StatCard>
              <StatCard
                label={copy.unseatedLabel}
                tone={travelers && travelers.unassigned > 0 ? "attention" : "default"}
              >
                {String(travelers?.unassigned ?? 0)}
              </StatCard>
            </>
          ) : null}
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

      {groups.length === 0 ? (
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
        <div data-slot="departure-traveler-roster" className="flex flex-col gap-3">
          {groups.map((booking) => (
            <ReservationGroup
              key={booking.id}
              booking={booking}
              copy={copy}
              resourceLabelById={resourceLabelById}
              allocatesPositions={allocatesPositions}
              onOpenBooking={onOpenBooking}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Live reservations first, in the departure-local order the manifest numbers
 * them by, then the cancelled ones. A cancelled party still holding an
 * allocation is worth seeing — that is its own attention issue — but it is not
 * who is travelling, so it does not sit between two parties who are.
 */
function orderReservations(
  bookings: ReadonlyArray<AllocationManifestBooking>,
): AllocationManifestBooking[] {
  return [...bookings].sort((left, right) => {
    const cancelled = Number(left.status === "cancelled") - Number(right.status === "cancelled")
    if (cancelled !== 0) return cancelled
    return left.bookingSequence - right.bookingSequence
  })
}

function ReservationGroup({
  booking,
  copy,
  resourceLabelById,
  allocatesPositions,
  onOpenBooking,
}: {
  booking: AllocationManifestBooking
  copy: TravelersCopy
  resourceLabelById: ReadonlyMap<string, string>
  allocatesPositions: boolean
  onOpenBooking?: (bookingId: string) => void
}) {
  const cancelled = booking.status === "cancelled"
  const contactName = [booking.contactFirstName, booking.contactLastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
  const entered = booking.travelers.length
  // The departure-level "names missing" counter says how many are outstanding;
  // only the group can say WHICH reservation is short of them.
  const short = booking.pax !== null && booking.pax !== entered

  return (
    <section
      data-slot="departure-traveler-group"
      data-booking-id={booking.id}
      data-booking-status={booking.status}
      className={cn("overflow-hidden rounded-md border", cancelled && "opacity-70")}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-muted/40 px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {booking.bookingSequence > 0 ? (
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              #{booking.bookingSequence}
            </span>
          ) : null}
          {onOpenBooking ? (
            <Button
              variant="link"
              className="h-auto p-0 font-medium"
              onClick={() => onOpenBooking(booking.id)}
              aria-label={copy.openBookingAction}
            >
              {booking.bookingNumber}
            </Button>
          ) : (
            <span className="font-medium">{booking.bookingNumber}</span>
          )}
          <Badge variant="outline">{bookingStatusLabel(booking.status, copy)}</Badge>
          <Badge variant="outline" className={paymentTones[booking.paymentStatus]}>
            {copy.paymentStatusLabels[booking.paymentStatus]}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {contactName ? <span>{copy.bookedByLabel.replace("{name}", contactName)}</span> : null}
          <span
            className={cn("tabular-nums", short && "font-medium text-red-600 dark:text-red-400")}
          >
            {booking.pax === null
              ? copy.namesEnteredLabel.replace("{entered}", String(entered))
              : copy.namesOfPaxLabel
                  .replace("{entered}", String(entered))
                  .replace("{pax}", String(booking.pax))}
          </span>
        </div>
      </header>

      {entered === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{copy.groupNoNames}</p>
      ) : (
        <ul className="divide-y">
          {booking.travelers.map((traveler, index) => (
            <TravelerRow
              key={traveler.id}
              traveler={traveler}
              ordinal={index + 1}
              copy={copy}
              resourceLabelById={resourceLabelById}
              allocatesPositions={allocatesPositions}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function TravelerRow({
  traveler,
  ordinal,
  copy,
  resourceLabelById,
  allocatesPositions,
}: {
  traveler: AllocationManifestTraveler
  ordinal: number
  copy: TravelersCopy
  resourceLabelById: ReadonlyMap<string, string>
  allocatesPositions: boolean
}) {
  const seats = Object.values(traveler.allocations)
    .map((resourceId) => resourceLabelById.get(resourceId) ?? null)
    .filter((label): label is string => Boolean(label))

  return (
    <li
      data-slot="departure-traveler"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="w-5 shrink-0 tabular-nums text-xs text-muted-foreground">{ordinal}</span>
        <span className="font-medium">{traveler.fullName}</span>
        {traveler.isLeadTraveler ? <Badge variant="secondary">{copy.leadBadge}</Badge> : null}
        {traveler.hasAccessibilityNeeds ? (
          <Badge variant="outline">{copy.accessibilityBadge}</Badge>
        ) : null}
        {traveler.hasDietaryRequirements ? (
          <Badge variant="outline">{copy.dietaryBadge}</Badge>
        ) : null}
      </span>
      {allocatesPositions ? (
        <span className="flex flex-wrap gap-1">
          {seats.length > 0 ? (
            seats.map((label) => (
              <Badge key={label} variant="outline">
                {label}
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              {copy.unseatedBadge}
            </Badge>
          )}
        </span>
      ) : null}
    </li>
  )
}

/**
 * A booking status the operator can read. Unknown values — a status a newer
 * Bookings release invented — degrade to the de-underscored wire value rather
 * than to a blank badge.
 */
function bookingStatusLabel(status: string, copy: TravelersCopy): string {
  const labels: Record<string, string> = copy.bookingStatusLabels
  return labels[status] ?? status.replace(/[._-]/g, " ")
}

const paymentTones: Record<string, string> = {
  paid: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  partial: "border-transparent bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  unpaid: "border-transparent bg-red-500/10 text-red-600 dark:text-red-400",
}
