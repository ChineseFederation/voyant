import type { BookingsFinanceRuntime } from "@voyant-travel/bookings/runtime-port"
import { and, eq } from "drizzle-orm"

import type { ResolveBookingTaxSettings } from "./booking-tax.js"
import { computeBookingItemTaxLine, resolveBookingSellTaxRate } from "./booking-tax.js"
import { bookingPaymentSchedules, financeAmendmentAdjustments } from "./schema.js"
import { toDateString } from "./service-shared.js"
import { travelCreditsService } from "./service-travel-credits.js"

export const BOOKING_AMENDMENT_FINANCE_POLICY_VERSION = "booking-amendment-finance-v1"

export function createBookingAmendmentFinanceRuntime(
  options: { resolveBookingTaxSettings?: ResolveBookingTaxSettings } = {},
): Pick<BookingsFinanceRuntime, "quoteBookingAmendment" | "recordBookingAmendment"> {
  return {
    async quoteBookingAmendment(db, input) {
      const quotedLines = await Promise.all(
        input.lines.map(async (line, index) => {
          const sign = Math.sign(line.subtotalDeltaCents)
          const taxRate = await resolveBookingSellTaxRate(
            db,
            { productId: line.productId },
            { resolveBookingTaxSettings: options.resolveBookingTaxSettings },
          )
          const unsignedTax = computeBookingItemTaxLine(
            taxRate,
            Math.abs(line.subtotalDeltaCents),
            input.currency,
            index,
          )
          const signedTaxCents = (unsignedTax?.amountCents ?? 0) * sign
          return {
            bookingItemId: line.bookingItemId,
            subtotalDeltaCents:
              unsignedTax?.includedInPrice === true
                ? line.subtotalDeltaCents - signedTaxCents
                : line.subtotalDeltaCents,
            taxDeltaCents: signedTaxCents,
            taxAddsToTotal: unsignedTax?.includedInPrice !== true,
            taxLine: unsignedTax
              ? {
                  bookingItemId: line.bookingItemId,
                  code: unsignedTax.code ?? null,
                  name: unsignedTax.name,
                  amountCents: signedTaxCents,
                  rateBasisPoints: unsignedTax.rateBasisPoints ?? null,
                  includedInPrice: unsignedTax.includedInPrice,
                }
              : null,
          }
        }),
      )

      const subtotalDeltaCents = quotedLines.reduce((sum, line) => sum + line.subtotalDeltaCents, 0)
      const taxDeltaCents = quotedLines.reduce((sum, line) => sum + line.taxDeltaCents, 0)
      // Passed through untaxed. A change fee is a service charge whose tax
      // treatment differs by jurisdiction from the travel it attaches to,
      // and guessing it wrong is worse than leaving it explicit — the
      // operator sets a gross figure today.
      const feeDeltaCents = input.feeDeltaCents ?? 0
      const amountCents = input.lines.reduce(
        (sum, line, index) =>
          sum +
          line.subtotalDeltaCents +
          (quotedLines[index]?.taxAddsToTotal ? (quotedLines[index]?.taxDeltaCents ?? 0) : 0),
        feeDeltaCents,
      )
      const collectionAmountCents = Math.max(amountCents, 0)
      const refundAmountCents = Math.max(-amountCents, 0)

      return {
        price: {
          currency: input.currency,
          subtotalDeltaCents,
          feeDeltaCents,
          taxDeltaCents,
          amountCents,
          collectionAmountCents,
          refundAmountCents,
          taxLines: quotedLines.flatMap((line) => (line.taxLine ? [line.taxLine] : [])),
        },
        consequences: {
          collection: collectionAmountCents > 0 ? "required" : "not_required",
          refund: refundAmountCents > 0 ? "required" : "not_required",
          invoice: collectionAmountCents > 0 ? "reissue_required" : "not_required",
          creditNote: refundAmountCents > 0 ? "issue_required" : "not_required",
          paymentSchedule: amountCents === 0 ? "not_required" : "recalculate_required",
        },
        policyVersion: BOOKING_AMENDMENT_FINANCE_POLICY_VERSION,
      }
    },

    async recordBookingAmendment(tx, input) {
      const status =
        input.price.collectionAmountCents > 0
          ? ("collection_required" as const)
          : input.price.refundAmountCents > 0
            ? ("refund_required" as const)
            : ("no_action" as const)
      const [created] = await tx
        .insert(financeAmendmentAdjustments)
        .values({
          amendmentId: input.amendmentId,
          bookingId: input.bookingId,
          idempotencyKey: input.idempotencyKey,
          currency: input.price.currency,
          subtotalDeltaCents: input.price.subtotalDeltaCents,
          feeDeltaCents: input.price.feeDeltaCents,
          taxDeltaCents: input.price.taxDeltaCents,
          totalDeltaCents: input.price.amountCents,
          collectionAmountCents: input.price.collectionAmountCents,
          refundAmountCents: input.price.refundAmountCents,
          status,
          consequences: input.consequences,
          reason: input.reason,
        })
        .onConflictDoNothing({ target: financeAmendmentAdjustments.amendmentId })
        .returning({ id: financeAmendmentAdjustments.id })
      if (created) {
        // The adjustment is a ledger fact; on its own nobody can act on
        // it. Raising the matching obligation is what puts the delta in
        // front of an operator — `CollectPaymentDialog` offers open
        // schedules as pre-fills, so the amount to collect stops being
        // something read off one screen and retyped into another.
        //
        // Only on the freshly-created branch: a replay must not bill twice.
        // The partial unique index on `amendment_id` is the backstop.
        if (input.price.refundAmountCents > 0 && input.refundHandling === "travel_credit") {
          // The operator chose to hold the difference rather than pay it
          // out. `sourceType: "refund"` is the closest existing member of
          // `travel_credit_source_type` — the credit does arise from money
          // owed back — and `sourceBookingId` plus the reason keep the
          // amendment traceable without widening a Postgres enum.
          await travelCreditsService.create(tx, {
            currency: input.price.currency,
            amountCents: input.price.refundAmountCents,
            sourceType: "refund",
            sourceBookingId: input.bookingId,
            // Supplied by the caller, which already has the booking row
            // locked. Re-reading it here would add a finance->bookings
            // reach-in for a field the amendment engine can just hand over.
            issuedToPersonId: input.issuedToPersonId ?? null,
            notes: input.reason,
          })
        }
        if (input.price.collectionAmountCents > 0) {
          const dueDate = toDateString(input.now ?? new Date())
          await tx.insert(bookingPaymentSchedules).values({
            bookingId: input.bookingId,
            amendmentId: input.amendmentId,
            scheduleType: "other",
            // The amendment is being applied now, so the money is owed
            // now — not at some future planned instalment date.
            status: "due",
            dueDate,
            dueTimeZone: "UTC",
            currency: input.price.currency,
            amountCents: input.price.collectionAmountCents,
            notes: input.reason,
          })
        }
        return { adjustmentId: created.id, status: "recorded" }
      }

      const [existing] = await tx
        .select()
        .from(financeAmendmentAdjustments)
        .where(
          and(
            eq(financeAmendmentAdjustments.amendmentId, input.amendmentId),
            eq(financeAmendmentAdjustments.bookingId, input.bookingId),
          ),
        )
        .limit(1)
      if (
        !existing ||
        existing.idempotencyKey !== input.idempotencyKey ||
        existing.totalDeltaCents !== input.price.amountCents ||
        existing.currency !== input.price.currency
      ) {
        throw new Error("Booking Amendment finance idempotency conflict")
      }
      return { adjustmentId: existing.id, status: "replay" }
    },
  }
}
