import type { BookingSessionModule } from "@voyant-travel/catalog/booking-engine"
import { bookingSessionsTable } from "@voyant-travel/catalog/booking-engine/sessions-schema"
import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { bookingSessionCreateIdempotencyKey } from "./booking-engine/sessions-service.js"
import {
  CATALOG_BOOKING_SESSION_CREATED_EVENT,
  type CatalogInquiryBookingSessionRuntime,
} from "./inquiry-booking-session-runtime-port.js"

type ResolveBookingSessionModule = (db: PostgresJsDatabase) => Promise<BookingSessionModule>

/** Catalog's owner adapter for staff-created Inquiry Booking Sessions. */
export function createCatalogInquiryBookingSessionRuntime(
  resolveBookingSessionModule: ResolveBookingSessionModule,
): CatalogInquiryBookingSessionRuntime {
  return {
    async createForInquiry(input) {
      const db = input.db as PostgresJsDatabase
      return db.transaction(async (tx) => {
        const access = {
          actorKind: "staff" as const,
          principalId: input.actorId,
          organizationId: input.organizationId ?? undefined,
          ...(input.channelId ? { storefront: { channelId: input.channelId } } : {}),
          staffAuthority: { admitted: true as const, reason: "inquiry_conversion" },
        }
        const persistedIdempotencyKey = await bookingSessionCreateIdempotencyKey(
          input.idempotencyKey,
          access,
          undefined,
        )
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`catalog:inquiry-booking-session:${input.idempotencyKey}`}, 0))`,
        )
        const [existing] = await tx
          .select({ id: bookingSessionsTable.id })
          .from(bookingSessionsTable)
          .where(eq(bookingSessionsTable.createIdempotencyKey, persistedIdempotencyKey))
          .limit(1)
        const module = await resolveBookingSessionModule(tx)
        const outcome = await module.createSession(
          {
            idempotencyKey: input.idempotencyKey,
            target: input.target,
            selection: input.selection,
          },
          access,
        )
        if (outcome.kind === "session_created") {
          if (existing) return { kind: "replayed", bookingSessionId: outcome.session.id }
          const createdSignal = {
            bookingSessionId: outcome.session.id,
            scope: outcome.session.scope.locale,
            market: outcome.session.scope.market,
            channel: "operator" as const,
          }
          await insertOutboxEvents(tx, [
            {
              name: CATALOG_BOOKING_SESSION_CREATED_EVENT,
              data: createdSignal,
              metadata: {
                category: "domain",
                source: "service",
                eventId: `evt_catalog_booking_session_created_${outcome.session.id}`,
              },
            },
          ])
          return {
            kind: "created",
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
