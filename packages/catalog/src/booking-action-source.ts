import type { BookingActionSourceRuntime } from "@voyant-travel/bookings/runtime-port"
import type { BookingActionSourceSnapshot } from "@voyant-travel/bookings-contracts/booking-actions"
import { eq, gt, or } from "drizzle-orm"

import {
  bookingSessionCommitsTable,
  bookingSessionHoldsTable,
} from "./booking-engine/sessions-schema.js"
import { supplierOperationsTable } from "./booking-engine/supplier-operations-schema.js"

function holdSourceUpdatedAt(row: {
  createdAt: Date
  convertedAt: Date | null
  releasedAt: Date | null
}) {
  return [row.createdAt, row.convertedAt, row.releasedAt]
    .filter((value): value is Date => value !== null)
    .reduce((latest, value) => (value > latest ? value : latest))
}

/** Catalog-owned authoritative hold and supplier-operation deadlines. */
export const catalogBookingActionSource: BookingActionSourceRuntime = {
  id: "catalog.booking-obligations.v1",
  sourceModule: "catalog",
  async read(db, { changedAfter }) {
    const holdRows = await db
      .select({
        id: bookingSessionHoldsTable.id,
        sessionId: bookingSessionHoldsTable.sessionId,
        state: bookingSessionHoldsTable.state,
        expiresAt: bookingSessionHoldsTable.expiresAt,
        convertedAt: bookingSessionHoldsTable.convertedAt,
        releasedAt: bookingSessionHoldsTable.releasedAt,
        createdAt: bookingSessionHoldsTable.createdAt,
        bookingId: bookingSessionCommitsTable.bookingId,
      })
      .from(bookingSessionHoldsTable)
      .leftJoin(
        bookingSessionCommitsTable,
        eq(bookingSessionCommitsTable.sessionId, bookingSessionHoldsTable.sessionId),
      )
      .where(
        changedAfter
          ? or(
              gt(bookingSessionHoldsTable.createdAt, changedAfter),
              gt(bookingSessionHoldsTable.convertedAt, changedAfter),
              gt(bookingSessionHoldsTable.releasedAt, changedAfter),
            )
          : undefined,
      )

    // A session can have idempotent commit attempts. Collapse the join to one
    // source snapshot per hold, preferring the successful booking reference.
    const holds = new Map<string, (typeof holdRows)[number]>()
    for (const row of holdRows) {
      const current = holds.get(row.id)
      if (!current || (!current.bookingId && row.bookingId)) holds.set(row.id, row)
    }

    const snapshots: BookingActionSourceSnapshot[] = [...holds.values()].map((row) => ({
      sourceModule: "catalog",
      sourceType: "booking_session_hold",
      sourceId: row.id,
      sourceUpdatedAt: holdSourceUpdatedAt(row).toISOString(),
      kind: "hold_expiry",
      bookingId: row.bookingId,
      bookingSessionId: row.sessionId,
      deadline: { semantics: "instant", at: row.expiresAt.toISOString(), timeZone: "UTC" },
      sourceState:
        row.state === "active" ? "open" : row.state === "converted" ? "satisfied" : "cancelled",
      satisfiedAt: row.convertedAt?.toISOString() ?? null,
      escalationPolicy: { dueWindowSeconds: 15 * 60, escalateAfterSeconds: 60 * 60 },
      operatorNextAction: row.state === "active" ? "monitor_hold" : "none",
      customerVisible: false,
      customerNextAction: null,
      safeMetadata: {},
    }))

    const supplierRows = await db
      .select()
      .from(supplierOperationsTable)
      .where(changedAfter ? gt(supplierOperationsTable.updatedAt, changedAfter) : undefined)
    for (const row of supplierRows) {
      const terminalSatisfied =
        row.state === "succeeded" ||
        (row.state === "manually_resolved" && row.upstreamStatus === "succeeded")
      const terminalCancelled = row.state === "refused" || row.state === "cancelled"
      const sourceState = terminalSatisfied ? "satisfied" : terminalCancelled ? "cancelled" : "open"
      snapshots.push({
        sourceModule: "catalog",
        sourceType: "supplier_operation",
        sourceId: row.id,
        sourceUpdatedAt: row.updatedAt.toISOString(),
        kind:
          row.state === "in_doubt" || row.state === "manual_review"
            ? "supplier_response_due"
            : "supplier_reconciliation_due",
        bookingId: row.bookingId,
        bookingSessionId: row.sessionId,
        deadline: {
          semantics: "instant",
          at: (row.nextReconcileAt ?? row.updatedAt).toISOString(),
          timeZone: "UTC",
        },
        sourceState,
        satisfiedAt: terminalSatisfied ? (row.resolvedAt ?? row.updatedAt).toISOString() : null,
        escalationPolicy: { dueWindowSeconds: 5 * 60, escalateAfterSeconds: 60 * 60 },
        operatorNextAction:
          sourceState !== "open"
            ? "none"
            : row.state === "in_doubt" || row.state === "manual_review"
              ? "review_supplier_operation"
              : "reconcile_supplier_operation",
        customerVisible: sourceState === "open" && row.bookingId !== null,
        customerNextAction:
          sourceState === "open" && row.bookingId !== null ? "await_supplier_confirmation" : null,
        safeMetadata: { operationKind: row.operationKind, state: row.state },
      })
    }

    return snapshots
  },
}
