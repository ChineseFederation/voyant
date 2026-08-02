import type {
  BookingAmendment,
  BookingRevisionSnapshot,
  PreviewTravelerCorrectionInput,
  TravelerCorrectionPatch,
} from "@voyant-travel/bookings-contracts"
import { newId } from "@voyant-travel/db/lib/typeid"
import { and, asc, eq, or } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type BookingAmendmentActor,
  type BookingAmendmentEffects,
  type BookingAmendmentPolicyDecision,
  type BookingAmendmentRow,
  type BookingRevisionRow,
  bookingActivityLog,
  bookingAmendments,
  bookingRevisions,
  bookings,
  bookingTravelers,
} from "./schema.js"

const TRAVELER_IDENTITY_FIELDS = new Set<keyof TravelerCorrectionPatch>(["firstName", "lastName"])

const NO_EXTERNAL_EFFECTS: BookingAmendmentEffects = {
  finance: "not_required",
  legal: "not_required",
  documents: "not_required",
  fulfillment: "not_required",
  supplier: "not_required",
}

export interface BookingAmendmentCommandContext {
  actor: BookingAmendmentActor
  actorId?: string | null
  idempotencyKey: string
}

export type PreviewTravelerCorrectionResult =
  | { status: "ok"; amendment: BookingAmendment }
  | { status: "no_op"; bookingId: string; travelerId: string; bookingRevision: number }
  | { status: "not_found" }
  | { status: "idempotency_conflict" }
  | { status: "stale_revision"; currentBookingRevision: number }

export type AcceptBookingAmendmentResult =
  | { status: "ok"; amendment: BookingAmendment }
  | { status: "not_found" | "revision_mismatch" | "acceptance_not_required" }
  | { status: "already_applied"; amendment: BookingAmendment }
  | { status: "stale_revision"; currentBookingRevision: number }

export type ApplyBookingAmendmentResult =
  | { status: "ok"; amendment: BookingAmendment }
  | { status: "not_found" | "revision_mismatch" | "acceptance_required" | "invalid_state" }
  | { status: "stale_revision"; currentBookingRevision: number }

function serializeRevision(row: BookingRevisionRow) {
  return {
    id: row.id,
    amendmentId: row.amendmentId,
    bookingId: row.bookingId,
    bookingRevision: row.bookingRevision,
    role: row.role,
    snapshot: row.snapshot,
    changedFields: row.changedFields,
    authorizedBy: row.authorizedBy,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }
}

function serializeAmendment(row: BookingAmendmentRow, revisions: BookingRevisionRow[]) {
  const nextActions: ("accept" | "apply")[] = []
  if (row.status === "proposed") {
    nextActions.push(row.acceptanceRequired ? "accept" : "apply")
  } else if (row.status === "accepted") {
    nextActions.push("apply")
  }

  return {
    id: row.id,
    bookingId: row.bookingId,
    travelerId: row.travelerId,
    kind: "traveler_correction" as const,
    status: row.status,
    baseBookingRevision: row.baseBookingRevision,
    resultBookingRevision: row.resultBookingRevision,
    acceptanceRequired: row.acceptanceRequired,
    policyDecisions: row.policyDecisions,
    priceDelta: { amountCents: 0 as const, currency: row.priceCurrency },
    effects: row.effects,
    nextActions,
    requestedBy: row.requestedBy,
    requestedActor: row.requestedActor,
    reason: row.reason,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    acceptedBy: row.acceptedBy,
    acceptedActor: row.acceptedActor,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    appliedBy: row.appliedBy,
    appliedActor: row.appliedActor,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revisions: revisions.map(serializeRevision),
  } satisfies BookingAmendment
}

async function hydrateAmendment(db: PostgresJsDatabase, row: BookingAmendmentRow) {
  const revisions = await db
    .select()
    .from(bookingRevisions)
    .where(eq(bookingRevisions.amendmentId, row.id))
    .orderBy(asc(bookingRevisions.createdAt), asc(bookingRevisions.id))
  return serializeAmendment(row, revisions)
}

function snapshotTraveler(row: typeof bookingTravelers.$inferSelect) {
  return {
    id: row.id,
    personId: row.personId,
    participantType: row.participantType,
    travelerCategory: row.travelerCategory,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    preferredLanguage: row.preferredLanguage,
    isPrimary: row.isPrimary,
  }
}

function changedTravelerFields(
  traveler: typeof bookingTravelers.$inferSelect,
  patch: TravelerCorrectionPatch,
) {
  return (Object.keys(patch) as (keyof TravelerCorrectionPatch)[])
    .filter((field) => patch[field] !== traveler[field])
    .sort()
}

function sameTravelerPatch(left: TravelerCorrectionPatch, right: TravelerCorrectionPatch) {
  const fields = new Set([
    ...(Object.keys(left) as (keyof TravelerCorrectionPatch)[]),
    ...(Object.keys(right) as (keyof TravelerCorrectionPatch)[]),
  ])
  return [...fields].every(
    (field) =>
      Object.hasOwn(left, field) === Object.hasOwn(right, field) && left[field] === right[field],
  )
}

function policyFor(input: {
  actor: BookingAmendmentActor
  changedFields: (keyof TravelerCorrectionPatch)[]
}): { acceptanceRequired: boolean; decisions: BookingAmendmentPolicyDecision[] } {
  const changesIdentity = input.changedFields.some((field) => TRAVELER_IDENTITY_FIELDS.has(field))
  const acceptanceRequired = input.actor === "customer" && changesIdentity
  return {
    acceptanceRequired,
    decisions: [
      {
        code: "traveler-correction",
        version: "v1",
        decision: acceptanceRequired ? "acceptance_required" : "allowed",
        reason: acceptanceRequired
          ? "Customer-authorized identity corrections require explicit acceptance."
          : "The admitted correction has no price or external-system consequence.",
      },
    ],
  }
}

function applyTravelerPatch(
  traveler: ReturnType<typeof snapshotTraveler>,
  patch: TravelerCorrectionPatch,
) {
  return { ...traveler, ...patch }
}

export const bookingAmendmentService = {
  async previewTravelerCorrection(
    db: PostgresJsDatabase,
    bookingId: string,
    input: PreviewTravelerCorrectionInput,
    context: BookingAmendmentCommandContext,
  ): Promise<PreviewTravelerCorrectionResult> {
    return db.transaction(async (rawTx) => {
      const tx = rawTx as PostgresJsDatabase
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .for("update")
        .limit(1)
      if (!booking) return { status: "not_found" as const }

      const [existing] = await tx
        .select()
        .from(bookingAmendments)
        .where(
          and(
            eq(bookingAmendments.bookingId, booking.id),
            eq(bookingAmendments.previewIdempotencyKey, context.idempotencyKey),
          ),
        )
        .limit(1)
      if (existing) {
        const sameRequest =
          existing.travelerId === input.travelerId &&
          existing.baseBookingRevision === input.expectedBookingRevision &&
          existing.reason === input.reason &&
          sameTravelerPatch(existing.requestedPatch, input.patch)
        if (!sameRequest) return { status: "idempotency_conflict" as const }
        return { status: "ok" as const, amendment: await hydrateAmendment(tx, existing) }
      }

      if (booking.revision !== input.expectedBookingRevision) {
        return { status: "stale_revision" as const, currentBookingRevision: booking.revision }
      }

      const [traveler] = await tx
        .select()
        .from(bookingTravelers)
        .where(
          and(
            eq(bookingTravelers.id, input.travelerId),
            eq(bookingTravelers.bookingId, booking.id),
          ),
        )
        .limit(1)
      if (!traveler) return { status: "not_found" as const }

      const changedFields = changedTravelerFields(traveler, input.patch)
      if (changedFields.length === 0) {
        return {
          status: "no_op" as const,
          bookingId: booking.id,
          travelerId: traveler.id,
          bookingRevision: booking.revision,
        }
      }

      const travelers = await tx
        .select()
        .from(bookingTravelers)
        .where(eq(bookingTravelers.bookingId, booking.id))
        .orderBy(asc(bookingTravelers.createdAt), asc(bookingTravelers.id))
      const beforeTravelers = travelers.map(snapshotTraveler)
      const proposedTravelers = beforeTravelers.map((row) =>
        row.id === traveler.id ? applyTravelerPatch(row, input.patch) : row,
      )
      const policy = policyFor({ actor: context.actor, changedFields })
      const amendmentId = newId("booking_amendments")
      const now = new Date()
      const [amendment] = await tx
        .insert(bookingAmendments)
        .values({
          id: amendmentId,
          bookingId: booking.id,
          travelerId: traveler.id,
          baseBookingRevision: booking.revision,
          resultBookingRevision: booking.revision + 1,
          requestedPatch: input.patch,
          acceptanceRequired: policy.acceptanceRequired,
          policyDecisions: policy.decisions,
          priceCurrency: booking.sellCurrency,
          effects: NO_EXTERNAL_EFFECTS,
          previewIdempotencyKey: context.idempotencyKey,
          requestedBy: context.actorId ?? null,
          requestedActor: context.actor,
          reason: input.reason,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      if (!amendment) throw new Error("Booking Amendment insert did not return a row")

      const snapshots: { role: "before" | "proposed_after"; snapshot: BookingRevisionSnapshot }[] =
        [
          {
            role: "before",
            snapshot: {
              bookingId: booking.id,
              bookingNumber: booking.bookingNumber,
              revision: booking.revision,
              travelers: beforeTravelers,
            },
          },
          {
            role: "proposed_after",
            snapshot: {
              bookingId: booking.id,
              bookingNumber: booking.bookingNumber,
              revision: booking.revision + 1,
              travelers: proposedTravelers,
            },
          },
        ]
      const revisions = await tx
        .insert(bookingRevisions)
        .values(
          snapshots.map(({ role, snapshot }) => ({
            id: newId("booking_revisions"),
            amendmentId,
            bookingId: booking.id,
            bookingRevision: snapshot.revision,
            role,
            snapshot,
            changedFields,
            authorizedBy: context.actorId ?? null,
            reason: input.reason,
            createdAt: now,
          })),
        )
        .returning()

      return { status: "ok" as const, amendment: serializeAmendment(amendment, revisions) }
    })
  },

  async accept(
    db: PostgresJsDatabase,
    amendmentId: string,
    proposedRevisionId: string,
    context: BookingAmendmentCommandContext,
  ): Promise<AcceptBookingAmendmentResult> {
    return db.transaction(async (rawTx) => {
      const tx = rawTx as PostgresJsDatabase
      const [candidate] = await tx
        .select({ bookingId: bookingAmendments.bookingId })
        .from(bookingAmendments)
        .where(eq(bookingAmendments.id, amendmentId))
        .limit(1)
      if (!candidate) return { status: "not_found" as const }

      // Booking first is the global lock order for every Amendment transition.
      const [booking] = await tx
        .select({ revision: bookings.revision })
        .from(bookings)
        .where(eq(bookings.id, candidate.bookingId))
        .for("update")
        .limit(1)
      if (!booking) return { status: "not_found" as const }
      const [amendment] = await tx
        .select()
        .from(bookingAmendments)
        .where(eq(bookingAmendments.id, amendmentId))
        .for("update")
        .limit(1)
      if (!amendment) return { status: "not_found" as const }

      const [proposed] = await tx
        .select({ id: bookingRevisions.id })
        .from(bookingRevisions)
        .where(
          and(
            eq(bookingRevisions.id, proposedRevisionId),
            eq(bookingRevisions.amendmentId, amendment.id),
            eq(bookingRevisions.role, "proposed_after"),
          ),
        )
        .limit(1)
      if (!proposed) return { status: "revision_mismatch" as const }
      if (amendment.status === "applied") {
        return {
          status: "already_applied" as const,
          amendment: await hydrateAmendment(tx, amendment),
        }
      }
      if (booking.revision !== amendment.baseBookingRevision) {
        return { status: "stale_revision" as const, currentBookingRevision: booking.revision }
      }
      if (!amendment.acceptanceRequired) return { status: "acceptance_not_required" as const }
      if (amendment.status !== "proposed" && amendment.status !== "accepted") {
        return { status: "not_found" as const }
      }

      const now = new Date()
      const [accepted] =
        amendment.status === "accepted"
          ? [amendment]
          : await tx
              .update(bookingAmendments)
              .set({
                status: "accepted",
                acceptIdempotencyKey: context.idempotencyKey,
                acceptedAt: now,
                acceptedBy: context.actorId ?? null,
                acceptedActor: context.actor,
                updatedAt: now,
              })
              .where(eq(bookingAmendments.id, amendment.id))
              .returning()
      if (!accepted) throw new Error("Booking Amendment acceptance did not return a row")
      return { status: "ok" as const, amendment: await hydrateAmendment(tx, accepted) }
    })
  },

  async apply(
    db: PostgresJsDatabase,
    amendmentId: string,
    input: { expectedBookingRevision: number; proposedRevisionId: string },
    context: BookingAmendmentCommandContext,
  ): Promise<ApplyBookingAmendmentResult> {
    return db.transaction(async (rawTx) => {
      const tx = rawTx as PostgresJsDatabase
      const [candidate] = await tx
        .select({ bookingId: bookingAmendments.bookingId })
        .from(bookingAmendments)
        .where(eq(bookingAmendments.id, amendmentId))
        .limit(1)
      if (!candidate) return { status: "not_found" as const }

      // Booking first is the global lock order for conflicting amendments.
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, candidate.bookingId))
        .for("update")
        .limit(1)
      if (!booking) return { status: "not_found" as const }
      const [amendment] = await tx
        .select()
        .from(bookingAmendments)
        .where(eq(bookingAmendments.id, amendmentId))
        .for("update")
        .limit(1)
      if (!amendment) return { status: "not_found" as const }

      const [proposed] = await tx
        .select()
        .from(bookingRevisions)
        .where(
          and(
            eq(bookingRevisions.id, input.proposedRevisionId),
            eq(bookingRevisions.amendmentId, amendment.id),
            eq(bookingRevisions.role, "proposed_after"),
          ),
        )
        .limit(1)
      if (!proposed) return { status: "revision_mismatch" as const }
      if (amendment.status === "applied") {
        return { status: "ok" as const, amendment: await hydrateAmendment(tx, amendment) }
      }
      if (
        booking.revision !== input.expectedBookingRevision ||
        booking.revision !== amendment.baseBookingRevision
      ) {
        return { status: "stale_revision" as const, currentBookingRevision: booking.revision }
      }
      if (amendment.acceptanceRequired && amendment.status !== "accepted") {
        return { status: "acceptance_required" as const }
      }
      if (amendment.status !== "proposed" && amendment.status !== "accepted") {
        return { status: "invalid_state" as const }
      }

      const [traveler] = await tx
        .update(bookingTravelers)
        .set({ ...amendment.requestedPatch, updatedAt: new Date() })
        .where(
          and(
            eq(bookingTravelers.id, amendment.travelerId),
            eq(bookingTravelers.bookingId, booking.id),
          ),
        )
        .returning({ id: bookingTravelers.id })
      if (!traveler) {
        throw new Error("Booking Amendment traveler disappeared while the Booking lock was held")
      }

      const now = new Date()
      const [updatedBooking] = await tx
        .update(bookings)
        .set({ revision: amendment.resultBookingRevision, updatedAt: now })
        .where(
          and(eq(bookings.id, booking.id), eq(bookings.revision, amendment.baseBookingRevision)),
        )
        .returning({ revision: bookings.revision })
      if (!updatedBooking) {
        throw new Error("Booking Amendment revision advance failed while the Booking lock was held")
      }

      const [applied] = await tx
        .update(bookingAmendments)
        .set({
          status: "applied",
          applyIdempotencyKey: context.idempotencyKey,
          appliedAt: now,
          appliedBy: context.actorId ?? null,
          appliedActor: context.actor,
          updatedAt: now,
        })
        .where(eq(bookingAmendments.id, amendment.id))
        .returning()
      if (!applied) throw new Error("Booking Amendment apply did not return a row")

      await tx.insert(bookingActivityLog).values({
        bookingId: booking.id,
        actorId: context.actorId ?? null,
        activityType: "traveler_update",
        description: "Traveler correction applied through Booking Amendment",
        metadata: {
          amendmentId: amendment.id,
          travelerId: amendment.travelerId,
          bookingRevision: amendment.resultBookingRevision,
          reason: amendment.reason,
          actor: context.actor,
        },
      })

      return { status: "ok" as const, amendment: await hydrateAmendment(tx, applied) }
    })
  },

  async get(db: PostgresJsDatabase, bookingId: string, amendmentId: string) {
    const [row] = await db
      .select()
      .from(bookingAmendments)
      .where(and(eq(bookingAmendments.id, amendmentId), eq(bookingAmendments.bookingId, bookingId)))
      .limit(1)
    return row ? hydrateAmendment(db, row) : null
  },

  async list(db: PostgresJsDatabase, bookingId: string) {
    const rows = await db
      .select()
      .from(bookingAmendments)
      .where(eq(bookingAmendments.bookingId, bookingId))
      .orderBy(asc(bookingAmendments.createdAt), asc(bookingAmendments.id))
    return Promise.all(rows.map((row) => hydrateAmendment(db, row)))
  },

  async customerCanAccess(
    db: PostgresJsDatabase,
    bookingId: string,
    identity: { personId?: string | null; organizationId?: string | null },
  ) {
    if (!identity.personId && !identity.organizationId) return false
    const ownerConditions = []
    if (identity.personId) {
      ownerConditions.push(eq(bookings.personId, identity.personId))
      ownerConditions.push(
        and(
          eq(bookingTravelers.bookingId, bookings.id),
          eq(bookingTravelers.personId, identity.personId),
        ),
      )
    }
    if (identity.organizationId) {
      ownerConditions.push(eq(bookings.organizationId, identity.organizationId))
    }
    const [row] = await db
      .selectDistinct({ id: bookings.id })
      .from(bookings)
      .leftJoin(bookingTravelers, eq(bookingTravelers.bookingId, bookings.id))
      .where(and(eq(bookings.id, bookingId), or(...ownerConditions)))
      .limit(1)
    return Boolean(row)
  },
}
