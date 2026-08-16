import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import type { KmsEnvelope } from "@voyant-travel/db/schema/iam"
import { sql } from "drizzle-orm"
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { insuranceApplicationStatusEnum } from "./schema-shared.js"

/**
 * An application held open at an insurer against a quote the traveller accepted.
 *
 * It exists BEFORE the booking does: the traveller accepts an offer inside the
 * booking session, the application is opened so the insurer holds the price,
 * and only then does payment produce a booking. So `booking_id` is nullable and
 * carries no foreign key — the application is not orphaned by a session that
 * never converts, and it is not blocked by a booking that does not exist yet.
 *
 * Everything the insurer needs about a person is toxic and lives encrypted:
 * `contracting_party_encrypted` (the person entering the contract) and
 * `answers_encrypted` (underwriting answers, which routinely include medical
 * declarations). The plaintext columns are the ones an operator needs to search
 * and reconcile on — status, provider, premium, window.
 */
export const insuranceApplications = pgTable(
  "insurance_applications",
  {
    id: typeId("insurance_applications"),
    /** The checkout session the offer was accepted in. */
    bookingSessionId: text("booking_session_id"),
    /**
     * Soft link, filled in once payment produced a booking. No FK: the
     * application predates the booking and outlives an abandoned session.
     */
    bookingId: typeIdRef("booking_id"),
    /** The `commerce.ancillary-offer-source` that produced the offer. */
    sourceId: text("source_id").notNull(),
    providerId: text("provider_id").notNull(),
    /** The insurer's own identifier for the application. */
    providerApplicationRef: text("provider_application_ref"),
    /** Opaque handle back to the quote the offer came from. */
    quoteRef: text("quote_ref").notNull(),
    /** Rendered on the booking, the invoice and the traveller's confirmation. */
    title: text("title").notNull(),
    planName: text("plan_name"),
    /**
     * The insurer's tier wording. Display only — never sorted on, never
     * branched on. See `planTier` in `insurance-contracts`.
     */
    planLabel: text("plan_label"),
    status: insuranceApplicationStatusEnum("status").notNull().default("open"),
    /** Past this instant the application can no longer become a policy. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    premiumAmountMinor: integer("premium_amount_minor").notNull(),
    premiumCurrency: text("premium_currency").notNull(),
    /** `eligible` / `ineligible` / `referral` as the insurer last reported it. */
    eligibilityStatus: text("eligibility_status").notNull().default("eligible"),
    eligibilityReasons: jsonb("eligibility_reasons")
      .$type<ReadonlyArray<{ code: string; message: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    selectedOptionalCoverIds: jsonb("selected_optional_cover_ids")
      .$type<readonly string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    acceptedDisclosures: jsonb("accepted_disclosures")
      .$type<ReadonlyArray<{ kind: string; versionId: string; acceptedAt: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** KMS envelope over `insuranceContractingPartySchema`. */
    contractingPartyEncrypted: jsonb("contracting_party_encrypted").$type<KmsEnvelope>(),
    /** KMS envelope over the underwriting answers. */
    answersEncrypted: jsonb("answers_encrypted").$type<KmsEnvelope>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_insurance_applications_booking").on(table.bookingId),
    index("idx_insurance_applications_session").on(table.bookingSessionId),
    index("idx_insurance_applications_status").on(table.status),
    index("idx_insurance_applications_provider").on(table.providerId),
    index("idx_insurance_applications_expires").on(table.expiresAt),
  ],
)

export type InsuranceApplicationRow = typeof insuranceApplications.$inferSelect
export type NewInsuranceApplicationRow = typeof insuranceApplications.$inferInsert
