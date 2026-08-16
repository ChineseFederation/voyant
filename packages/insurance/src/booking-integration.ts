/**
 * Everything this module does to a booking, in one file.
 *
 * Three different couplings live here and they are not equally cheap, so
 * keeping them together makes the cost visible rather than scattering it:
 *
 * 1. Booking activity goes through `recordBookingSystemActivity`, bookings' own
 *    service, rather than an insert into `booking_activity_log` from here.
 *    `commerce` and `finance` do write that table directly, but those pairs are
 *    baselined and `verify:table-privacy` holds a stricter line for anything
 *    new: no new pair, no new write. `activityType: "system_action"` with a
 *    `metadata.event` discriminator — never a new enum member, because
 *    `booking_activity_type` describes what happened to the BOOKING, and every
 *    module adding its own vocabulary to it is how that enum stops meaning
 *    anything.
 * 2. The policy certificate is recorded through `recordBookingDocument`, the
 *    one sanctioned path, so an insurance certificate is audited exactly like a
 *    document a person uploaded. `type: "insurance"` is deliberate reuse: the
 *    enum member already exists for traveller-supplied insurance paperwork, and
 *    a platform-delivered certificate is the same kind of thing to everyone
 *    downstream.
 * 3. Notifications and staff alerts are NOT called directly. This module does
 *    not depend on `@voyant-travel/notifications` and must not: the seam runs
 *    the other way, with notifications declaring what it needs and the
 *    deployment satisfying it (see `staff-alert-registry.ts` there). So both are
 *    narrow callbacks the deployment binds, and the shapes they carry are
 *    declared below.
 */

import { recordBookingSystemActivity } from "@voyant-travel/bookings"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

/** Discriminators written into `booking_activity_log.metadata.event`. */
export const INSURANCE_BOOKING_ACTIVITY_EVENTS = {
  applied: "insurance.application.opened",
  issued: "insurance.policy.issued",
  issueFailed: "insurance.policy.issue-failed",
  /** An operator asked the insurer again by hand. */
  issueRetried: "insurance.policy.issue-retried",
  cancelled: "insurance.policy.cancelled",
} as const

export type InsuranceBookingActivityEvent =
  (typeof INSURANCE_BOOKING_ACTIVITY_EVENTS)[keyof typeof INSURANCE_BOOKING_ACTIVITY_EVENTS]

export async function recordInsuranceBookingActivity(
  db: PostgresJsDatabase,
  bookingId: string,
  entry: {
    event: InsuranceBookingActivityEvent
    description: string
    actorId?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await recordBookingSystemActivity(db, {
    bookingId,
    event: entry.event,
    description: entry.description,
    actorId: entry.actorId ?? null,
    ...(entry.metadata ? { metadata: entry.metadata } : {}),
  })
}

/**
 * What the deployment binds so an issued certificate reaches the traveller.
 *
 * Modelled on notifications' `sendBookingDocumentsNotification`, which is what
 * the binding calls. Deliberately not that signature: it takes a dispatcher, a
 * template and a runtime options bag, none of which insurance knows anything
 * about, and taking them here would put the notification module's shape inside
 * the insurance module's types.
 */
export interface InsuranceDocumentNotifier {
  /**
   * Deliver the documents just recorded against the booking. Best effort: a
   * failure here must never unwind an issued policy, so implementations resolve
   * with a status rather than throwing.
   */
  sendIssuedPolicyDocuments(input: {
    bookingId: string
    policyId: string
    documentIds: readonly string[]
  }): Promise<{ status: "sent" | "skipped" | "failed"; detail?: string }>
}

/**
 * The context a staff alert about a failed issue needs.
 *
 * Declared here, satisfied by the deployment — the same direction as every
 * other staff alert (`packages/notifications/src/staff-alert-registry.ts`
 * explains why: notifications may not read another module's tables, so the
 * owning module declares the shape and `apps/operator` registers the resolver).
 *
 * The fields are chosen for the one situation this alert exists for: the
 * traveller has been charged and has no policy. So the amount charged and
 * whether a retry could work are on the alert itself, not a link away.
 */
export interface InsuranceIssueFailedAlertContext {
  /** Root-relative deep link into the admin. */
  adminPath: string
  bookingId: string
  bookingNumber: string | null
  policyId: string
  applicationId: string
  providerId: string
  providerLabel: string | null
  premium: { amountMinor: number; currency: string }
  /** Whether the money had already been taken when the issue failed. */
  paid: boolean
  failureCode: string
  failureMessage: string
  retryable: boolean
  occurredAt: string
}

export const INSURANCE_ISSUE_FAILED_ALERT_EVENT = "staff.insurance.issue-failed" as const

/** What the deployment binds to raise the alert. */
export interface InsuranceStaffAlertRaiser {
  raiseIssueFailed(context: InsuranceIssueFailedAlertContext): Promise<void>
}

/**
 * How the certificate is recorded on the booking.
 *
 * A function rather than the `recordBookingDocument` import itself, so the
 * caller supplies the action-ledger request context it already holds and this
 * module never has to invent a principal for a background fulfilment.
 */
export interface InsuranceBookingDocumentRecorder {
  record(input: {
    bookingId: string
    fileName: string
    fileUrl: string
    issuedBy: string
    issuedNumber: string | null
    issuedAt: string | null
    notes: string | null
  }): Promise<{ documentId: string; replayed: boolean } | null>
}

/** The booking-facing collaborators the insurance services accept. */
export interface InsuranceBookingIntegration {
  documents?: InsuranceBookingDocumentRecorder
  notifier?: InsuranceDocumentNotifier
  staffAlerts?: InsuranceStaffAlertRaiser
}
