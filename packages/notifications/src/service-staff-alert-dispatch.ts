/**
 * Fan one domain event out to the staff who asked to hear about it.
 *
 * The dispatcher owns sequencing and idempotency. It owns neither the data the
 * email shows (resolvers, supplied by the deployment) nor the operator's
 * identity (`operator_profile` belongs to `operator-settings`, so the brand is
 * supplied by the deployment too — reading it here would open a
 * `notifications->operator-settings` table-privacy pair that does not exist).
 */

import { randomUUID } from "node:crypto"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { StaffAlertBrand } from "./emails/brand.js"
import { renderStaffAlertEmail } from "./emails/render.js"
import { sampleStaffAlertContext } from "./emails/samples.js"
import type { notificationTargetTypeEnum } from "./schema.js"
import { enqueueNotification } from "./service-durable-send.js"
import type { NotificationService } from "./service-shared.js"
import {
  findStaffUserEmail,
  resolveStaffAlertRecipients,
} from "./service-staff-alert-recipients.js"
import { getStaffAlertSetting, listStaffAlertOptOutUserIds } from "./service-staff-alerts.js"
import {
  getStaffAlertDefinition,
  type StaffAlertContextMap,
  type StaffAlertContextResolverRegistry,
  type StaffAlertEventKey,
} from "./staff-alert-registry.js"

type NotificationTargetType = (typeof notificationTargetTypeEnum.enumValues)[number]

/** Deployment-owned services the staff alert path needs. */
export interface StaffAlertRuntime {
  dispatcher: NotificationService
  resolvers: StaffAlertContextResolverRegistry
  /** Operator identity for the email shell. Resolved once per dispatch. */
  resolveBrand(db: PostgresJsDatabase): Promise<StaffAlertBrand>
}

export const STAFF_ALERT_RUNTIME_KEY = "notifications.staffAlertRuntime"

export interface DispatchStaffAlertInput {
  db: PostgresJsDatabase
  runtime: StaffAlertRuntime
  eventKey: StaffAlertEventKey
  /** Raw domain event payload. */
  payload: Record<string, unknown>
  /**
   * Event bus envelope id. The idempotency key is derived from it, so a
   * redelivered event collapses onto the original send rather than mailing
   * everyone twice.
   */
  eventId: string
  /**
   * Seam for tests. Staff alerts carry a `templateLabel` rather than a
   * `templateSlug` precisely because they have no row in
   * `notification_templates`; sending the slug instead makes every staff alert
   * fail with "Notification template not found". Injecting the enqueue lets a
   * test pin that, which is otherwise only observable against a live database.
   */
  enqueue?: typeof enqueueNotification
}

export interface DispatchStaffAlertResult {
  /** Why nothing was sent, when nothing was. */
  skipped: "disabled" | "no-resolver" | "no-context" | "no-recipients" | null
  enqueued: number
}

/**
 * How a resolved context maps onto the delivery ledger's target columns, so a
 * staff alert is findable from the record it is about.
 */
function targetFor(
  eventKey: StaffAlertEventKey,
  context: StaffAlertContextMap[StaffAlertEventKey],
): {
  targetType: NotificationTargetType
  targetId: string | null
  bookingId: string | null
  invoiceId: string | null
  paymentSessionId: string | null
} {
  const empty = { bookingId: null, invoiceId: null, paymentSessionId: null }

  switch (eventKey) {
    case "staff.booking.confirmed":
    case "staff.booking.cancelled": {
      const typed = context as StaffAlertContextMap["staff.booking.confirmed"]
      return {
        ...empty,
        targetType: "booking",
        targetId: typed.bookingId,
        bookingId: typed.bookingId,
      }
    }
    case "staff.booking.inquiry-created": {
      const typed = context as StaffAlertContextMap["staff.booking.inquiry-created"]
      return { ...empty, targetType: "other", targetId: typed.inquiryId }
    }
    case "staff.payment.completed": {
      const typed = context as StaffAlertContextMap["staff.payment.completed"]
      return {
        ...empty,
        targetType: "payment_session",
        targetId: typed.paymentSessionId,
        bookingId: typed.bookingId,
        paymentSessionId: typed.paymentSessionId,
      }
    }
    case "staff.payment.settlement-stranded": {
      const typed = context as StaffAlertContextMap["staff.payment.settlement-stranded"]
      return {
        ...empty,
        targetType: "payment_session",
        targetId: typed.paymentSessionId,
        paymentSessionId: typed.paymentSessionId,
      }
    }
    case "staff.invoice.settled": {
      const typed = context as StaffAlertContextMap["staff.invoice.settled"]
      return {
        ...empty,
        targetType: "invoice",
        targetId: typed.invoiceId,
        bookingId: typed.bookingId,
        invoiceId: typed.invoiceId,
      }
    }
    case "staff.contract.signed": {
      const typed = context as StaffAlertContextMap["staff.contract.signed"]
      return {
        ...empty,
        targetType: "other",
        targetId: typed.contractId,
        bookingId: typed.bookingId,
      }
    }
    case "staff.customer-signal.created": {
      const typed = context as StaffAlertContextMap["staff.customer-signal.created"]
      // `notification_target_type` has no customer-signal value. Rather than
      // migrate the enum for one alert, record `other` and keep the signal id
      // in `target_id` where the ledger can still be filtered on it.
      return { ...empty, targetType: "other", targetId: typed.signalId }
    }
    default: {
      const exhaustive: never = eventKey
      throw new Error(`No delivery target mapping for "${String(exhaustive)}".`)
    }
  }
}

export async function dispatchStaffAlert(
  input: DispatchStaffAlertInput,
): Promise<DispatchStaffAlertResult> {
  const { db, runtime, eventKey } = input
  const enqueue = input.enqueue ?? enqueueNotification

  const definition = getStaffAlertDefinition(eventKey)
  if (!definition) return { skipped: "disabled", enqueued: 0 }

  const setting = await getStaffAlertSetting(db, eventKey)
  if (!setting.enabled) return { skipped: "disabled", enqueued: 0 }

  const resolver = runtime.resolvers[eventKey]
  if (!resolver) return { skipped: "no-resolver", enqueued: 0 }

  const context = await resolver.resolve({ db, payload: input.payload })
  if (!context) return { skipped: "no-context", enqueued: 0 }

  const optedOutUserIds = await listStaffAlertOptOutUserIds(db, eventKey)
  const recipients = await resolveStaffAlertRecipients({
    db,
    setting,
    assigneeUserId: context.assigneeUserId,
    actorUserId: context.actorUserId,
    optedOutUserIds,
  })
  if (recipients.length === 0) return { skipped: "no-recipients", enqueued: 0 }

  const brand = await runtime.resolveBrand(db)
  const target = targetFor(eventKey, context)

  let enqueued = 0
  for (const recipient of recipients) {
    // Each recipient's locale changes the rendered body, so rendering is per
    // recipient rather than hoisted. The template call is pure, so this costs
    // CPU rather than round trips.
    const rendered = await renderStaffAlertEmail({
      eventKey,
      context,
      brand: { ...brand, locale: recipient.locale ?? brand.locale },
      isAssignee: recipient.isAssignee,
    })

    await enqueue({
      db,
      registry: runtime.dispatcher,
      input: {
        idempotencyKey: `staff-alert:${input.eventId}:${eventKey}:${recipient.email}`,
        templateLabel: definition.templateSlug,
        channel: "email",
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        targetType: target.targetType,
        targetId: target.targetId,
        bookingId: target.bookingId,
        invoiceId: target.invoiceId,
        paymentSessionId: target.paymentSessionId,
        metadata: {
          staffAlert: true,
          eventKey,
          staffUserId: recipient.userId,
          isAssignee: recipient.isAssignee,
        },
      },
    })
    enqueued += 1
  }

  return { skipped: null, enqueued }
}

export interface SendStaffAlertTestInput {
  db: PostgresJsDatabase
  runtime: StaffAlertRuntime
  eventKey: StaffAlertEventKey
  /** The staff user asking for the test — the only person it is sent to. */
  userId: string | null
}

export interface SendStaffAlertTestResult {
  sent: boolean
  recipient: string | null
  reason: string | null
}

/**
 * Send one alert to the requesting user, using sample data.
 *
 * Deliberately ignores the alert's enabled flag and routing: the point is to
 * check that the sending domain works and the layout reads well BEFORE
 * switching an alert on. It also never fans out — a test that mailed the whole
 * team would be worse than no test.
 */
export async function sendStaffAlertTest(
  input: SendStaffAlertTestInput,
): Promise<SendStaffAlertTestResult> {
  const definition = getStaffAlertDefinition(input.eventKey)
  if (!definition) return { sent: false, recipient: null, reason: "unknown_alert" }
  if (!input.userId) return { sent: false, recipient: null, reason: "no_current_user" }

  const recipient = await findStaffUserEmail(input.db, input.userId)
  if (!recipient) return { sent: false, recipient: null, reason: "no_email_on_account" }

  const brand = await input.runtime.resolveBrand(input.db)
  const context = sampleStaffAlertContext(input.eventKey)
  const rendered = await renderStaffAlertEmail({
    eventKey: input.eventKey,
    context,
    brand: { ...brand, locale: recipient.locale ?? brand.locale },
    isAssignee: false,
  })

  try {
    await enqueueNotification({
      db: input.db,
      registry: input.runtime.dispatcher,
      input: {
        // Time-independent keys would collapse a second test onto the first,
        // so the key carries the request's own nonce. `randomUUID` is fine
        // here: unlike the subscriber path there is no redelivery to dedupe.
        idempotencyKey: `staff-alert-test:${input.eventKey}:${randomUUID()}`,
        templateLabel: definition.templateSlug,
        channel: "email",
        to: recipient.email,
        subject: `[Test] ${rendered.subject}`,
        html: rendered.html,
        text: rendered.text,
        targetType: "other",
        targetId: null,
        metadata: { staffAlert: true, staffAlertTest: true, eventKey: input.eventKey },
      },
    })
  } catch (error) {
    // The usual cause is an unconfigured sending domain, which
    // `resolveDeliverySender` reports by throwing. Surfacing it on the settings
    // page is the whole reason this action exists.
    return {
      sent: false,
      recipient: recipient.email,
      reason: error instanceof Error ? error.message : "send_failed",
    }
  }

  return { sent: true, recipient: recipient.email, reason: null }
}
