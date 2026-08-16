import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { relations, sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { contracts } from "../contracts/schema.js"
import { policyVersions } from "../policies/schema.js"
import { legalTargetKindEnum } from "../targets/schema.js"

export const legalTermTypeEnum = pgEnum("legal_term_type", [
  "terms_and_conditions",
  "cancellation",
  "guarantee",
  "payment",
  "pricing",
  "commission",
  // Pre-contractual insurance disclosures. Mirrored by `legalTermTypeSchema`
  // in `@voyant-travel/legal-contracts/terms/validation`.
  "insurer_product_information",
  "insurer_terms",
  "demands_and_needs",
  "other",
])

export const legalTermAcceptanceStatusEnum = pgEnum("legal_term_acceptance_status", [
  "not_required",
  "pending",
  "accepted",
  "declined",
])

export const legalTerms = pgTable(
  "legal_terms",
  {
    id: typeId("order_terms"),
    contractId: typeIdRef("contract_id").references(() => contracts.id, { onDelete: "set null" }),
    policyVersionId: typeIdRef("policy_version_id").references(() => policyVersions.id, {
      onDelete: "set null",
    }),
    targetKind: legalTargetKindEnum("target_kind"),
    targetId: typeIdRef("target_id"),
    targetProvider: text("target_provider"),
    targetSourceRef: text("target_source_ref"),
    legacyTransactionOfferId: typeIdRef("legacy_transaction_offer_id"),
    legacyTransactionOrderId: typeIdRef("legacy_transaction_order_id"),
    termType: legalTermTypeEnum("term_type").notNull().default("terms_and_conditions"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    language: text("language"),
    required: boolean("required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    acceptanceStatus: legalTermAcceptanceStatusEnum("acceptance_status")
      .notNull()
      .default("pending"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: text("accepted_by"),
    /**
     * The insurer's own identifier for the revision in force when this row was
     * written. Insurers re-version and replace their wording without notice, so
     * this is what says which wording the traveller actually agreed to.
     */
    sourceVersionId: text("source_version_id"),
    /** Storage key of the artifact archived from the insurer's document. */
    archivedStorageKey: text("archived_storage_key"),
    /** `sha256:<hex>` over the exact bytes at `archivedStorageKey`. */
    archivedChecksum: text("archived_checksum"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_legal_terms_contract_sort").on(table.contractId, table.sortOrder, table.createdAt),
    index("idx_legal_terms_policy_version_sort").on(
      table.policyVersionId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_legal_terms_target_sort").on(
      table.targetKind,
      table.targetId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_legal_terms_provider_source_sort").on(
      table.targetProvider,
      table.targetSourceRef,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_legal_terms_legacy_transaction_offer_sort").on(
      table.legacyTransactionOfferId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_legal_terms_legacy_transaction_order_sort").on(
      table.legacyTransactionOrderId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_legal_terms_type_sort").on(table.termType, table.sortOrder, table.createdAt),
    index("idx_legal_terms_acceptance_sort").on(
      table.acceptanceStatus,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_legal_terms_source_version").on(table.termType, table.sourceVersionId),
    // A disclosure row of one of the insurer kinds that carries no archived
    // artifact looks configured and is not: at dispute time it resolves to
    // whatever the insurer serves that day. The application refuses it too, but
    // the application is not the only writer.
    //
    // The comparison casts the column to text rather than casting the literals
    // to `legal_term_type`, so the migration that adds these labels can add the
    // constraint in the same transaction (PostgreSQL forbids reading an enum
    // label the current transaction created).
    // agent-quality: raw-sql reviewed -- owner: legal; fixed literals, no interpolation.
    check(
      "ck_legal_terms_insurer_disclosure_archive",
      sql`${table.termType}::text NOT IN ('insurer_product_information', 'insurer_terms', 'demands_and_needs')
        OR (
          ${table.sourceVersionId} IS NOT NULL
          AND length(btrim(${table.sourceVersionId})) > 0
          AND ${table.archivedStorageKey} IS NOT NULL
          AND length(btrim(${table.archivedStorageKey})) > 0
        )`,
    ),
  ],
)

export type LegalTerm = typeof legalTerms.$inferSelect
export type NewLegalTerm = typeof legalTerms.$inferInsert

export const legalTermsRelations = relations(legalTerms, ({ one }) => ({
  contract: one(contracts, { fields: [legalTerms.contractId], references: [contracts.id] }),
  policyVersion: one(policyVersions, {
    fields: [legalTerms.policyVersionId],
    references: [policyVersions.id],
  }),
}))
