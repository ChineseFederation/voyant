import type { BookingSessionOutcomeV1 } from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { definePort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"

export interface CatalogCompositeBookingSessionRuntime {
  createValidatedTripSnapshotSession(input: {
    db: AnyDrizzleDb
    idempotencyKey: string
    tripSnapshotId: string
    tripEnvelopeId: string
    capability: string
    ownerUserId: string | null
    /**
     * The Buyer Account the caller was authenticated as, when the caller had
     * one. A composite Session is only owned by a customer if this arrives
     * alongside `ownerUserId`; without it the Session is created against the
     * capability, because a customer-owned Session with no Buyer Account is
     * exactly what the access rules refuse.
     */
    ownerBuyerAccountId?: string | null
    channel: { channelId: string }
    scope: { locale: string; market: string; currency: string }
  }): Promise<BookingSessionOutcomeV1>
}

export const catalogCompositeBookingSessionRuntimePort =
  definePort<CatalogCompositeBookingSessionRuntime>({
    id: "catalog.composite-booking-session.runtime",
    test(runtime) {
      if (!runtime || typeof runtime.createValidatedTripSnapshotSession !== "function") {
        throw new Error("catalog.composite-booking-session.runtime provider is incomplete.")
      }
    },
  })
