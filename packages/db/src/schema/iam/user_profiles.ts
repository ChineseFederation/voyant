import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { z } from "zod"

import { authUser } from "./auth.js"

/**
 * Seating preference enum for flights
 */
export const seatingPreferences = pgEnum("seating_preference", [
  "aisle",
  "window",
  "middle",
  "no_preference",
])

/**
 * User Profiles
 *
 * The user's app profile containing:
 * - Basic profile info (plain text - searchable)
 * - App preferences (plain text - low risk)
 * - Non-sensitive travel preferences (seatingPreference)
 * - Admin flags (isSuperAdmin, isSupportUser)
 *
 * PK is `authUser.id` (Better Auth user ID) — NOT a TypeID.
 * 1:1 with Better Auth's `user` table.
 *
 * Toxic-PII (passport numbers, dietary, accessibility, loyalty,
 * insurance) lives on `crm.people` — that table is the canonical store
 * for facts about a human, regardless of whether they ever log in.
 * Auth-having storefront customers join `auth.user` → `people` via
 * `(people.source = 'auth.user' AND people.sourceRef = userId)`.
 */
export const userProfilesTable = pgTable(
  "user_profiles",
  {
    // PK = Better Auth user.id (text, not TypeID)
    id: text("id")
      .primaryKey()
      .references(() => authUser.id, { onDelete: "cascade" }),

    // ============================================
    // PLAIN TEXT FIELDS (searchable, TDE protected)
    // ============================================

    // Basic profile
    firstName: text("first_name"),
    lastName: text("last_name"),
    avatarUrl: text("avatar_url"),

    // App preferences (low risk)
    locale: text("locale").notNull().default("zh-CN"),
    timezone: text("timezone"),
    uiPrefs: jsonb("ui_prefs").$type<Record<string, unknown>>().default({}),

    // Non-sensitive travel preferences
    seatingPreference: seatingPreferences("seating_preference"),

    // ============================================
    // ADMIN FLAGS (moved from identities)
    // ============================================

    /** Platform-level admin flag */
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),

    /** Support user flag - don't count towards seat limits */
    isSupportUser: boolean("is_support_user").notNull().default(false),

    // ============================================
    // USER STATE
    // ============================================

    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    notificationDefaults: jsonb("notification_defaults")
      .$type<Record<string, unknown>>()
      .default({}),

    // ============================================
    // CONSENT & AUDIT
    // ============================================

    marketingConsent: boolean("marketing_consent").notNull().default(false),
    marketingConsentAt: timestamp("marketing_consent_at", { withTimezone: true }),
    marketingConsentSource: text("marketing_consent_source"),

    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Fast lookup by name for search
    index("idx_user_profiles_name").on(t.firstName, t.lastName),
  ],
).enableRLS()

export type InsertUserProfile = typeof userProfilesTable.$inferInsert
export type SelectUserProfile = typeof userProfilesTable.$inferSelect

const userProfileCoreSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().max(200).optional().nullable(),
  lastName: z.string().max(200).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  locale: z.string().max(10).default("zh-CN"),
  timezone: z.string().max(64).optional().nullable(),
  uiPrefs: z.record(z.string(), z.unknown()).optional().nullable(),
  seatingPreference: z.enum(["aisle", "window", "middle", "no_preference"]).optional().nullable(),
  isSuperAdmin: z.boolean().default(false),
  isSupportUser: z.boolean().default(false),
  termsAcceptedAt: z.date().optional().nullable(),
  notificationDefaults: z.record(z.string(), z.unknown()).optional().nullable(),
  marketingConsent: z.boolean().default(false),
  marketingConsentAt: z.date().optional().nullable(),
  marketingConsentSource: z.string().max(255).optional().nullable(),
  lastActiveAt: z.date().optional().nullable(),
})

export const userProfileInsertSchema = userProfileCoreSchema
export const userProfileUpdateSchema = userProfileCoreSchema.partial().omit({ id: true })
export const userProfileSelectSchema = userProfileCoreSchema.extend({
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type UserProfile = z.infer<typeof userProfileSelectSchema>
export type NewUserProfile = z.infer<typeof userProfileInsertSchema>
export type UpdateUserProfile = z.infer<typeof userProfileUpdateSchema>

/**
 * Decrypted user profile shape — toxic-PII fields (documents, dietary,
 * accessibility, loyalty, insurance) now live on `crm.people` and are
 * decrypted by the CRM service rather than user_profiles.
 */
export const decryptedUserProfileSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  locale: z.string(),
  timezone: z.string().nullable(),
  uiPrefs: z.record(z.string(), z.unknown()).nullable(),
  seatingPreference: z.string().nullable(),
  isSuperAdmin: z.boolean(),
  isSupportUser: z.boolean(),
  termsAcceptedAt: z.date().nullable(),
  notificationDefaults: z.record(z.string(), z.unknown()).nullable(),
  marketingConsent: z.boolean(),
  marketingConsentAt: z.date().nullable(),
  marketingConsentSource: z.string().nullable(),
  lastActiveAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type DecryptedUserProfile = z.infer<typeof decryptedUserProfileSchema>
