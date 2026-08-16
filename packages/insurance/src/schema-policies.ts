import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import type { InsuranceCover, InsuranceDocument } from "@voyant-travel/insurance-contracts"
import { sql } from "drizzle-orm"
import { boolean, date, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { insuranceApplications } from "./schema-applications.js"
import { insurancePolicyIssueStateEnum } from "./schema-shared.js"

/**
 * What the insurer issued — or refused to.
 *
 * A row exists as soon as issuing is attempted, in `pending`, so a failure
 * after the traveller has been charged has somewhere to be recorded. That is
 * the state the whole table exists for: money taken, nothing issued, and an
 * operator who has to be told. `issue_failed` therefore carries the reason and
 * whether asking again could work; `cancelled` carries the cancellation.
 *
 * `covers` and `documents` are stored as the insurer stated them at issue time
 * rather than re-resolved later. An insurer revises its wordings without
 * notice, and the traveller's policy is the one that was in force that day.
 */
export const insurancePolicies = pgTable(
  "insurance_policies",
  {
    id: typeId("insurance_policies"),
    applicationId: typeIdRef("application_id")
      .notNull()
      .references(() => insuranceApplications.id, { onDelete: "cascade" }),
    /** Denormalised soft link so a booking's policies read without a join. No FK. */
    bookingId: typeIdRef("booking_id"),
    providerId: text("provider_id").notNull(),
    /** The number a traveller quotes when they claim. Absent until issued. */
    policyNumber: text("policy_number"),
    issueState: insurancePolicyIssueStateEnum("issue_state").notNull().default("pending"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    /** The window the POLICY covers, which is not necessarily the trip window. */
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to").notNull(),
    premiumAmountMinor: integer("premium_amount_minor").notNull(),
    premiumCurrency: text("premium_currency").notNull(),
    sumInsuredAmountMinor: integer("sum_insured_amount_minor"),
    sumInsuredCurrency: text("sum_insured_currency"),
    covers: jsonb("covers").$type<readonly InsuranceCover[]>().notNull().default(sql`'[]'::jsonb`),
    /**
     * Document metadata only — kind, filename, checksum, version. The bytes are
     * archived through the storage path and recorded on the booking; a URL that
     * the insurer may re-point is not evidence.
     */
    documents: jsonb("documents")
      .$type<readonly InsuranceDocument[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    failureRetryable: boolean("failure_retryable"),
    failureOccurredAt: timestamp("failure_occurred_at", { withTimezone: true }),
    /** How many times issuing has been attempted, including retries by staff. */
    issueAttempts: integer("issue_attempts").notNull().default(0),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    refundAmountMinor: integer("refund_amount_minor"),
    refundCurrency: text("refund_currency"),
    providerReference: text("provider_reference"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_insurance_policies_application").on(table.applicationId),
    index("idx_insurance_policies_booking").on(table.bookingId),
    index("idx_insurance_policies_issue_state").on(table.issueState),
    index("idx_insurance_policies_provider").on(table.providerId),
  ],
)

export type InsurancePolicyRow = typeof insurancePolicies.$inferSelect
export type NewInsurancePolicyRow = typeof insurancePolicies.$inferInsert
