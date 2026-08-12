import type {
  PersonNotificationDelivery,
  PersonNotificationDeliveryQuery,
  RelationshipsPersonNotificationsRuntime,
} from "@voyant-travel/relationships/runtime-port"
import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { notificationDeliveries } from "./schema.js"

/**
 * Expose delivered customer messages to the CRM Communications tab.
 *
 * Only `sent` rows: a pending send has not reached the customer and a failed
 * one never will, so neither is a communication that happened. Delivery status
 * lives here and stays here — CRM reads this rather than holding a copy that
 * could not follow a later bounce.
 */
export function createPersonCommunicationsRuntime(): RelationshipsPersonNotificationsRuntime {
  return {
    async listPersonDeliveries(
      db: unknown,
      personId: string,
      query: PersonNotificationDeliveryQuery,
    ): Promise<readonly PersonNotificationDelivery[]> {
      const database = db as PostgresJsDatabase
      const conditions = [
        eq(notificationDeliveries.personId, personId),
        eq(notificationDeliveries.status, "sent"),
        isNotNull(notificationDeliveries.sentAt),
      ]
      if (query.dateFrom) {
        conditions.push(gte(notificationDeliveries.createdAt, new Date(query.dateFrom)))
      }
      if (query.dateTo) {
        conditions.push(lte(notificationDeliveries.createdAt, new Date(query.dateTo)))
      }

      const rows = await database
        .select({
          id: notificationDeliveries.id,
          channel: notificationDeliveries.channel,
          subject: notificationDeliveries.subject,
          textBody: notificationDeliveries.textBody,
          sentAt: notificationDeliveries.sentAt,
          createdAt: notificationDeliveries.createdAt,
        })
        .from(notificationDeliveries)
        .where(and(...conditions))
        .orderBy(desc(notificationDeliveries.createdAt))
        .limit(query.limit)
        .offset(query.offset)

      return rows.map((row) => ({
        id: row.id,
        channel: row.channel,
        subject: row.subject ?? null,
        body: row.textBody ?? null,
        sentAt: row.sentAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      }))
    },
  }
}
