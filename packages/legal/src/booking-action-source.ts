import type { BookingActionSourceRuntime } from "@voyant-travel/bookings/runtime-port"
import type { BookingActionSourceSnapshot } from "@voyant-travel/bookings-contracts/booking-actions"
import { and, gt, isNotNull } from "drizzle-orm"

import { contracts } from "./contracts/schema.js"

/** Legal-owned authoritative booking contract acceptance/signature deadlines. */
export const legalBookingActionSource: BookingActionSourceRuntime = {
  id: "legal.booking-contract-obligations.v1",
  sourceModule: "legal",
  async read(db, { changedAfter }) {
    const rows = await db
      .select()
      .from(contracts)
      .where(
        and(
          isNotNull(contracts.bookingId),
          isNotNull(contracts.expiresAt),
          changedAfter ? gt(contracts.updatedAt, changedAfter) : undefined,
        ),
      )

    return rows.map((row): BookingActionSourceSnapshot => {
      const satisfied = row.status === "signed" || row.status === "executed"
      const cancelled = row.status === "expired" || row.status === "void"
      const sourceState = satisfied
        ? "satisfied"
        : cancelled
          ? "cancelled"
          : row.status === "draft"
            ? "superseded"
            : "open"
      const signature = row.status === "sent" || satisfied
      return {
        sourceModule: "legal",
        sourceType: "booking_contract",
        sourceId: row.id,
        sourceUpdatedAt: row.updatedAt.toISOString(),
        kind: signature ? "legal_signature_due" : "legal_acceptance_due",
        bookingId: row.bookingId,
        bookingSessionId: null,
        deadline: {
          semantics: "instant",
          at: (row.expiresAt ?? row.updatedAt).toISOString(),
          timeZone: "UTC",
        },
        sourceState,
        satisfiedAt: satisfied ? (row.executedAt ?? row.updatedAt).toISOString() : null,
        escalationPolicy: { dueWindowSeconds: 24 * 60 * 60, escalateAfterSeconds: 48 * 60 * 60 },
        operatorNextAction:
          sourceState !== "open"
            ? "none"
            : signature
              ? "obtain_signature"
              : "obtain_legal_acceptance",
        customerVisible: sourceState === "open" || sourceState === "satisfied",
        customerNextAction:
          sourceState === "open" ? (signature ? "sign_contract" : "accept_terms") : "none",
        safeMetadata: { contractNumber: row.contractNumber, title: row.title },
      }
    })
  },
}
