import { createSaga, type EventBus, sagaStep } from "@voyant-travel/core"
import { lockBookingFinanceInsertionFence } from "@voyant-travel/db/booking-finance-fence"
import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { availabilitySlotsRef } from "../availability-ref.js"
import { bookingActivityLog, bookingAllocations, bookingItems, bookings } from "../schema.js"
import { type BookingStatus, transitionBooking } from "../state-machine.js"

/**
 * Input passed when starting a refund.
 */
export interface RefundBookingInput {
  bookingId: string
  /** Free-form audit reason. Required for ops + customer comms. */
  reason: string
  /**
   * Refund amount in cents. Pass `null` to refund the booking's full
   * `sellAmountCents`; pass a smaller value for a partial refund.
   */
  amountCents?: number | null
  /** User triggering the refund (for audit). */
  userId?: string
}

/**
 * Side-effect dependencies — supplied by the caller. Decouples the saga
 * from finance + transactions + notifications packages so this can ship
 * without those modules being imported.
 *
 * - `createCreditNote` is expected to be transactional internally and to
 *   return a credit note id. Pass a no-op when there's no payment to refund.
 * - `voidCreditNote` is the compensation; it should mark the credit note
 *   void (or delete it) so a retry of the saga doesn't double-credit.
 * - `reverseSupplierOffer` updates linked supplier offer/order rows. May
 *   be a no-op if no transaction link exists.
 * - `notifyCustomer` is fire-and-forget; failures don't trigger
 *   compensation (notifications fail closed elsewhere).
 */
export interface RefundBookingDeps {
  db: PostgresJsDatabase
  eventBus?: EventBus
  createCreditNote: (args: {
    bookingId: string
    amountCents: number
    reason: string
  }) => Promise<{ creditNoteId: string } | null>
  voidCreditNote?: (args: { creditNoteId: string; reason: string }) => Promise<void>
  reverseSupplierOffer?: (args: { bookingId: string; reason: string }) => Promise<void>
  notifyCustomer?: (args: {
    bookingId: string
    reason: string
    amountCents: number
  }) => Promise<void>
}

/**
 * Result captured by each saga step in `ctx.results`.
 */
interface ValidateOutput {
  bookingId: string
  previousStatus: BookingStatus
  fullRefundAmount: number
  refundAmount: number
  bookingNumber: string
}

interface CreditNoteOutput {
  creditNoteId: string | null
  amountCents: number
}

interface InventoryReleaseOutput {
  releasedAllocationIds: string[]
  slotIds: string[]
}

/**
 * Build the refund saga for a booking.
 *
 * **Steps**
 *
 * 1. `validate-state` — load the booking, ensure it's in a refundable
 *    status (`confirmed`, `in_progress`, or `on_hold`), compute the refund
 *    amount. Compensation: none — this step doesn't mutate.
 * 2. `create-credit-note` — call into finance via the injected dep.
 *    Compensation: void the credit note.
 * 3. `release-inventory` — release any held allocations + the slot
 *    capacity (only when the booking hasn't started yet). Compensation:
 *    re-acquire (best-effort; if inventory has since been re-sold,
 *    that's a known limitation logged for ops triage).
 * 4. `reverse-supplier-offer` — best-effort call into transactions.
 *    Compensation: none (idempotent re-call expected if needed).
 * 5. `transition-booking` — flip the booking to `cancelled`. Last
 *    DB-touching step so a failure here doesn't leave the booking
 *    cancelled with no credit-note rollback.
 * 6. `emit` — fire `booking.refunded` after-commit. Best-effort; no
 *    compensation.
 * 7. `notify` — async-style notification. Best-effort; no compensation.
 *
 * The saga always runs in a single host process — durability for async
 * notifications is handled by the notification subscriber/job boundary.
 */
export function buildRefundBookingSaga(deps: RefundBookingDeps) {
  return createSaga("refund-booking", [
    sagaStep<RefundBookingInput, ValidateOutput>("validate-state").run(async (input) => {
      const [row] = await deps.db
        .select({
          id: bookings.id,
          bookingNumber: bookings.bookingNumber,
          status: bookings.status,
          sellAmountCents: bookings.sellAmountCents,
        })
        .from(bookings)
        .where(eq(bookings.id, input.bookingId))
        .limit(1)
      if (!row) {
        throw new Error(`refund-booking: booking ${input.bookingId} not found`)
      }
      if (row.status !== "confirmed" && row.status !== "in_progress" && row.status !== "on_hold") {
        throw new Error(
          `refund-booking: booking ${input.bookingId} is in ${row.status}, not refundable`,
        )
      }
      const fullRefundAmount = row.sellAmountCents ?? 0
      const requested = input.amountCents ?? fullRefundAmount
      if (requested < 0 || requested > fullRefundAmount) {
        throw new Error(
          `refund-booking: requested amount ${requested} out of range [0, ${fullRefundAmount}]`,
        )
      }
      return {
        bookingId: row.id,
        bookingNumber: row.bookingNumber,
        previousStatus: row.status as BookingStatus,
        fullRefundAmount,
        refundAmount: requested,
      }
    }),

    sagaStep<RefundBookingInput, CreditNoteOutput>("create-credit-note")
      .run(async (input, ctx) => {
        const validate = ctx.results["validate-state"] as ValidateOutput
        if (validate.refundAmount === 0) {
          // Draft / unpaid booking — no payment to refund. Short-circuit.
          return { creditNoteId: null, amountCents: 0 }
        }
        const created = await deps.createCreditNote({
          bookingId: input.bookingId,
          amountCents: validate.refundAmount,
          reason: input.reason,
        })
        return {
          creditNoteId: created?.creditNoteId ?? null,
          amountCents: validate.refundAmount,
        }
      })
      .compensate(async (output) => {
        if (output.creditNoteId && deps.voidCreditNote) {
          await deps.voidCreditNote({
            creditNoteId: output.creditNoteId,
            reason: "refund-saga rolled back",
          })
        }
      }),

    sagaStep<RefundBookingInput, InventoryReleaseOutput>("release-inventory")
      .run(async (input) => {
        return await deps.db.transaction(async (tx) => {
          const allocs = await tx
            .select()
            .from(bookingAllocations)
            .where(eq(bookingAllocations.bookingId, input.bookingId))

          const releaseable = allocs.filter((a) => a.status === "held" || a.status === "confirmed")

          for (const allocation of releaseable) {
            if (allocation.availabilitySlotId) {
              // Best-effort capacity release — restore the held quantity.
              await tx
                .update(availabilitySlotsRef)
                .set({
                  // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
                  remainingPax: sql`${availabilitySlotsRef.remainingPax} + ${allocation.quantity}`,
                })
                .where(eq(availabilitySlotsRef.id, allocation.availabilitySlotId))
            }
          }

          if (releaseable.length > 0) {
            const releaseableIds = releaseable.map((a) => a.id)
            await tx
              .update(bookingAllocations)
              .set({ status: "released", releasedAt: new Date(), updatedAt: new Date() })
              .where(
                // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
                sql`${bookingAllocations.id} IN (${sql.join(
                  // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
                  releaseableIds.map((id) => sql`${id}`),
                  sql`, `,
                )})`,
              )
          }

          await tx
            .update(bookingItems)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(eq(bookingItems.bookingId, input.bookingId))

          return {
            releasedAllocationIds: releaseable.map((a) => a.id),
            slotIds: releaseable
              .map((a) => a.availabilitySlotId)
              .filter((id): id is string => Boolean(id)),
          }
        })
      })
      .compensate(async (output) => {
        // Re-decrement the slots we restored. Note: if the slot has since
        // been re-sold this will fail loudly — that's intentional, an
        // operator must intervene.
        if (output.slotIds.length === 0) return
        await deps.db.transaction(async (tx) => {
          for (const slotId of output.slotIds) {
            await tx
              .update(availabilitySlotsRef)
              // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
              .set({ remainingPax: sql`${availabilitySlotsRef.remainingPax} - 1` })
              .where(eq(availabilitySlotsRef.id, slotId))
          }
        })
      }),

    sagaStep<RefundBookingInput, { reversed: boolean }>("reverse-supplier-offer").run(
      async (input) => {
        if (!deps.reverseSupplierOffer) return { reversed: false }
        await deps.reverseSupplierOffer({ bookingId: input.bookingId, reason: input.reason })
        return { reversed: true }
      },
    ),

    sagaStep<RefundBookingInput, { status: BookingStatus }>("transition-booking").run(
      async (input, ctx) => {
        const validate = ctx.results["validate-state"] as ValidateOutput
        await deps.db.transaction(async (tx) => {
          await lockBookingFinanceInsertionFence(tx, input.bookingId)
          const lockedRows = await tx.execute(
            sql`SELECT status::text AS status
                FROM ${bookings}
                WHERE ${bookings.id} = ${input.bookingId}
                FOR UPDATE`,
          )
          const rows = Array.isArray(lockedRows)
            ? lockedRows
            : ((lockedRows as { rows?: unknown[] }).rows ?? [])
          const previousStatus = (rows[0] as { status?: BookingStatus } | undefined)?.status
          if (!previousStatus) {
            throw new Error(`refund-booking: booking ${input.bookingId} not found`)
          }
          const patch = transitionBooking(previousStatus, "cancelled")

          await tx
            .update(bookings)
            .set({ ...patch, updatedAt: new Date() })
            .where(eq(bookings.id, input.bookingId))
          await tx.insert(bookingActivityLog).values({
            bookingId: input.bookingId,
            actorId: input.userId ?? "system",
            activityType: "status_change",
            description: `Refunded from ${previousStatus}: ${input.reason}`,
            metadata: {
              oldStatus: previousStatus,
              newStatus: "cancelled",
              refundAmountCents: validate.refundAmount,
              reason: input.reason,
            },
          })
        })
        return { status: "cancelled" }
      },
    ),

    sagaStep<RefundBookingInput, { emitted: boolean }>("emit").run(async (input, ctx) => {
      const validate = ctx.results["validate-state"] as ValidateOutput
      if (!deps.eventBus) return { emitted: false }
      await deps.eventBus.emit(
        "booking.refunded",
        {
          bookingId: input.bookingId,
          bookingNumber: validate.bookingNumber,
          previousStatus: validate.previousStatus,
          refundAmountCents: validate.refundAmount,
          reason: input.reason,
          actorId: input.userId ?? null,
        },
        { category: "domain", source: "service" },
      )
      return { emitted: true }
    }),

    sagaStep<RefundBookingInput, { notified: boolean }>("notify").run(async (input, ctx) => {
      if (!deps.notifyCustomer) return { notified: false }
      const validate = ctx.results["validate-state"] as ValidateOutput
      try {
        await deps.notifyCustomer({
          bookingId: input.bookingId,
          reason: input.reason,
          amountCents: validate.refundAmount,
        })
      } catch {
        // Notifications are best-effort. Log via the deployment's logger.
        return { notified: false }
      }
      return { notified: true }
    }),
  ])
}

/**
 * Convenience wrapper: build + run the saga in one call.
 */
export async function refundBooking(input: RefundBookingInput, deps: RefundBookingDeps) {
  const saga = buildRefundBookingSaga(deps)
  return saga.run({ input })
}
