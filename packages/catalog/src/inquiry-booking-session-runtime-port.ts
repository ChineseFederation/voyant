import type { CreateBookingSessionTargetV1 } from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import { definePort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"

export type InquiryBookingSessionRefusalReason =
  | "idempotency_conflict"
  | "invalid_selection"
  | "target_unavailable"

export type InquiryBookingSessionCreateOutcome =
  | { kind: "created" | "replayed"; bookingSessionId: string }
  | { kind: "refused"; reason: InquiryBookingSessionRefusalReason }

/** Catalog-owned, import-cheap owner command used by Inquiry conversion adapters. */
export interface CatalogInquiryBookingSessionRuntime {
  createForInquiry(input: {
    db: AnyDrizzleDb
    idempotencyKey: string
    target: CreateBookingSessionTargetV1
    selection?: Record<string, unknown>
    actorId: string
    organizationId?: string | null
    channelId?: string | null
  }): Promise<InquiryBookingSessionCreateOutcome>
}

export const catalogInquiryBookingSessionRuntimePort =
  definePort<CatalogInquiryBookingSessionRuntime>({
    id: "catalog.inquiry-booking-session.runtime",
    test(runtime) {
      if (!runtime || typeof runtime.createForInquiry !== "function") {
        throw new Error("catalog.inquiry-booking-session.runtime provider is incomplete.")
      }
    },
  })
