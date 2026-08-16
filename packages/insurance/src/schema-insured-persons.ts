import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import type { KmsEnvelope } from "@voyant-travel/db/schema/iam"
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { insuranceApplications } from "./schema-applications.js"
import { insurancePolicies } from "./schema-policies.js"

/**
 * Someone the policy covers — stored HERE, not on `booking_travelers`.
 *
 * The insured set and the travelling set are not the same set. A parent insures
 * a child who is not on the booking; a traveller on the booking declines cover;
 * the contracting party may be neither. Projecting insured persons onto booking
 * travellers would make all three unrepresentable, and would put the insurer's
 * identity requirements (a document number and its issuing country) onto a row
 * the rest of the platform reads for unrelated reasons.
 *
 * `booking_traveler_id` is a soft link for the common case where they do
 * coincide, with **no foreign key**: it records a correspondence, not an
 * identity, and deleting or replacing a booking traveller must not cascade into
 * a policy that has already been issued.
 *
 * Everything identifying lives in `identity_encrypted`. The only plaintext left
 * is `display_initial`, which is what an operator list needs to tell two
 * insured people apart without the row carrying a name.
 */
export const insuranceInsuredPersons = pgTable(
  "insurance_insured_persons",
  {
    id: typeId("insurance_insured_persons"),
    applicationId: typeIdRef("application_id")
      .notNull()
      .references(() => insuranceApplications.id, { onDelete: "cascade" }),
    /** Set once the application became a policy. */
    policyId: typeIdRef("policy_id").references(() => insurancePolicies.id, {
      onDelete: "set null",
    }),
    /** Caller-assigned, stable within the application; the answers refer back to it. */
    ref: text("ref").notNull(),
    /**
     * A single non-toxic character (the family-name initial) so an operator can
     * distinguish rows in a list. Never enough to identify anyone.
     */
    displayInitial: text("display_initial"),
    /** Soft correspondence to a traveller on the booking. Deliberately no FK. */
    bookingTravelerId: typeIdRef("booking_traveler_id"),
    /** KMS envelope over name, date of birth, residency and identity documents. */
    identityEncrypted: jsonb("identity_encrypted").$type<KmsEnvelope>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_insurance_insured_persons_application_ref").on(table.applicationId, table.ref),
    index("idx_insurance_insured_persons_policy").on(table.policyId),
    index("idx_insurance_insured_persons_booking_traveler").on(table.bookingTravelerId),
  ],
)

export type InsuranceInsuredPersonRow = typeof insuranceInsuredPersons.$inferSelect
export type NewInsuranceInsuredPersonRow = typeof insuranceInsuredPersons.$inferInsert
