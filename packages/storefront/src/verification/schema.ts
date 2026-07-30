import type { LinkableDefinition, Module } from "@voyant-travel/core"
import { typeId } from "@voyant-travel/db/lib/typeid-column"
import { relations } from "drizzle-orm"
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const storefrontVerificationChannelEnum = pgEnum("storefront_verification_channel", [
  "email",
  "sms",
])

export const storefrontVerificationStatusEnum = pgEnum("storefront_verification_status", [
  "pending",
  "verified",
  "expired",
  "failed",
  "cancelled",
])

export const storefrontVerificationChallenges = pgTable(
  "storefront_verification_challenges",
  {
    id: typeId("storefront_verification_challenges"),
    channel: storefrontVerificationChannelEnum("channel").notNull(),
    destination: text("destination").notNull(),
    purpose: text("purpose").notNull().default("contact_confirmation"),
    codeHash: text("code_hash").notNull(),
    status: storefrontVerificationStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    /**
     * What this challenge authorizes, beyond its purpose — the booking draft
     * id for a self-service create. Bound at start, so a challenge verified
     * for one draft cannot authorize another.
     */
    subjectRef: text("subject_ref"),
    /** Set exactly once, when the challenge is spent. */
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    /** What consumed it — the created booking id. */
    consumedRef: text("consumed_ref"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_storefront_verification_channel").on(table.channel),
    index("idx_storefront_verification_destination").on(table.destination),
    index("idx_storefront_verification_purpose").on(table.purpose),
    index("idx_storefront_verification_status").on(table.status),
    index("idx_storefront_verification_lookup").on(
      table.channel,
      table.destination,
      table.purpose,
      table.updatedAt,
      table.createdAt,
    ),
    index("idx_storefront_verification_subject").on(table.purpose, table.subjectRef),
  ],
)

export const storefrontVerificationChallengesRelations = relations(
  storefrontVerificationChallenges,
  () => ({}),
)

export type StorefrontVerificationChallenge = typeof storefrontVerificationChallenges.$inferSelect
export type NewStorefrontVerificationChallenge =
  typeof storefrontVerificationChallenges.$inferInsert

export const storefrontVerificationLinkable: LinkableDefinition = {
  module: "storefront-verification",
  entity: "storefrontVerificationChallenge",
  table: "storefront_verification_challenges",
  idPrefix: "svch",
}

export const storefrontVerificationModule: Module = {
  name: "storefront-verification",
  linkable: {
    storefrontVerificationChallenge: storefrontVerificationLinkable,
  },
}
