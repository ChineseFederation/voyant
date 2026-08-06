import { definePort } from "@voyant-travel/core/project"

export interface CatalogBookingSessionSettlementRuntime {
  commitPaidSession(input: {
    bookingSessionId: string
    paymentSessionId: string
  }): Promise<{ bookingId: string }>
}

export const catalogBookingSessionSettlementRuntimePort =
  definePort<CatalogBookingSessionSettlementRuntime>({
    id: "catalog.booking-session-settlement-runtime",
    test(provider) {
      if (
        provider === null ||
        typeof provider !== "object" ||
        typeof provider.commitPaidSession !== "function"
      ) {
        throw new Error(
          "catalog.booking-session-settlement-runtime provider must implement commitPaidSession().",
        )
      }
    },
  })
