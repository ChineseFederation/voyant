import type { EventBus } from "@voyant-travel/core"
import { and, desc, eq } from "drizzle-orm"
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

async function fingerprint(input: SubmitBookingInquiryInput): Promise<string> {
  const canonical = JSON.stringify({
    channelId: input.channelId,
    productId: input.productId,
    departureId: input.departureId,
    contact: input.contact,
    locale: input.locale,
    message: input.message,
  })
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function emitCreated(eventBus: EventBus | undefined, inquiry: BookingInquiry) {
  await eventBus?.emit<BookingInquiryCreatedEvent>(
    BOOKING_INQUIRY_CREATED_EVENT,
    {
      inquiryId: inquiry.id,
      channelId: inquiry.channelId,
      productId: inquiry.productId,
      departureId: inquiry.departureId,
    },
    {
      category: "domain",
      source: "service",
      eventId: `evt_booking_inquiry_created_${inquiry.id}`,
    },
  )
}

async function findByIdentity(db: PostgresJsDatabase, input: SubmitBookingInquiryInput) {
  const [inquiry] = await db
    .select()
    .from(bookingInquiries)
    .where(
      and(
        eq(bookingInquiries.channelId, input.channelId),
        eq(bookingInquiries.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  return inquiry ?? null
}

export const bookingInquiriesService = {
  async submit(
    db: PostgresJsDatabase,
    input: SubmitBookingInquiryInput,
    runtime: BookingInquiryServiceRuntime = {},
  ): Promise<SubmitBookingInquiryResult> {
    const requestFingerprint = await fingerprint(input)
    const [created] = await db
      .insert(bookingInquiries)
      .values({
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        channelId: input.channelId,
        productId: input.productId,
        departureId: input.departureId,
        contactFirstName: input.contact.firstName,
        contactLastName: input.contact.lastName,
        contactEmail: input.contact.email,
        contactPhone: input.contact.phone,
        locale: input.locale,
        message: input.message,
      })
      .onConflictDoNothing({
        target: [bookingInquiries.channelId, bookingInquiries.idempotencyKey],
      })
      .returning()

    const inquiry = created ?? (await findByIdentity(db, input))
    if (!inquiry) throw new Error("Booking inquiry could not be persisted or replayed")
    if (inquiry.requestFingerprint !== requestFingerprint) {
      return { status: "conflict", inquiry }
    }

    await emitCreated(runtime.eventBus, inquiry)
    return { status: created ? "created" : "replayed", inquiry }
  },

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
