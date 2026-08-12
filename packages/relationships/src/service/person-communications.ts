import type { PersonNotificationDelivery } from "../runtime-port.js"
import type { CommunicationLogEntry } from "../schema.js"

/**
 * A communication as the Communications tab sees it.
 *
 * `source` is the field the UI needs: a `logged` entry is a row staff wrote and
 * may edit, a `notification` entry is a message the deployment sent and is
 * read-only. Without it the tab would offer to edit a delivery record that has
 * no edit route behind it.
 */
export interface PersonCommunicationEntry {
  id: string
  personId: string
  organizationId: string | null
  channel: CommunicationLogEntry["channel"]
  direction: CommunicationLogEntry["direction"]
  subject: string | null
  content: string | null
  sentAt: Date | null
  createdAt: Date
  source: "logged" | "notification"
}

interface MergeQuery {
  limit: number
  offset: number
  channel?: CommunicationLogEntry["channel"]
  direction?: CommunicationLogEntry["direction"]
}

function orderedAt(entry: PersonCommunicationEntry): number {
  return (entry.sentAt ?? entry.createdAt).getTime()
}

/**
 * Interleave hand-logged entries with delivered notifications, newest first.
 *
 * Both inputs arrive already paged by their own source, so the merge is exact
 * for the first page and approximate beyond it — a deep page can miss an entry
 * that sorted into the other source's earlier page. The tab reads one page of
 * 50, and the alternative is a cross-module SQL union that would put Bookings'
 * and Notifications' tables inside a CRM query.
 */
export function mergePersonCommunications(
  personId: string,
  logged: readonly CommunicationLogEntry[],
  delivered: readonly PersonNotificationDelivery[],
  query: MergeQuery,
): PersonCommunicationEntry[] {
  const entries: PersonCommunicationEntry[] = logged.map((row) => ({
    id: row.id,
    personId: row.personId,
    organizationId: row.organizationId,
    channel: row.channel,
    direction: row.direction,
    subject: row.subject,
    content: row.content,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
    source: "logged",
  }))

  for (const delivery of delivered) {
    // The delivery channel enum is a subset of the communication one, but a
    // caller filtering on `phone` or `meeting` must not see email deliveries.
    if (query.channel && query.channel !== delivery.channel) continue
    entries.push({
      id: delivery.id,
      personId,
      organizationId: null,
      channel: delivery.channel,
      direction: "outbound",
      subject: delivery.subject,
      content: delivery.body,
      sentAt: delivery.sentAt ? new Date(delivery.sentAt) : null,
      createdAt: new Date(delivery.createdAt),
      source: "notification",
    })
  }

  return entries.sort((left, right) => orderedAt(right) - orderedAt(left)).slice(0, query.limit)
}
