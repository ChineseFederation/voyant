import { type BookingStatus, bookingStatusSchema } from "./schemas.js"

/**
 * Badge variant palette used by the shadcn default theme. Exported as a named
 * type so downstream code can keep its local `Badge` component loosely coupled
 * to this package — we don't import shadcn here.
 */
export type BookingStatusBadgeVariant = "default" | "secondary" | "outline" | "destructive"

/**
 * Canonical status → badge-variant mapping for bookings.
 *
 * Typed as `Record<BookingStatus, …>` (not `Record<string, …>`) so that adding
 * a new booking status becomes a compile error here, instead of a silent UX
 * fallback in every app that kept its own local copy of this map.
 */
export const bookingStatusBadgeVariant: Record<BookingStatus, BookingStatusBadgeVariant> = {
  confirmed: "default",
  in_progress: "secondary",
  completed: "default",
  cancelled: "destructive",
}

/**
 * Humanize a booking status for display. `"in_progress"` → `"In Progress"`.
 */
export function formatBookingStatus(status: BookingStatus): string {
  return status
    .split("_")
    .map((part) => (part.length > 0 ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part))
    .join(" ")
}

/**
 * All booking status values in their canonical order — derived from the Zod
 * enum so this list can never drift out of sync with the schema.
 */
export const bookingStatuses = bookingStatusSchema.options

/**
 * Pre-built `{ value, label }` list for rendering status pickers (e.g. a
 * Select in a status-change dialog). Uses `formatBookingStatus` for labels so
 * there's exactly one place to tweak capitalization or wording.
 */
export const bookingStatusOptions: ReadonlyArray<{ value: BookingStatus; label: string }> =
  bookingStatuses.map((value) => ({ value, label: formatBookingStatus(value) }))
