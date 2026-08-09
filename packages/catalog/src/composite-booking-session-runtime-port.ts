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
    storefront: { storefrontId: string; channelId: string }
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
