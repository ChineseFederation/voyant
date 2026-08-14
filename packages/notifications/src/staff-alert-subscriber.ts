/**
 * One subscriber per staff alert, all built from the same factory.
 *
 * Adding an alert is a registry entry plus a template — this file does not grow.
 */

import type { SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  dispatchStaffAlert,
  STAFF_ALERT_RUNTIME_KEY,
  type StaffAlertRuntime,
} from "./service-staff-alert-dispatch.js"
import { STAFF_ALERT_DEFINITIONS, type StaffAlertEventKey } from "./staff-alert-registry.js"

export { STAFF_ALERT_RUNTIME_KEY } from "./service-staff-alert-dispatch.js"

/** Deployment-owned wiring, resolved from the container at event time. */
export interface StaffAlertSubscriberRuntime extends StaffAlertRuntime {
  resolveDb(bindings: unknown): PostgresJsDatabase
}

export interface StaffAlertSubscriberDependencies {
  dispatch?: typeof dispatchStaffAlert
  logger?: Pick<Console, "error">
}

export function staffAlertSubscriberId(eventKey: StaffAlertEventKey): string {
  return `@voyant-travel/notifications#subscriber.${eventKey}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function createStaffAlertSubscriberRuntime(
  eventKey: StaffAlertEventKey,
  dependencies: StaffAlertSubscriberDependencies = {},
): SubscriberRuntimeDescriptor {
  const definition = STAFF_ALERT_DEFINITIONS.find((entry) => entry.key === eventKey)
  if (!definition) throw new Error(`Unknown staff alert "${eventKey}".`)

  const dispatch = dependencies.dispatch ?? dispatchStaffAlert
  const logger = dependencies.logger ?? console

  return {
    id: staffAlertSubscriberId(eventKey),
    eventType: definition.eventType,
    register: ({ bindings, container, eventBus }) => {
      eventBus.subscribe<Record<string, unknown>>(definition.eventType, async (event) => {
        try {
          // A deployment that has not wired staff alerts is not misconfigured —
          // the feature is opt-in — so an absent runtime is silence, not a throw.
          if (!container.has(STAFF_ALERT_RUNTIME_KEY)) return

          const runtime = container.resolve<StaffAlertSubscriberRuntime>(STAFF_ALERT_RUNTIME_KEY)
          const eventId = resolveEventId(event)
          if (!eventId) return

          await dispatch({
            db: runtime.resolveDb(bindings),
            runtime,
            eventKey,
            payload: event.data ?? {},
            eventId,
          })
        } catch (error) {
          // Swallowed deliberately. This subscriber runs in the same flow that
          // confirmed the booking or settled the invoice; a failed staff alert
          // must never roll that back.
          logger.error(`[notifications] staff alert "${eventKey}" failed: ${errorMessage(error)}`)
        }
      })
    },
  }
}

/**
 * The envelope id the event bus stamps on every publish.
 *
 * Without one there is no stable idempotency key, and a redelivery would mail
 * every recipient a second time — so a missing id means skip, not send.
 */
function resolveEventId(event: { metadata?: unknown }): string | null {
  const metadata = event.metadata
  if (!metadata || typeof metadata !== "object") return null
  const candidate = (metadata as { eventId?: unknown }).eventId
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null
}

/**
 * One named export per alert.
 *
 * The deployment graph binds `runtime.export` to a symbol name, so each
 * subscriber needs its own binding — the array below is for tests and for
 * hosts that register the whole set at once.
 */
export const notificationsStaffBookingConfirmedAlertSubscriber =
  createStaffAlertSubscriberRuntime("staff.booking.confirmed")
export const notificationsStaffBookingCancelledAlertSubscriber =
  createStaffAlertSubscriberRuntime("staff.booking.cancelled")
export const notificationsStaffBookingInquiryCreatedAlertSubscriber =
  createStaffAlertSubscriberRuntime("staff.booking.inquiry-created")
export const notificationsStaffPaymentCompletedAlertSubscriber =
  createStaffAlertSubscriberRuntime("staff.payment.completed")
export const notificationsStaffPaymentSettlementStrandedAlertSubscriber =
  createStaffAlertSubscriberRuntime("staff.payment.settlement-stranded")
export const notificationsStaffInvoiceSettledAlertSubscriber =
  createStaffAlertSubscriberRuntime("staff.invoice.settled")
export const notificationsStaffContractSignedAlertSubscriber =
  createStaffAlertSubscriberRuntime("staff.contract.signed")
export const notificationsStaffCustomerSignalCreatedAlertSubscriber =
  createStaffAlertSubscriberRuntime("staff.customer-signal.created")

export const staffAlertSubscriberRuntimeDescriptors = [
  notificationsStaffBookingConfirmedAlertSubscriber,
  notificationsStaffBookingCancelledAlertSubscriber,
  notificationsStaffBookingInquiryCreatedAlertSubscriber,
  notificationsStaffPaymentCompletedAlertSubscriber,
  notificationsStaffPaymentSettlementStrandedAlertSubscriber,
  notificationsStaffInvoiceSettledAlertSubscriber,
  notificationsStaffContractSignedAlertSubscriber,
  notificationsStaffCustomerSignalCreatedAlertSubscriber,
] as const
