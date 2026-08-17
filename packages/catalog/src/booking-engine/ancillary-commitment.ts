/**
 * What a committed Booking Session decided about its ancillary offers.
 *
 * The decision is made on the Session and the charge happens on the Booking,
 * so something has to carry it across. That something lives here, in catalog,
 * because `booking_sessions` is catalog's table: commerce owns the seam that
 * prices and issues a third-party offer, but it must not read the Session rows
 * to find out what was accepted.
 *
 * The read is deliberately narrow. It answers one question — "which offers did
 * the traveller accept on the Session that produced this Booking, and who is
 * the contracting party" — and returns nothing else off a selection that is
 * large, versioned and none of commerce's business.
 */

import {
  type AncillarySelectionV1,
  ancillarySelectionV1,
} from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import { desc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { bookingSessionCommitsTable, bookingSessionsTable } from "./sessions-schema.js"

/** The contracting party, as the billing step recorded it. */
export interface CommittedAncillaryContactV1 {
  firstName: string
  lastName: string
  email: string
  phone?: string
}

export interface CommittedAncillarySelectionsV1 {
  bookingSessionId: string
  contact: CommittedAncillaryContactV1
  /** Accepted decisions only — a decline is a decision that buys nothing. */
  accepted: readonly AncillarySelectionV1[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/**
 * Read the accepted ancillary selections off the Session this Booking came from.
 *
 * Returns `null` when the Booking did not come from a Session at all — an
 * operator-created Booking, or one committed before Sessions carried the step.
 * That is an ordinary absence and not an error: there is nothing to buy.
 *
 * A stored selection that no longer parses is skipped rather than thrown on.
 * The alternative is a checkout that cannot start because a single malformed
 * entry from an earlier contract revision is on the Session, and the traveller
 * has no way to repair it.
 */
export async function loadCommittedAncillarySelections(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<CommittedAncillarySelectionsV1 | null> {
  const [row] = await db
    .select({
      sessionId: bookingSessionsTable.id,
      statePayload: bookingSessionsTable.statePayload,
    })
    .from(bookingSessionCommitsTable)
    .innerJoin(
      bookingSessionsTable,
      eq(bookingSessionsTable.id, bookingSessionCommitsTable.sessionId),
    )
    .where(eq(bookingSessionCommitsTable.bookingId, bookingId))
    .orderBy(desc(bookingSessionCommitsTable.createdAt))
    .limit(1)

  if (!row) return null

  const selection = asRecord(row.statePayload)
  const billingContact = asRecord(asRecord(selection?.billing)?.contact)
  const phone = asString(billingContact?.phone)
  const contact: CommittedAncillaryContactV1 = {
    firstName: asString(billingContact?.firstName),
    lastName: asString(billingContact?.lastName),
    email: asString(billingContact?.email),
    ...(phone ? { phone } : {}),
  }

  const rawAncillaries = Array.isArray(selection?.ancillaries) ? selection.ancillaries : []
  const accepted: AncillarySelectionV1[] = []
  for (const entry of rawAncillaries) {
    const parsed = ancillarySelectionV1.safeParse(entry)
    if (!parsed.success) continue
    if (parsed.data.decision !== "accepted") continue
    accepted.push(parsed.data)
  }

  return { bookingSessionId: row.sessionId, contact, accepted }
}
