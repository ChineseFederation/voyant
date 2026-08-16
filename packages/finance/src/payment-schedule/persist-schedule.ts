/**
 * The one write that establishes a booking's collection plan.
 *
 * Three things have to happen together, and a caller that does only the first
 * leaves the booking half-scheduled in a way nothing later repairs:
 *
 * 1. the schedule rows themselves
 * 2. the `__payment_policy_source__` marker, which the contract resolver echoes
 *    as `booking.paymentPolicy.source`
 * 3. the `payment_schedule_regenerated` activity entry, which is what the
 *    operator's payment-policy card reads to show the cascade-source history —
 *    it filters `booking_activity_log` on exactly that `metadata.kind`
 *
 * Both writers go through here so they cannot diverge. `generatePaymentScheduleForBooking`
 * (the `booking.confirmed` subscriber) returns early once any schedule row
 * exists, so whichever path runs first is the only one that ever writes: a
 * Session Commit that wrote rows without (3) would leave the operator's history
 * permanently empty for that booking, with no later pass to backfill it
 * (voyant#4743).
 */
import { bookingActivityLog } from "@voyant-travel/bookings/schema"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type {
  ComputedScheduleEntry,
  PaymentPolicy,
  PaymentPolicySource,
} from "../payment-policy.js"
import { stampPolicySourceOnBooking } from "../payment-policy-cascade.js"
import { financeService } from "../service.js"

/** A collection plan and the cascade decision behind it. */
export interface ResolvedBookingPaymentSchedule {
  policy: PaymentPolicy
  source: PaymentPolicySource
  entries: ComputedScheduleEntry[]
}

export interface PersistBookingPaymentScheduleOptions {
  /**
   * Clear outstanding rows first. True for a regeneration, which is replacing a
   * plan; false when establishing one for a booking that has none.
   */
  replace?: boolean
  /**
   * How the activity entry reads. The default says "regenerated", which is
   * accurate for the subscriber and misleading for a first write at Commit, so
   * that caller states its own. `metadata.kind` never varies — the operator's
   * card filters on it.
   */
  description?: string
  /**
   * Where the marker is written. Injected by the route module, which resolves
   * it through its deployment options; defaults to the owning implementation.
   */
  stampPolicySource?: (
    db: PostgresJsDatabase,
    bookingId: string,
    source: PaymentPolicySource,
  ) => Promise<void>
}

export async function persistResolvedBookingPaymentSchedule(
  db: PostgresJsDatabase,
  bookingId: string,
  resolved: ResolvedBookingPaymentSchedule,
  options: PersistBookingPaymentScheduleOptions = {},
): Promise<void> {
  const { policy, source, entries } = resolved

  await financeService.applyComputedPaymentSchedule(db, bookingId, entries, {
    replace: options.replace ?? true,
  })

  await (options.stampPolicySource ?? stampPolicySourceOnBooking)(db, bookingId, source)

  await db.insert(bookingActivityLog).values({
    bookingId,
    actorId: "system",
    activityType: "system_action",
    description:
      options.description ??
      `Payment schedule regenerated from ${source} policy (${entries.length} row${
        entries.length === 1 ? "" : "s"
      })`,
    metadata: {
      kind: "payment_schedule_regenerated",
      policySource: source,
      policy,
      entries,
    },
  })
}
