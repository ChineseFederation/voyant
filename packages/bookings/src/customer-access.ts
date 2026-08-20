import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import { and, eq, isNotNull, isNull } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { bookings } from "./schema-core.js"
import {
  type BookingCustomerAccessGrant,
  bookingCustomerAccessCommands,
  bookingCustomerAccessGrants,
} from "./schema-customer-access.js"

export type BuyerAccountKind = "personal" | "business"
export type BookingCustomerAccessRole = "owner"
export type BookingCustomerAccessSource =
  | "authenticated_commit"
  | "verified_booking_claim"
  | "staff_grant"
  | "legacy_session_backfill"

export interface BuyerAccountRef {
  id: string
  kind: BuyerAccountKind
}

export interface GrantBookingCustomerAccessInput {
  bookingId: string
  buyerAccount: BuyerAccountRef
  role: BookingCustomerAccessRole
  source: BookingCustomerAccessSource
  proofRef?: string | null
  grantedByPrincipalId?: string | null
  grantedByMembershipId?: string | null
  grantedByMembershipRole?: string | null
  idempotencyKey: string
  now?: Date
}

export interface RevokeBookingCustomerAccessInput {
  bookingId: string
  grantId: string
  reason: string
  revokedByPrincipalId: string
  idempotencyKey: string
  now?: Date
}

export type GrantBookingCustomerAccessResult =
  | {
      status: "created" | "reactivated" | "unchanged" | "replayed"
      grant: BookingCustomerAccessGrant
    }
  | { status: "idempotency_conflict" | "not_found"; grant?: undefined }

export type RevokeBookingCustomerAccessResult =
  | { status: "revoked" | "unchanged" | "replayed"; grant: BookingCustomerAccessGrant }
  | { status: "idempotency_conflict" | "not_found"; grant?: undefined }

function assertBuyerAccount(account: BuyerAccountRef) {
  if (!account.id.startsWith(`${account.kind}:`) || account.id.length <= account.kind.length + 1) {
    throw new Error("Buyer Account id does not match its kind")
  }
}

async function fingerprint(value: Record<string, unknown>) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function findGrantById(tx: PostgresJsDatabase, grantId: string, lock = false) {
  const query = tx
    .select()
    .from(bookingCustomerAccessGrants)
    .where(eq(bookingCustomerAccessGrants.id, grantId))
    .limit(1)
  const [grant] = lock ? await query.for("update") : await query
  return grant ?? null
}

async function bookingExists(tx: PostgresJsDatabase, bookingId: string) {
  const [booking] = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
  return !!booking
}

async function claimCommand(
  tx: PostgresJsDatabase,
  input: {
    scope: string
    idempotencyKey: string
    requestFingerprint: string
    action: "grant" | "revoke"
    bookingId: string
  },
) {
  const [created] = await tx
    .insert(bookingCustomerAccessCommands)
    .values({
      commandScope: input.scope,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      action: input.action,
      bookingId: input.bookingId,
    })
    .onConflictDoNothing({
      target: [
        bookingCustomerAccessCommands.commandScope,
        bookingCustomerAccessCommands.idempotencyKey,
      ],
    })
    .returning()
  if (created) return { status: "claimed" as const, command: created }

  const [existing] = await tx
    .select()
    .from(bookingCustomerAccessCommands)
    .where(
      and(
        eq(bookingCustomerAccessCommands.commandScope, input.scope),
        eq(bookingCustomerAccessCommands.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  if (!existing) throw new Error("Customer access command could not be claimed or replayed")
  if (
    existing.action !== input.action ||
    existing.bookingId !== input.bookingId ||
    existing.requestFingerprint !== input.requestFingerprint
  ) {
    return { status: "conflict" as const }
  }
  return { status: "replay" as const, command: existing }
}

async function completeCommand(
  tx: PostgresJsDatabase,
  commandId: string,
  grantId: string | null,
  resultStatus: string,
  completedAt: Date,
) {
  await tx
    .update(bookingCustomerAccessCommands)
    .set({ grantId, resultStatus, completedAt })
    .where(eq(bookingCustomerAccessCommands.id, commandId))
}

/**
 * Create or reactivate a customer-plane Booking grant.
 *
 * This command deliberately does not open a transaction. Callers must pass the
 * transaction that owns the surrounding booking/claim mutation so the grant,
 * command journal and outbox event share its commit or rollback.
 */
export async function grantBookingCustomerAccess(
  tx: PostgresJsDatabase,
  input: GrantBookingCustomerAccessInput,
): Promise<GrantBookingCustomerAccessResult> {
  assertBuyerAccount(input.buyerAccount)
  if (!(await bookingExists(tx, input.bookingId))) return { status: "not_found" }
  const now = input.now ?? new Date()
  const requestFingerprint = await fingerprint({
    bookingId: input.bookingId,
    buyerAccountId: input.buyerAccount.id,
    buyerAccountKind: input.buyerAccount.kind,
    role: input.role,
    source: input.source,
    proofRef: input.proofRef ?? null,
    grantedByPrincipalId: input.grantedByPrincipalId ?? null,
    grantedByMembershipId: input.grantedByMembershipId ?? null,
    grantedByMembershipRole: input.grantedByMembershipRole ?? null,
  })
  const claimed = await claimCommand(tx, {
    scope: `booking-customer-access:grant:${input.bookingId}`,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    action: "grant",
    bookingId: input.bookingId,
  })
  if (claimed.status === "conflict") return { status: "idempotency_conflict" }
  if (claimed.status === "replay") {
    const grant = claimed.command.grantId ? await findGrantById(tx, claimed.command.grantId) : null
    return grant ? { status: "replayed", grant } : { status: "not_found" }
  }

  const values = {
    bookingId: input.bookingId,
    buyerAccountId: input.buyerAccount.id,
    buyerAccountKind: input.buyerAccount.kind,
    role: input.role,
    source: input.source,
    proofRef: input.proofRef ?? null,
    grantedByPrincipalId: input.grantedByPrincipalId ?? null,
    grantedByMembershipId: input.grantedByMembershipId ?? null,
    grantedByMembershipRole: input.grantedByMembershipRole ?? null,
    createdAt: now,
    updatedAt: now,
  }
  const [inserted] = await tx
    .insert(bookingCustomerAccessGrants)
    .values(values)
    .onConflictDoNothing({
      target: [
        bookingCustomerAccessGrants.bookingId,
        bookingCustomerAccessGrants.buyerAccountId,
        bookingCustomerAccessGrants.role,
      ],
    })
    .returning()

  const [reactivated] = inserted
    ? []
    : await tx
        .update(bookingCustomerAccessGrants)
        .set({
          buyerAccountKind: input.buyerAccount.kind,
          source: input.source,
          proofRef: input.proofRef ?? null,
          grantedByPrincipalId: input.grantedByPrincipalId ?? null,
          grantedByMembershipId: input.grantedByMembershipId ?? null,
          grantedByMembershipRole: input.grantedByMembershipRole ?? null,
          updatedAt: now,
          revokedAt: null,
          revokedByPrincipalId: null,
          revocationReason: null,
        })
        .where(
          and(
            eq(bookingCustomerAccessGrants.bookingId, input.bookingId),
            eq(bookingCustomerAccessGrants.buyerAccountId, input.buyerAccount.id),
            eq(bookingCustomerAccessGrants.role, input.role),
            isNotNull(bookingCustomerAccessGrants.revokedAt),
          ),
        )
        .returning()

  const grant =
    inserted ??
    reactivated ??
    (
      await tx
        .select()
        .from(bookingCustomerAccessGrants)
        .where(
          and(
            eq(bookingCustomerAccessGrants.bookingId, input.bookingId),
            eq(bookingCustomerAccessGrants.buyerAccountId, input.buyerAccount.id),
            eq(bookingCustomerAccessGrants.role, input.role),
          ),
        )
        .limit(1)
    )[0]
  if (!grant) return { status: "not_found" }

  const status = inserted ? "created" : reactivated ? "reactivated" : "unchanged"
  await completeCommand(tx, claimed.command.id, grant.id, status, now)
  if (status !== "unchanged") {
    await insertOutboxEvents(tx, [
      {
        name: "booking.customer_access.granted",
        data: {
          bookingId: grant.bookingId,
          grantId: grant.id,
          buyerAccountKind: grant.buyerAccountKind,
          source: grant.source,
          role: grant.role,
          occurredAt: now.toISOString(),
          actorId: grant.grantedByPrincipalId,
        },
        metadata: {
          category: "domain",
          source: "service",
          eventId: `evt_booking_customer_access_granted_${claimed.command.id}`,
        },
      },
    ])
  }
  return { status, grant }
}

/** See grantBookingCustomerAccess: the caller owns the transaction. */
export async function revokeBookingCustomerAccess(
  tx: PostgresJsDatabase,
  input: RevokeBookingCustomerAccessInput,
): Promise<RevokeBookingCustomerAccessResult> {
  const target = await findGrantById(tx, input.grantId, true)
  if (!target || target.bookingId !== input.bookingId) return { status: "not_found" }
  if (
    target.revokedAt &&
    (target.revokedByPrincipalId !== input.revokedByPrincipalId ||
      target.revocationReason !== input.reason)
  ) {
    return { status: "idempotency_conflict" }
  }
  const now = input.now ?? new Date()
  const requestFingerprint = await fingerprint({
    bookingId: input.bookingId,
    grantId: input.grantId,
    reason: input.reason,
    revokedByPrincipalId: input.revokedByPrincipalId,
  })
  const claimed = await claimCommand(tx, {
    scope: `booking-customer-access:revoke:${input.bookingId}:${input.grantId}`,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    action: "revoke",
    bookingId: input.bookingId,
  })
  if (claimed.status === "conflict") return { status: "idempotency_conflict" }
  if (claimed.status === "replay") {
    const grant = claimed.command.grantId ? await findGrantById(tx, claimed.command.grantId) : null
    return grant ? { status: "replayed", grant } : { status: "not_found" }
  }

  const [revoked] = await tx
    .update(bookingCustomerAccessGrants)
    .set({
      revokedAt: now,
      revokedByPrincipalId: input.revokedByPrincipalId,
      revocationReason: input.reason,
      updatedAt: now,
    })
    .where(
      and(
        eq(bookingCustomerAccessGrants.id, input.grantId),
        eq(bookingCustomerAccessGrants.bookingId, input.bookingId),
        isNull(bookingCustomerAccessGrants.revokedAt),
      ),
    )
    .returning()

  const existing = revoked ?? (await findGrantById(tx, input.grantId))
  if (!existing || existing.bookingId !== input.bookingId) return { status: "not_found" }
  if (
    !revoked &&
    (existing.revokedByPrincipalId !== input.revokedByPrincipalId ||
      existing.revocationReason !== input.reason)
  ) {
    await tx
      .delete(bookingCustomerAccessCommands)
      .where(eq(bookingCustomerAccessCommands.id, claimed.command.id))
    return { status: "idempotency_conflict" }
  }

  const status = revoked ? "revoked" : "unchanged"
  await completeCommand(tx, claimed.command.id, existing.id, status, now)
  if (revoked) {
    await insertOutboxEvents(tx, [
      {
        name: "booking.customer_access.revoked",
        data: {
          bookingId: revoked.bookingId,
          grantId: revoked.id,
          buyerAccountKind: revoked.buyerAccountKind,
          source: revoked.source,
          role: revoked.role,
          occurredAt: now.toISOString(),
          actorId: revoked.revokedByPrincipalId,
        },
        metadata: {
          category: "domain",
          source: "service",
          eventId: `evt_booking_customer_access_revoked_${claimed.command.id}`,
        },
      },
    ])
  }
  return { status, grant: existing }
}

export async function hasActiveBookingCustomerAccess(
  db: PostgresJsDatabase,
  input: { bookingId: string; buyerAccountId: string; role?: BookingCustomerAccessRole },
): Promise<boolean> {
  const [grant] = await db
    .select({ id: bookingCustomerAccessGrants.id })
    .from(bookingCustomerAccessGrants)
    .where(
      and(
        eq(bookingCustomerAccessGrants.bookingId, input.bookingId),
        eq(bookingCustomerAccessGrants.buyerAccountId, input.buyerAccountId),
        eq(bookingCustomerAccessGrants.role, input.role ?? "owner"),
        isNull(bookingCustomerAccessGrants.revokedAt),
      ),
    )
    .limit(1)
  return !!grant
}

export async function listAccessibleBookingIds(
  db: PostgresJsDatabase,
  input: { buyerAccount: BuyerAccountRef; role?: BookingCustomerAccessRole },
): Promise<string[]> {
  assertBuyerAccount(input.buyerAccount)
  const rows = await db
    .select({ bookingId: bookingCustomerAccessGrants.bookingId })
    .from(bookingCustomerAccessGrants)
    .where(
      and(
        eq(bookingCustomerAccessGrants.buyerAccountId, input.buyerAccount.id),
        eq(bookingCustomerAccessGrants.buyerAccountKind, input.buyerAccount.kind),
        eq(bookingCustomerAccessGrants.role, input.role ?? "owner"),
        isNull(bookingCustomerAccessGrants.revokedAt),
      ),
    )
  return rows.map((row) => row.bookingId)
}

export function listBookingCustomerAccess(db: PostgresJsDatabase, bookingId: string) {
  return db
    .select()
    .from(bookingCustomerAccessGrants)
    .where(eq(bookingCustomerAccessGrants.bookingId, bookingId))
}
