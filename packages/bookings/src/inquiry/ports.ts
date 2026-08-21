import { definePort } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { BookingInquiry } from "../schema-inquiries.js"
import type { SubmitBookingInquiryInput, SubmitBookingInquiryResult } from "../service-inquiries.js"

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

export interface LegacyBookingInquiryRecord {
  id: string
  idempotencyKey: string
  requestFingerprint: string
  channelId: string
  productId: string
  departureId: string | null
  contactFirstName: string | null
  contactLastName: string | null
  contactEmail: string | null
  contactPhone: string | null
  locale: string
  message: string
  status: "open" | "closed"
  createdAt: Date
  updatedAt: Date
}

/** Read-only compatibility seam used only by the one-way Inquiry cutover. */
export interface LegacyBookingInquiryReadRuntime {
  listBatch(
    database: unknown,
    input: { afterId?: string; limit: number },
  ): Promise<LegacyBookingInquiryRecord[]>
  getByIds(database: unknown, ids: string[]): Promise<LegacyBookingInquiryRecord[]>
  findByIdentity(
    database: unknown,
    input: { channelId: string; idempotencyKey: string },
  ): Promise<LegacyBookingInquiryRecord | null>
}

export const legacyBookingInquiryReadRuntimePort = Object.freeze({
  id: "bookings.legacy-inquiry-read.runtime",
  test(provider: LegacyBookingInquiryReadRuntime) {
    if (
      !provider ||
      typeof provider.listBatch !== "function" ||
      typeof provider.getByIds !== "function" ||
      typeof provider.findByIdentity !== "function"
    ) {
      throw new Error(
        "bookings.legacy-inquiry-read.runtime provider must implement listBatch(), getByIds(), and findByIdentity().",
      )
    }
  },
})
