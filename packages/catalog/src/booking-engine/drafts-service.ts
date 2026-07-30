/**
 * Service layer over `booking_drafts` — CRUD + lifecycle helpers
 * the route layer composes. Per booking-journey-architecture §5.7.
 */

import type { AnyDrizzleDb } from "@voyant-travel/db"
import { newId } from "@voyant-travel/db/lib/typeid"
import { and, eq, isNull, lt } from "drizzle-orm"

import {
  bookingDraftsTable,
  type InsertBookingDraft,
  type SelectBookingDraft,
} from "./drafts-schema.js"

export const DEFAULT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000 // 24h

export interface UpsertDraftInput {
  /** Draft id — when omitted, a fresh id is generated. */
  id?: string
  entityModule: string
  entityId: string
  sourceKind: string
  sourceConnectionId?: string
  sourceRef?: string
  draftPayload: Record<string, unknown>
  currentStep?: string
  currentQuoteId?: string
  holdExpiresAt?: Date | null
  createdBy?: string | null
  ttlMs?: number
}

export async function createBookingDraft(
  db: AnyDrizzleDb,
  input: UpsertDraftInput,
): Promise<SelectBookingDraft> {
  const id = input.id ?? newId("booking_drafts")
  const now = new Date()
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? DEFAULT_DRAFT_TTL_MS))

  const values: InsertBookingDraft = {
    id,
    entity_module: input.entityModule,
    entity_id: input.entityId,
    source_kind: input.sourceKind,
    source_connection_id: input.sourceConnectionId,
    source_ref: input.sourceRef,
    draft_payload: input.draftPayload,
    current_step: input.currentStep,
    current_quote_id: input.currentQuoteId,
    hold_expires_at: input.holdExpiresAt ?? null,
    created_by: input.createdBy ?? null,
    created_at: now,
    updated_at: now,
    expires_at: expiresAt,
  }

  // Upsert (not just insert) — the storefront fires multiple PUTs to
  // the same draft id in quick succession (step transition + live
  // re-quote), and the route's find-or-create flow can race two
  // concurrent calls into colliding INSERTs. Rolling the create + on-
  // conflict update into a single statement makes the route
  // idempotent regardless of ordering.
  const [row] = (await db
    .insert(bookingDraftsTable)
    .values(values)
    .onConflictDoUpdate({
      target: bookingDraftsTable.id,
      set: {
        // Refresh the mutable journey state — we DON'T overwrite
        // `id`, `created_at`, `created_by`, or the entity pointers
        // on conflict (those are immutable identity).
        draft_payload: values.draft_payload,
        current_step: values.current_step,
        current_quote_id: values.current_quote_id,
        hold_expires_at: values.hold_expires_at,
        updated_at: now,
        expires_at: expiresAt,
      },
    })
    .returning()) as SelectBookingDraft[]
  if (!row) throw new Error("createBookingDraft: insert returned no rows")
  return row
}

export async function getBookingDraft(
  db: AnyDrizzleDb,
  id: string,
): Promise<SelectBookingDraft | null> {
  const rows = (await db
    .select()
    .from(bookingDraftsTable)
    .where(eq(bookingDraftsTable.id, id))
    .limit(1)) as SelectBookingDraft[]
  return rows[0] ?? null
}

export interface UpdateDraftPatch {
  draftPayload?: Record<string, unknown>
  currentStep?: string
  currentQuoteId?: string | null
  holdExpiresAt?: Date | null
  // Refresh expiry — when set, the draft's ttl is bumped from now.
  refreshTtlMs?: number
}

export async function updateBookingDraft(
  db: AnyDrizzleDb,
  id: string,
  patch: UpdateDraftPatch,
): Promise<SelectBookingDraft | null> {
  const updates: Partial<InsertBookingDraft> = { updated_at: new Date() }
  if (patch.draftPayload !== undefined) updates.draft_payload = patch.draftPayload
  if (patch.currentStep !== undefined) updates.current_step = patch.currentStep
  if (patch.currentQuoteId !== undefined) updates.current_quote_id = patch.currentQuoteId
  if (patch.holdExpiresAt !== undefined) updates.hold_expires_at = patch.holdExpiresAt
  if (patch.refreshTtlMs !== undefined) {
    updates.expires_at = new Date(Date.now() + patch.refreshTtlMs)
  }

  const rows = (await db
    .update(bookingDraftsTable)
    .set(updates)
    .where(eq(bookingDraftsTable.id, id))
    .returning()) as SelectBookingDraft[]
  return rows[0] ?? null
}

/**
 * Claim a draft for exactly one booking.
 *
 * The `consumed_booking_id IS NULL` predicate is load-bearing: without it two
 * concurrent creates against the same draft both succeed and the second simply
 * overwrites the first's stamp, yielding two bookings from one draft and one
 * hold. Returns false when the draft was already spent, so the caller can roll
 * its transaction back.
 */
export async function markDraftConsumed(
  db: AnyDrizzleDb,
  id: string,
  bookingId: string,
): Promise<boolean> {
  const rows = (await db
    .update(bookingDraftsTable)
    .set({
      consumed_booking_id: bookingId,
      consumed_at: new Date(),
      updated_at: new Date(),
    })
    .where(and(eq(bookingDraftsTable.id, id), isNull(bookingDraftsTable.consumed_booking_id)))
    .returning()) as SelectBookingDraft[]
  return rows.length > 0
}

/**
 * Reaper helper — returns ids of drafts that are past TTL and not
 * yet consumed. Operators can run this in a daily cron and release
 * any associated holds before deleting.
 */
export async function findExpiredDrafts(
  db: AnyDrizzleDb,
  cutoff: Date = new Date(),
): Promise<SelectBookingDraft[]> {
  return (await db
    .select()
    .from(bookingDraftsTable)
    .where(
      and(
        lt(bookingDraftsTable.expires_at, cutoff),
        isNull(bookingDraftsTable.consumed_booking_id),
      ),
    )) as SelectBookingDraft[]
}

export async function deleteBookingDraft(db: AnyDrizzleDb, id: string): Promise<void> {
  await db.delete(bookingDraftsTable).where(eq(bookingDraftsTable.id, id))
}
