import type { EventBus } from "@voyant-travel/core"
import { desc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { type BookingInquiry, bookingInquiries } from "./schema-inquiries.js"

export const BOOKING_INQUIRY_CREATED_EVENT = "booking.inquiry.created" as const

export interface BookingInquiryContact {
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
}

export interface SubmitBookingInquiryInput {
  idempotencyKey: string
  channelId: string
  productId: string
  departureId: string | null
  contact: BookingInquiryContact
  locale: string
  message: string
}

export interface BookingInquiryCreatedEvent {
  inquiryId: string
  channelId: string
  productId: string
  departureId: string | null
}

export type SubmitBookingInquiryResult =
  | { status: "created" | "replayed"; inquiry: BookingInquiry }
  | { status: "conflict"; inquiry: BookingInquiry }

export interface BookingInquiryServiceRuntime {
  eventBus?: EventBus
}

/** Read-only compatibility access to the retained legacy table. */
export const bookingInquiriesService = {
  async getById(db: PostgresJsDatabase, id: string): Promise<BookingInquiry | null> {
    const [inquiry] = await db
      .select()
      .from(bookingInquiries)
      .where(eq(bookingInquiries.id, id))
      .limit(1)
    return inquiry ?? null
  },

  list(db: PostgresJsDatabase): Promise<BookingInquiry[]> {
    return db.select().from(bookingInquiries).orderBy(desc(bookingInquiries.createdAt))
  },
}
