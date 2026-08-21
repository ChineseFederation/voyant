import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { bookings } from "./schema-core.js"

export const bookingCustomerAccessGrants = pgTable(
  "booking_customer_access_grants",
  {
    id: typeId("booking_customer_access_grants"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    buyerAccountId: text("buyer_account_id").notNull(),
    buyerAccountKind: text("buyer_account_kind").notNull(),
    role: text("role").notNull(),
    source: text("source").notNull(),
    proofRef: text("proof_ref"),
    grantedByPrincipalId: text("granted_by_principal_id"),
    grantedByMembershipId: text("granted_by_membership_id"),
    grantedByMembershipRole: text("granted_by_membership_role"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByPrincipalId: text("revoked_by_principal_id"),
    revocationReason: text("revocation_reason"),
  },
  (table) => [
    uniqueIndex("uq_booking_customer_access_grant_subject_role").on(
      table.bookingId,
      table.buyerAccountId,
      table.role,
    ),
    index("idx_booking_customer_access_grants_active_account_booking")
      .on(table.buyerAccountId, table.bookingId)
      .where(sql`${table.revokedAt} IS NULL`),
    index("idx_booking_customer_access_grants_booking").on(table.bookingId),
    check(
      "ck_booking_customer_access_grants_account_kind",
      sql`(${table.buyerAccountKind} = 'personal' AND ${table.buyerAccountId} LIKE 'personal:%') OR (${table.buyerAccountKind} = 'business' AND ${table.buyerAccountId} LIKE 'business:%')`,
    ),
    check("ck_booking_customer_access_grants_role", sql`${table.role} = 'owner'`),
    check(
      "ck_booking_customer_access_grants_source",
      sql`${table.source} IN ('authenticated_commit', 'verified_booking_claim', 'staff_grant', 'legacy_session_backfill')`,
    ),
    check(
      "ck_booking_customer_access_grants_revocation",
      sql`(${table.revokedAt} IS NULL AND ${table.revokedByPrincipalId} IS NULL AND ${table.revocationReason} IS NULL) OR (${table.revokedAt} IS NOT NULL AND ${table.revokedByPrincipalId} IS NOT NULL AND ${table.revocationReason} IS NOT NULL)`,
    ),
    check(
      "ck_booking_customer_access_grants_membership_audit",
      sql`(${table.grantedByMembershipId} IS NULL AND ${table.grantedByMembershipRole} IS NULL) OR (${table.grantedByMembershipId} IS NOT NULL AND ${table.grantedByMembershipRole} IS NOT NULL)`,
    ),
  ],
)

export const bookingCustomerAccessCommands = pgTable(
  "booking_customer_access_commands",
  {
    id: typeId("booking_customer_access_commands"),
    commandScope: text("command_scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    action: text("action").notNull(),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    grantId: text("grant_id"),
    resultStatus: text("result_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_booking_customer_access_command_idempotency").on(
      table.commandScope,
      table.idempotencyKey,
    ),
    index("idx_booking_customer_access_commands_booking").on(table.bookingId),
    check(
      "ck_booking_customer_access_commands_action",
      sql`${table.action} IN ('grant', 'revoke')`,
    ),
  ],
)

export const customerBookingAccessClaims = pgTable(
  "customer_booking_access_claims",
  {
    id: typeId("customer_booking_access_claims"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    buyerAccountId: text("buyer_account_id").notNull(),
    buyerAccountKind: text("buyer_account_kind").notNull(),
    challengeId: text("challenge_id").notNull(),
    grantId: text("grant_id"),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    confirmationIdempotencyKey: text("confirmation_idempotency_key"),
    confirmationRequestFingerprint: text("confirmation_request_fingerprint"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_customer_booking_access_claim_account_idempotency").on(
      table.buyerAccountId,
      table.idempotencyKey,
    ),
    uniqueIndex("uq_customer_booking_access_claim_challenge").on(table.challengeId),
    index("idx_customer_booking_access_claim_booking_account").on(
      table.bookingId,
      table.buyerAccountId,
    ),
    index("idx_customer_booking_access_claim_status_expires").on(table.status, table.expiresAt),
    check(
      "ck_customer_booking_access_claim_account_kind",
      sql`(${table.buyerAccountKind} = 'personal' AND ${table.buyerAccountId} LIKE 'personal:%') OR (${table.buyerAccountKind} = 'business' AND ${table.buyerAccountId} LIKE 'business:%')`,
    ),
    check(
      "ck_customer_booking_access_claim_status",
      sql`${table.status} IN ('pending', 'granted', 'expired', 'failed')`,
    ),
    check(
      "ck_customer_booking_access_claim_granted_at",
      sql`(${table.status} = 'granted' AND ${table.grantedAt} IS NOT NULL AND ${table.grantId} IS NOT NULL AND ${table.confirmationIdempotencyKey} IS NOT NULL AND ${table.confirmationRequestFingerprint} IS NOT NULL) OR (${table.status} <> 'granted' AND ${table.grantedAt} IS NULL AND ${table.grantId} IS NULL AND ${table.confirmationIdempotencyKey} IS NULL AND ${table.confirmationRequestFingerprint} IS NULL)`,
    ),
  ],
)

export type BookingCustomerAccessGrant = typeof bookingCustomerAccessGrants.$inferSelect
export type BookingCustomerAccessCommand = typeof bookingCustomerAccessCommands.$inferSelect
export type CustomerBookingAccessClaim = typeof customerBookingAccessClaims.$inferSelect
