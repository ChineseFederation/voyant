import type { BookingSessionModule } from "@voyant-travel/catalog/booking-engine"
import { bookingSessionsTable } from "@voyant-travel/catalog/booking-engine/sessions-schema"
import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { CatalogInquiryBookingSessionRuntime } from "./inquiry-booking-session-runtime-port.js"

type ResolveBookingSessionModule = (db: PostgresJsDatabase) => Promise<BookingSessionModule>

/** Catalog's owner adapter for staff-created Inquiry Booking Sessions. */
export function createCatalogInquiryBookingSessionRuntime(
  resolveBookingSessionModule: ResolveBookingSessionModule,
): CatalogInquiryBookingSessionRuntime {
  return {
    async createForInquiry(input) {
      const db = input.db as PostgresJsDatabase
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`catalog:inquiry-booking-session:${input.idempotencyKey}`}, 0))`,
        )
        const [existing] = await tx
          .select({ id: bookingSessionsTable.id })
          .from(bookingSessionsTable)
          .where(eq(bookingSessionsTable.createIdempotencyKey, input.idempotencyKey))
          .limit(1)
        const module = await resolveBookingSessionModule(tx)
        const outcome = await module.createSession(
          {
            idempotencyKey: input.idempotencyKey,
            target: input.target,
            selection: input.selection,
          },
          {
            actorKind: "staff",
            principalId: input.actorId,
            organizationId: input.organizationId ?? undefined,
            ...(input.channelId ? { storefront: { channelId: input.channelId } } : {}),
            staffAuthority: { admitted: true, reason: "inquiry_conversion" },
          },
        )
        if (outcome.kind === "session_created") {
          return {
            kind: existing ? "replayed" : "created",
            bookingSessionId: outcome.session.id,
          }
        }
        if (outcome.kind === "rejected") {
          return {
            kind: "refused",
            reason:
              outcome.error.kind === "idempotency_conflict"
                ? "idempotency_conflict"
                : outcome.error.kind === "invalid_selection"
                  ? "invalid_selection"
                  : "target_unavailable",
          }
        }
        return { kind: "refused", reason: "target_unavailable" }
      })
    },
  }
}
