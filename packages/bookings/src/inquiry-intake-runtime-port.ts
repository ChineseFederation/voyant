import { definePort } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { BookingInquiry } from "./schema-inquiries.js"
import type { SubmitBookingInquiryInput, SubmitBookingInquiryResult } from "./service-inquiries.js"

export interface BookingsCanonicalInquiryIntakeRuntime {
  submit(
    db: PostgresJsDatabase,
    input: SubmitBookingInquiryInput,
  ): Promise<SubmitBookingInquiryResult>
  getById(db: PostgresJsDatabase, id: string): Promise<BookingInquiry | null>
  list(db: PostgresJsDatabase): Promise<BookingInquiry[]>
}

export const bookingsCanonicalInquiryIntakeRuntimePort =
  definePort<BookingsCanonicalInquiryIntakeRuntime>({
    id: "bookings.canonical-inquiry-intake.runtime",
    test(provider) {
      if (
        !provider ||
        typeof provider.submit !== "function" ||
        typeof provider.getById !== "function" ||
        typeof provider.list !== "function"
      ) {
        throw new Error(
          "bookings.canonical-inquiry-intake.runtime must implement submit(), getById(), and list().",
        )
      }
    },
  })
