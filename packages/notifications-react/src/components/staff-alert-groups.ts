/**
 * Presentation order for the staff alert groups, shared by the admin settings
 * page and the per-user preferences page.
 *
 * Shared on purpose: the two screens list the same alerts, and users move
 * between them. Letting each keep its own copy is how they drift into showing
 * the same data in two different orders.
 *
 * Sales leads because a first response to an enquiry is the most time-critical
 * thing on the list.
 */
export const STAFF_ALERT_GROUP_ORDER = ["sales", "bookings", "finance", "legal"] as const

export type StaffAlertGroupKey = (typeof STAFF_ALERT_GROUP_ORDER)[number]
