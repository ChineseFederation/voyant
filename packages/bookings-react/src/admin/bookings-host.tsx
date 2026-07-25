"use client"

import { useAdminNavigate } from "@voyant-travel/admin"
import type { ReactNode } from "react"

import type { BookingListFiltersState } from "../components/booking-list.js"
import { BookingsPage } from "../components/bookings-page.js"

export interface BookingsHostProps {
  /** Filter / sort / paging state parsed from the URL by the route file. */
  initialFilters?: Partial<BookingListFiltersState>
  /** Fires on any filter change; the route file projects it back into the URL. */
  onFiltersChange?: (filters: BookingListFiltersState) => void
  /**
   * Extra action(s) rendered alongside the primary "New booking" button.
   * App-owned adjacent flows (e.g. the operator's "Compose trip" link)
   * land here so the packaged page doesn't hardcode other domains.
   */
  headerActions?: ReactNode
}

/**
 * Packaged admin host for `BookingsPage` (packaged-admin RFC Phase 3).
 *
 * Proof-of-contract for semantic destinations (RFC §4.7): no host route
 * tree is imported — opening a booking resolves `"booking.detail"` and the
 * detail route resolves through the workspace's semantic resolver. The route file stays the thin binding
 * layer for search-state (via {@link bookingsIndexSearchSchema} and the
 * `bookingsSearchToFilters`/`bookingsFiltersToSearch` helpers).
 */
export function BookingsHost({
  initialFilters,
  onFiltersChange,
  headerActions,
}: BookingsHostProps) {
  const navigateTo = useAdminNavigate()

  return (
    <BookingsPage
      onBookingOpen={(booking) => navigateTo("booking.detail", { bookingId: booking.id })}
      headerActions={headerActions}
      initialFilters={initialFilters}
      onFiltersChange={onFiltersChange}
    />
  )
}
