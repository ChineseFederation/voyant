/**
 * Better Auth storage for the storefront-customer realm.
 *
 * Customer identities intentionally live in their own Postgres schema. They
 * never share unique constraints, foreign keys, sessions, accounts, or
 * verification tokens with Operator administrators.
 */
import { sql } from "drizzle-orm"
import { boolean, check, index, pgSchema, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

export const customerAuthSchema = pgSchema("customer_auth")

export const customerAuthUser = customerAuthSchema.table(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull(),
    phoneNumber: text("phone_number"),
    phoneNumberVerified: boolean("phone_number_verified").notNull().default(false),
    image: text("image"),
    /** Records whether signup intended to issue a personal buyer entitlement. */
    personalBuyerEntitlementEligible: boolean("personal_buyer_entitlement_eligible")
      .notNull()
      .default(false),
    /** Canonical Relationships Person linked to this customer identity. */
    relationshipPersonId: text("relationship_person_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("customer_auth_user_email_unique")
      .on(table.email)
      .where(sql`${table.email} IS NOT NULL`),
    uniqueIndex("customer_auth_user_phone_unique")
      .on(table.phoneNumber)
      .where(sql`${table.phoneNumber} IS NOT NULL`),
    uniqueIndex("customer_auth_user_relationship_person_unique")
      .on(table.relationshipPersonId)
      .where(sql`${table.relationshipPersonId} IS NOT NULL`),
    check(
      "customer_auth_user_email_or_phone",
      sql`${table.email} IS NOT NULL OR ${table.phoneNumber} IS NOT NULL`,
    ),
  ],
)

export const customerAuthSession = customerAuthSchema.table("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => customerAuthUser.id, { onDelete: "cascade" }),
  /** Better Auth organization membership container selected for this session. */
  activeOrganizationId: text("active_organization_id"),
})

export const customerAuthAccount = customerAuthSchema.table(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => customerAuthUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("customer_auth_account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
  ],
)

export const customerAuthVerification = customerAuthSchema.table("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
})

/**
 * Better Auth business-membership container for storefront customers.
 *
 * This is deliberately not the canonical CRM Organization. The optional
 * relationshipOrganizationId is a loose cross-package link to the Relationships
 * module and business authorization fails closed while that mapping is absent.
 */
export const customerAuthOrganization = customerAuthSchema.table(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    metadata: text("metadata"),
    relationshipOrganizationId: text("relationship_organization_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("customer_auth_organization_slug_unique").on(table.slug),
    uniqueIndex("customer_auth_organization_relationship_unique")
      .on(table.relationshipOrganizationId)
      .where(sql`${table.relationshipOrganizationId} IS NOT NULL`),
  ],
)

export const customerAuthMember = customerAuthSchema.table(
  "member",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => customerAuthUser.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => customerAuthOrganization.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("customer_auth_member_user_idx").on(table.userId),
    index("customer_auth_member_organization_idx").on(table.organizationId),
    uniqueIndex("customer_auth_member_user_organization_unique").on(
      table.userId,
      table.organizationId,
    ),
  ],
)

export const customerAuthInvitation = customerAuthSchema.table(
  "invitation",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => customerAuthUser.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => customerAuthOrganization.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("customer_auth_invitation_email_idx").on(table.email),
    index("customer_auth_invitation_organization_idx").on(table.organizationId),
    uniqueIndex("customer_auth_invitation_pending_email_organization_unique")
      .on(sql`lower(${table.email})`, table.organizationId)
      .where(sql`${table.status} = 'pending'`),
    check(
      "customer_auth_invitation_role_check",
      sql`${table.role} IN ('owner', 'admin', 'member')`,
    ),
    check(
      "customer_auth_invitation_status_check",
      sql`${table.status} IN ('pending', 'accepted', 'rejected', 'canceled')`,
    ),
  ],
)

/** Durable workflow state for customer business-account onboarding. */
export const customerAuthBusinessAccountRequest = customerAuthSchema.table(
  "business_account_request",
  {
    id: text("id").primaryKey(),
    requesterUserId: text("requester_user_id")
      .notNull()
      .references(() => customerAuthUser.id, { onDelete: "cascade" }),
    publicApiOrigin: text("storefront_origin").notNull(),
    mode: text("mode").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    taxId: text("tax_id"),
    website: text("website"),
    status: text("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    authOrganizationId: text("auth_organization_id").references(() => customerAuthOrganization.id, {
      onDelete: "set null",
    }),
    relationshipOrganizationId: text("relationship_organization_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** Audit-only admin-realm subject. Deliberately has no customer-auth FK. */
    decidedBy: text("decided_by"),
    decisionReason: text("decision_reason"),
  },
  (table) => [
    index("customer_auth_business_request_requester_idx").on(table.requesterUserId),
    index("customer_auth_business_request_status_idx").on(table.status, table.createdAt),
    uniqueIndex("customer_auth_business_request_requester_idempotency_unique").on(
      table.requesterUserId,
      table.idempotencyKey,
    ),
    uniqueIndex("customer_auth_business_request_pending_requester_unique")
      .on(table.requesterUserId)
      .where(sql`${table.status} = 'pending'`),
    check(
      "customer_auth_business_request_mode_check",
      sql`${table.mode} IN ('open', 'request', 'invite-only')`,
    ),
    check(
      "customer_auth_business_request_status_check",
      sql`${table.status} IN ('pending', 'approved', 'rejected', 'canceled')`,
    ),
  ],
)

/** Durable entitlement to use the signed-in customer identity as a personal buyer. */
export const customerAuthPersonalBuyerAccount = customerAuthSchema.table(
  "personal_buyer_account",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => customerAuthUser.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("customer_auth_personal_buyer_revoked_idx").on(table.revokedAt)],
)

export type SelectCustomerAuthUser = typeof customerAuthUser.$inferSelect
export type InsertCustomerAuthUser = typeof customerAuthUser.$inferInsert
export type SelectCustomerAuthSession = typeof customerAuthSession.$inferSelect
export type InsertCustomerAuthSession = typeof customerAuthSession.$inferInsert
export type SelectCustomerAuthOrganization = typeof customerAuthOrganization.$inferSelect
export type InsertCustomerAuthOrganization = typeof customerAuthOrganization.$inferInsert
export type SelectCustomerAuthMember = typeof customerAuthMember.$inferSelect
export type InsertCustomerAuthMember = typeof customerAuthMember.$inferInsert
export type SelectCustomerAuthBusinessAccountRequest =
  typeof customerAuthBusinessAccountRequest.$inferSelect
export type InsertCustomerAuthBusinessAccountRequest =
  typeof customerAuthBusinessAccountRequest.$inferInsert
export type SelectCustomerAuthPersonalBuyerAccount =
  typeof customerAuthPersonalBuyerAccount.$inferSelect
export type InsertCustomerAuthPersonalBuyerAccount =
  typeof customerAuthPersonalBuyerAccount.$inferInsert
