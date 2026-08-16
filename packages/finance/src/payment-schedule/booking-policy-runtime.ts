/**
 * Reach the injected policy cascade from a route that isn't the
 * booking-schedule route module.
 *
 * The cascade readers are deployment-supplied and land in the module
 * container under {@link BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY} (the
 * booking-schedule extension's bootstrap registers them there for the
 * `booking.confirmed` subscriber). The `default-plan` route and the checkout
 * collection runtime need the same answer, so they read the same registration
 * instead of growing a second injection point that a deployment could wire
 * differently — which is how voyant#4744 happened in the first place.
 */

import type { ModuleContainer } from "@voyant-travel/core"

import {
  BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY,
  type BookingScheduleSubscriberRuntime,
} from "../booking-schedule/subscriber-runtime.js"
import type { BookingPaymentPolicyCascadeReaders } from "./booking-policy.js"

/**
 * The cascade readers this deployment composed, or `null` when it composes no
 * booking-schedule extension.
 *
 * `null` is not a fallback to some other plan — callers treat an absent
 * cascade as `noDepositPolicy`, the documented safe default for an
 * unconfigured operator. A deployment that never configured a deposit gets
 * "pay in full", not someone's guess at 30%.
 */
export async function resolveBookingPaymentPolicyCascade(
  container: ModuleContainer | undefined,
  bindings: unknown,
): Promise<BookingPaymentPolicyCascadeReaders | null> {
  if (!container?.has(BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY)) return null

  try {
    const runtime = container.resolve<BookingScheduleSubscriberRuntime>(
      BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY,
    )
    return await runtime.resolveRoutesOptions(bindings)
  } catch {
    return null
  }
}
