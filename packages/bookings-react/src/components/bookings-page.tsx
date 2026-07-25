"use client"

import { cn } from "@voyant-travel/ui/lib/utils"
import type * as React from "react"
import { useBookingsUiMessagesOrDefault } from "../i18n/index.js"
import type { BookingRecord } from "../index.js"
import { BookingList, type BookingListFiltersState } from "./booking-list.js"

export interface BookingsPageProps {
  pageSize?: number
  onBookingOpen?: (booking: BookingRecord) => void
  /**
   * Extra action(s) rendered alongside the primary "New booking" button.
   * Templates pass adjacent flows (e.g. a "Compose trip" link) here.
   */
  headerActions?: React.ReactNode
  className?: string
  /** Forwarded to `BookingList` — see prop docs there. */
  initialFilters?: Partial<BookingListFiltersState>
  onFiltersChange?: (filters: BookingListFiltersState) => void
}

export function BookingsPage({
  pageSize,
  onBookingOpen,
  headerActions,
  className,
  initialFilters,
  onFiltersChange,
}: BookingsPageProps = {}) {
  const messages = useBookingsUiMessagesOrDefault().bookingsPage

  return (
    <div data-slot="bookings-page" className={cn("flex flex-col gap-6", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{messages.title}</h1>
        <p className="text-sm text-muted-foreground">{messages.description}</p>
      </div>

      <BookingList
        pageSize={pageSize}
        onSelectBooking={onBookingOpen}
        headerActions={headerActions}
        initialFilters={initialFilters}
        onFiltersChange={onFiltersChange}
      />
    </div>
  )
}
