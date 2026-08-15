/**
 * The one path that records a Booking Document.
 *
 * Both the admin route and `record_booking_document` go through it, so a
 * document recorded by a person and one recorded by an agent are written the
 * same way and audited the same way.
 *
 * The insert and its action-ledger entry commit in a single transaction. They
 * have to: `createDocument` replays an issued document that is already on the
 * booking, so a ledger append that failed after the insert would leave a
 * recording that no retry could ever audit — the retry sees the row and
 * replays past the append.
 *
 * Nothing here allocates a number from an invoice or contract series, renders
 * a template, or creates an `invoices` or `contracts` row. See
 * `tools-documents.ts` for why recording is not issuing (voyant#4657).
 */

import {
  type ActionLedgerRequestContextValues,
  appendActionLedgerMutation,
} from "@voyant-travel/action-ledger"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  BOOKING_DOCUMENT_LEDGER_ACTION_NAME,
  BOOKING_DOCUMENT_LEDGER_ACTION_VERSION,
} from "./action-declarations.js"
import type { BookingDocument } from "./schema.js"
import { bookingsService } from "./service.js"

export interface RecordBookingDocumentResult {
  document: BookingDocument
  replayed: boolean
}

/**
 * Record a document against a booking and audit the recording atomically.
 *
 * Returns `null` when the booking does not exist.
 */
export async function recordBookingDocument(
  db: PostgresJsDatabase,
  input: {
    context: ActionLedgerRequestContextValues
    bookingId: string
    data: Parameters<typeof bookingsService.createDocument>[2]
    routeOrToolName: string
    authorizationSource: string
    /** Identity of the admitted action, when a handler-owned policy minted one. */
    capabilityId?: string | null
    capabilityVersion?: string | null
    idempotencyKey?: string | null
  },
): Promise<RecordBookingDocumentResult | null> {
  return db.transaction(async (tx) => {
    const result = await bookingsService.createDocument(
      tx as PostgresJsDatabase,
      input.bookingId,
      input.data,
    )
    if (!result) return null

    // Only the recording that actually happened is an event; a replay of a
    // document already on the booking changed nothing and must not read as a
    // second recording in the audit trail.
    if (!result.replayed) {
      await appendActionLedgerMutation(tx as AnyDrizzleDb, {
        context: input.context,
        actionName: BOOKING_DOCUMENT_LEDGER_ACTION_NAME,
        actionVersion: BOOKING_DOCUMENT_LEDGER_ACTION_VERSION,
        actionKind: "create",
        evaluatedRisk: "medium",
        targetType: "booking",
        targetId: input.bookingId,
        routeOrToolName: input.routeOrToolName,
        authorizationSource: input.authorizationSource,
        capabilityId: input.capabilityId ?? null,
        capabilityVersion: input.capabilityVersion ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        mutationDetail: {
          summary: describeRecording(result.document),
          reversalKind: "none",
        },
      })
    }

    return result
  })
}

function describeRecording(document: BookingDocument): string {
  const identity = [document.issuedSeries, document.issuedNumber].filter(Boolean).join(" ")
  return identity
    ? `Recorded externally issued ${document.type} ${identity}`
    : `Recorded ${document.type} document`
}
