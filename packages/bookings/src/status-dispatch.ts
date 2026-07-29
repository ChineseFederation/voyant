import type { BookingStatus } from "./state-machine.js"

export interface BookingStatusDispatchTarget {
  /**
   * Path of the verb endpoint to POST to, including `/v1/admin/bookings/:id` prefix.
   * Always begins with a `/`.
   */
  path: string
  /**
   * JSON body the server expects for the resolved verb.
   *
   * - For named verbs (`/confirm`, `/expire`, `/start`, `/complete`, `/cancel`)
   *   this is `{ note }` when a note is provided, otherwise an empty object.
   * - For `/override-status` it is `{ status, reason, note? }`. When callers
   *   do not provide a note, the dispatcher supplies a non-empty audit reason.
   */
  body: Record<string, unknown>
}

/**
 * Map (currentStatus, targetStatus) → which verb endpoint to call. Lifecycle
 * arrows that have a named verb on the server go to that verb; everything else
 * (non-adjacent jumps, e.g. cancelled → confirmed for data correction) falls
 * through to /override-status, which requires a reason. The note text is used
 * as the reason when provided; otherwise a non-empty audit reason is generated.
 *
 * Framework-agnostic: returns the URL + body to send. Callers own the
 * transport (fetch, axios, the React hook, server-to-server scripts, etc).
 */
export function dispatchBookingStatusChange(
  bookingId: string,
  current: BookingStatus,
  target: BookingStatus,
  note?: string | null,
  options?: { suppressNotifications?: boolean; suppressLifecycleEvents?: boolean },
): BookingStatusDispatchTarget {
  const noteBody = note ? { note } : {}
  // Confirmation and cancellation may both trigger customer-facing messages.
  // Once requested, the service persists suppression across the lifecycle.
  const suppress =
    (target === "confirmed" || target === "cancelled") && options?.suppressNotifications === true
      ? { suppressNotifications: true }
      : {}
  const lifecycleSuppression =
    target === "confirmed" && options?.suppressLifecycleEvents === true
      ? { suppressLifecycleEvents: true }
      : {}

  if (current === "on_hold" && target === "confirmed") {
    return { path: `/v1/admin/bookings/${bookingId}/confirm`, body: { ...noteBody, ...suppress } }
  }
  if (current === "on_hold" && target === "expired") {
    return { path: `/v1/admin/bookings/${bookingId}/expire`, body: noteBody }
  }
  if (current === "confirmed" && target === "in_progress") {
    return { path: `/v1/admin/bookings/${bookingId}/start`, body: noteBody }
  }
  if (current === "in_progress" && target === "completed") {
    return { path: `/v1/admin/bookings/${bookingId}/complete`, body: noteBody }
  }
  if (
    target === "cancelled" &&
    (current === "draft" ||
      current === "on_hold" ||
      current === "confirmed" ||
      current === "in_progress")
  ) {
    return {
      path: `/v1/admin/bookings/${bookingId}/cancel`,
      body: { ...noteBody, ...suppress },
    }
  }

  // The override-status route rejects empty reasons. Callers can pass an
  // explicit note for the audit reason; otherwise generate a concise default
  // so UI flows with optional notes never submit an invalid override payload.
  const defaultReason = `Status override from ${current} to ${target}`
  const reason = note?.trim() || defaultReason
  return {
    path: `/v1/admin/bookings/${bookingId}/override-status`,
    body: {
      status: target,
      reason,
      ...(note ? { note } : {}),
      ...suppress,
      ...lifecycleSuppression,
    },
  }
}
