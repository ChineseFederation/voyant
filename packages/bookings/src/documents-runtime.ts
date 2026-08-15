/**
 * Tool-context contribution for the Booking Document Tools.
 *
 * Thin over `bookingsService` and `recordBookingDocument`: it resolves the
 * booking, records the document, and serializes the row. The recording and its
 * audit entry are one transaction inside `document-recording.ts`, shared with
 * the admin route (voyant#4657).
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import { recordBookingDocument } from "./document-recording.js"
import { type Env, getActionLedgerRequestContext } from "./routes-shared.js"
import type { BookingDocument } from "./schema.js"
import { bookingsService } from "./service.js"
import type { BookingDocumentsToolServices } from "./tools-documents.js"

function toWire(row: BookingDocument) {
  return {
    id: row.id,
    bookingId: row.bookingId,
    travelerId: row.travelerId ?? null,
    type: row.type,
    fileName: row.fileName,
    fileUrl: row.fileUrl,
    issuedBy: row.issuedBy ?? null,
    issuedSeries: row.issuedSeries ?? null,
    issuedNumber: row.issuedNumber ?? null,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export function contributeBookingDocumentsToolContext(input: {
  request: unknown
  context: { db?: unknown }
}): { bookingDocuments: BookingDocumentsToolServices } {
  const c = input.request as Context<Env>
  const db = input.context.db as PostgresJsDatabase

  return {
    bookingDocuments: {
      async listBookingDocuments({ bookingId }) {
        const booking = await bookingsService.getBookingById(db, bookingId)
        if (!booking) return null
        const rows = await bookingsService.listDocuments(db, bookingId)
        return { data: rows.map(toWire) }
      },
      async recordBookingDocument(command, admitted) {
        const { bookingId, ...data } = command
        const result = await recordBookingDocument(db, {
          context: getActionLedgerRequestContext(c),
          bookingId,
          data: { ...data, travelerId: data.travelerId ?? null },
          routeOrToolName: "record_booking_document",
          authorizationSource: "bookings.tool",
          // The admitted policy is the authority for what this command is
          // allowed to be, so the ledger entry carries its identity rather
          // than a literal restated here.
          capabilityId: admitted.actionPolicy.capabilityId ?? admitted.actionPolicy.id,
          capabilityVersion: admitted.actionPolicy.version,
          idempotencyKey: admitted.invocation.idempotencyKey ?? null,
        })
        if (!result) return null
        return { document: toWire(result.document), replayed: result.replayed }
      },
    },
  }
}
