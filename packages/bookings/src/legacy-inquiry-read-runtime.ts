import { and, asc, eq, gt, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { LegacyBookingInquiryReadRuntime } from "./inquiry/ports.js"
import { bookingInquiries } from "./schema-inquiries.js"

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
