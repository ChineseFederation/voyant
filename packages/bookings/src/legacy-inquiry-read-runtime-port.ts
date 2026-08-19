import { and, asc, eq, gt, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { bookingInquiries } from "./schema-inquiries.js"

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

export const legacyBookingInquiryReadRuntime: LegacyBookingInquiryReadRuntime = {
  listBatch(database, input) {
    const db = database as PostgresJsDatabase
    return db
      .select()
      .from(bookingInquiries)
      .where(input.afterId ? gt(bookingInquiries.id, input.afterId) : undefined)
      .orderBy(asc(bookingInquiries.id))
      .limit(input.limit)
  },
  getByIds(database, ids) {
    if (ids.length === 0) return Promise.resolve([])
    return (database as PostgresJsDatabase)
      .select()
      .from(bookingInquiries)
      .where(inArray(bookingInquiries.id, ids))
      .orderBy(asc(bookingInquiries.id))
  },
  async findByIdentity(database, input) {
    const [row] = await (database as PostgresJsDatabase)
      .select()
      .from(bookingInquiries)
      .where(
        and(
          eq(bookingInquiries.channelId, input.channelId),
          eq(bookingInquiries.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)
    return row ?? null
  },
}
