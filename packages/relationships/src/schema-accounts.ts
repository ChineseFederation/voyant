import type { NamespacedCustomFieldValues } from "@voyant-travel/core/custom-fields"
import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import type { KmsEnvelope } from "@voyant-travel/db/schema/iam/kms"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  pgView,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import {
  communicationChannelEnum,
  communicationDirectionEnum,
  recordStatusEnum,
  relationTypeEnum,
} from "./schema-shared.js"

/**
 * Identity-document types stored on `person_documents`. Open-ended via
 * "other" so we don't force a schema migration for every regional
 * variant; the structured fields cover the international shape.
 */
export const personDocumentTypeEnum = pgEnum("person_document_type", [
  "passport",
  "id_card",
  "driver_license",
  "visa",
  "other",
])

/**
 * Person-to-person relationship kinds. Directed: each row records a
 * single edge `from → to` of a specific kind. The optional inverse
 * edge (e.g. parent ↔ child) is kept as a separate row so list
 * queries against either side return the same shape; the service
 * layer auto-writes the inverse on insert when an `inverseKind` is
 * provided.
 */
export const personRelationshipKindEnum = pgEnum("person_relationship_kind", [
  "spouse",
  "partner",
  "parent",
  "child",
  "sibling",
  "guardian",
  "ward",
  "emergency_contact",
  "friend",
  "travel_companion",
  "other",
])

export const organizations = pgTable(
  "organizations",
  {
    id: typeId("organizations"),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    website: text("website"),
    /** Tax / VAT identification number — used for billing + e-invoicing. */
    taxId: text("tax_id"),
    industry: text("industry"),
    relation: relationTypeEnum("relation"),
    ownerId: text("owner_id"),
    defaultCurrency: text("default_currency"),
    preferredLanguage: text("preferred_language"),
    paymentTerms: integer("payment_terms"),
    status: recordStatusEnum("status").notNull().default("active"),
    source: text("source"),
    sourceRef: text("source_ref"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /**
     * Deployment-declared custom fields (unified custom-fields system — see the
     * ADR). Validated at the write boundary against the resolved registry
     * (persisted in `custom_field_definitions`); `{}` when none are set.
     */
    customFields: jsonb("custom_fields").$type<NamespacedCustomFieldValues>().notNull().default({}),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_organizations_name").on(table.name),
    index("idx_organizations_owner").on(table.ownerId),
    index("idx_organizations_status").on(table.status),
    index("idx_organizations_tax_id").on(table.taxId),
    index("idx_organizations_owner_updated").on(table.ownerId, table.updatedAt),
    index("idx_organizations_relation_updated").on(table.relation, table.updatedAt),
    index("idx_organizations_status_updated").on(table.status, table.updatedAt),
  ],
)

export const people = pgTable(
  "people",
  {
    id: typeId("people"),
    organizationId: typeIdRef("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    /** ISO-style "M" / "F" / "X" — used by airline + travel-doc workflows. */
    gender: text("gender"),
    jobTitle: text("job_title"),
    relation: relationTypeEnum("relation"),
    preferredLanguage: text("preferred_language"),
    preferredCurrency: text("preferred_currency"),
    ownerId: text("owner_id"),
    status: recordStatusEnum("status").notNull().default("active"),
    source: text("source"),
    sourceRef: text("source_ref"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /**
     * Deployment-declared custom fields (unified custom-fields system — see the
     * ADR). Validated at the write boundary against the resolved registry
     * (persisted in `custom_field_definitions`); `{}` when none are set.
     */
    customFields: jsonb("custom_fields").$type<NamespacedCustomFieldValues>().notNull().default({}),
    dateOfBirth: date("date_of_birth"),
    notes: text("notes"),
    /**
     * Encrypted PII slots — canonical store for person-level travel
     * preferences. Documents live in their own structured table
     * (`person_documents`); these four are kept as KMS envelopes
     * because their internal shape is small and rarely queried.
     *
     * Booking-traveler rows snapshot dietary/accessibility at create
     * time; the person record remains the source of truth for
     * pre-fill on subsequent bookings.
     */
    accessibilityEncrypted: jsonb("accessibility_encrypted").$type<KmsEnvelope>(),
    dietaryEncrypted: jsonb("dietary_encrypted").$type<KmsEnvelope>(),
    loyaltyEncrypted: jsonb("loyalty_encrypted").$type<KmsEnvelope>(),
    insuranceEncrypted: jsonb("insurance_encrypted").$type<KmsEnvelope>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_people_org").on(table.organizationId),
    index("idx_people_owner").on(table.ownerId),
    index("idx_people_status").on(table.status),
    index("idx_people_name").on(table.firstName, table.lastName),
    index("idx_people_org_updated").on(table.organizationId, table.updatedAt),
    index("idx_people_owner_updated").on(table.ownerId, table.updatedAt),
    index("idx_people_relation_updated").on(table.relation, table.updatedAt),
    index("idx_people_status_updated").on(table.status, table.updatedAt),
  ],
)

/**
 * `person_directory` is a Postgres VIEW (not a table) that exposes
 * each person's primary email / phone / website by `LATERAL` lookup
 * against `identity_contact_points`. `.existing()` means drizzle-kit
 * never emits its DDL, and it spans two modules (people + identity), so
 * — like the cross-module link tables — it is shipped by hand in the
 * deployment migration source, applied last once both owning packages'
 * tables exist (`apps/operator/migrations/0002_person_directory_view.sql`).
 * See issue #1971. This binding gives Drizzle a typed read surface.
 *
 * The previous `person_directory_projections` table was a denormalized
 * cache that had to be rebuilt on every contact-point change — see
 * #446 for the discussion of why we replaced it. Indexed lateral
 * joins (`idx_identity_contact_points_entity_kind_primary_created`
 * already exists) keep view reads sub-millisecond at realistic CRM
 * volumes.
 */
export const personDirectoryView = pgView("person_directory", {
  personId: typeIdRef("person_id").notNull(),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
}).existing()

export const personNotes = pgTable(
  "person_notes",
  {
    id: typeId("person_notes"),
    personId: typeIdRef("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_person_notes_person").on(table.personId),
    index("idx_person_notes_person_created").on(table.personId, table.createdAt),
  ],
)

export type PersonNote = typeof personNotes.$inferSelect
export type NewPersonNote = typeof personNotes.$inferInsert

/**
 * Structured identity documents owned by a person. Replaces the
 * single `documentsEncrypted` blob shape with a row per document so
 * we can track type / expiry / issuing authority / attachment + run
 * "expiring soon" sweeps without parsing JSON.
 *
 * `numberEncrypted` is the only field encrypted at rest — the rest
 * is non-toxic identity metadata. `attachmentId` is a free-form key
 * (typically an object-storage path) until a general media table
 * exists; FK is intentionally deferred.
 *
 * Booking-traveler rows snapshot the primary passport at create time;
 * this table remains the source of truth for next-trip pre-fill.
 */
export const personDocuments = pgTable(
  "person_documents",
  {
    id: typeId("person_documents"),
    personId: typeIdRef("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    type: personDocumentTypeEnum("type").notNull(),
    numberEncrypted: jsonb("number_encrypted").$type<KmsEnvelope>(),
    issuingAuthority: text("issuing_authority"),
    issuingCountry: text("issuing_country"),
    issueDate: date("issue_date"),
    expiryDate: date("expiry_date"),
    attachmentId: text("attachment_id"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_person_documents_person").on(table.personId),
    index("idx_person_documents_person_type").on(table.personId, table.type),
    index("idx_person_documents_expiry").on(table.expiryDate),
    uniqueIndex("uidx_person_documents_primary_per_type")
      .on(table.personId, table.type)
      // agent-quality: raw-sql reviewed -- owner: crm; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      .where(sql`${table.isPrimary} = true`),
  ],
)

export type PersonDocument = typeof personDocuments.$inferSelect
export type NewPersonDocument = typeof personDocuments.$inferInsert

/**
 * Directed person-to-person edges (kinship, emergency contacts,
 * travel companions). Each row is a single edge `fromPerson → toPerson`
 * of one `kind`; the reverse edge — when meaningful — is a separate
 * row written by the service layer's auto-inverse helper. Self-edges
 * are rejected via a CHECK constraint; the unique index on
 * `(from, to, kind)` prevents the same directional edge from being
 * recorded twice.
 *
 * `metadata` is a free-form jsonb bag for module-specific extensions
 * (e.g. emergency-contact relationship to traveler). Operators that
 * need richer structure should add their own typed columns.
 */
export const personRelationships = pgTable(
  "person_relationships",
  {
    id: typeId("person_relationships"),
    fromPersonId: typeIdRef("from_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    toPersonId: typeIdRef("to_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: personRelationshipKindEnum("kind").notNull(),
    /**
     * The kind that should label the reverse edge (e.g. parent ↔
     * child). When set on insert, the service layer writes the
     * inverse edge in the same transaction unless `autoInverse` is
     * explicitly disabled.
     */
    inverseKind: personRelationshipKindEnum("inverse_kind"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_person_relationships_from").on(table.fromPersonId),
    index("idx_person_relationships_to").on(table.toPersonId),
    uniqueIndex("uidx_person_relationships_pair_kind").on(
      table.fromPersonId,
      table.toPersonId,
      table.kind,
    ),
    // agent-quality: raw-sql reviewed -- owner: crm; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    check("person_relationships_no_self", sql`${table.fromPersonId} <> ${table.toPersonId}`),
  ],
)

export type PersonRelationship = typeof personRelationships.$inferSelect
export type NewPersonRelationship = typeof personRelationships.$inferInsert

/**
 * Where a saved payment method came from.
 *
 * `manual` is an operator typing what they know: a reference from a terminal
 * receipt, a card the customer read out over the phone. Nothing but a human
 * vouches for it, and its `processor_token` is a note rather than a credential.
 *
 * `payment` is projected from a payment a provider actually took and stored, so
 * its token can charge and its display fields came from the network. The two
 * must stay distinguishable: a projected row that an operator can retype is a
 * row that can be made to point at somebody else's card.
 */
export const paymentMethodSourceEnum = pgEnum("payment_method_source", ["manual", "payment"])

/**
 * Whether a saved method can still be used, mirroring `PaymentInstrumentStatus`
 * on the payment port.
 *
 * `requires_new_agreement` is the one worth knowing about: when a card is
 * reissued its brand can change, and the agreement the customer gave no longer
 * covers what replaced it, so it cannot be charged while they are away until a
 * new one exists. The instrument works; the permission does not.
 */
export const paymentMethodStatusEnum = pgEnum("payment_method_status", [
  "usable",
  "requires_new_agreement",
  "expired",
  "revoked",
])

/**
 * Saved payment methods on file for a person.
 *
 * Two kinds of row live here, told apart by `source`. A projected row carries
 * the provider that issued its token, what the customer authorized it to be
 * used for, and whether it is still usable; a manual row carries none of that
 * and can only ever be a reminder to a human.
 *
 * Cards have last4 + expiry + brand; bank-transfer "methods" carry a brand of
 * "bank_transfer" with last4 / expiry omitted.
 */
export const personPaymentMethods = pgTable(
  "person_payment_methods",
  {
    id: typeId("person_payment_methods"),
    personId: typeIdRef("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    source: paymentMethodSourceEnum("source").notNull().default("manual"),
    /** "visa" | "mastercard" | "amex" | "revolut" | "bank_transfer" — kept as text to stay open. */
    brand: text("brand").notNull(),
    /** Last four digits — null for non-card methods. */
    last4: text("last4"),
    holderName: text("holder_name"),
    /** 1-12; null for non-card methods. */
    expMonth: integer("exp_month"),
    expYear: integer("exp_year"),
    /** Opaque processor token — used to charge the customer. */
    processorToken: text("processor_token").notNull(),
    /**
     * The payment adapter that issued `processor_token`. Null on a manual row.
     *
     * Load-bearing rather than informational: a token is only meaningful to the
     * provider that minted it, so charging one against a different adapter is
     * either an error or somebody else's card.
     */
    providerId: text("provider_id"),
    /** The provider's own customer record this method hangs off, where it has one. */
    providerCustomerReference: text("provider_customer_reference"),
    /**
     * Stable across re-entry of the same underlying instrument. Lets a repeat
     * payment recognize a card already on file instead of adding a duplicate.
     */
    fingerprint: text("fingerprint"),
    /**
     * What the customer authorized, as `PaymentInstrumentReuse` values.
     *
     * Empty is meaningful and is the safe default: the method is on the
     * operator's own records and may not be charged or offered back. An
     * operator reading their own books is neither of those uses.
     */
    authorizedReuses: jsonb("authorized_reuses")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: paymentMethodStatusEnum("status").notNull().default("usable"),
    /**
     * The record of the agreement that authorized charging this method while
     * the customer is away. Keeping that record is a requirement in its own
     * right, so this is the handle back to it.
     */
    agreementReference: text("agreement_reference"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_person_payment_methods_person").on(table.personId),
    index("idx_person_payment_methods_person_default").on(table.personId, table.isDefault),
    /**
     * What makes projection idempotent. A provider token identifies one
     * instrument, so a replayed callback and a status poll that both report it
     * converge on the same row instead of racing to add two.
     *
     * Partial because manual rows have no provider and their free-text
     * "tokens" collide freely — two operators typing "visa ending 4242" must
     * not be forced into one row.
     */
    uniqueIndex("uq_person_payment_methods_provider_token")
      .on(table.providerId, table.processorToken)
      .where(sql`${table.providerId} is not null`),
  ],
)

export type PersonPaymentMethod = typeof personPaymentMethods.$inferSelect
export type NewPersonPaymentMethod = typeof personPaymentMethods.$inferInsert

export const organizationNotes = pgTable(
  "organization_notes",
  {
    id: typeId("organization_notes"),
    organizationId: typeIdRef("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_organization_notes_org").on(table.organizationId),
    index("idx_organization_notes_org_created").on(table.organizationId, table.createdAt),
  ],
)

export type OrganizationNote = typeof organizationNotes.$inferSelect
export type NewOrganizationNote = typeof organizationNotes.$inferInsert

export const communicationLog = pgTable(
  "communication_log",
  {
    id: typeId("communication_log"),
    personId: typeIdRef("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    organizationId: typeIdRef("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    channel: communicationChannelEnum("channel").notNull(),
    direction: communicationDirectionEnum("direction").notNull(),
    subject: text("subject"),
    content: text("content"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_communication_log_person").on(table.personId),
    index("idx_communication_log_person_created").on(table.personId, table.createdAt),
    index("idx_communication_log_person_channel_created").on(
      table.personId,
      table.channel,
      table.createdAt,
    ),
    index("idx_communication_log_person_direction_created").on(
      table.personId,
      table.direction,
      table.createdAt,
    ),
    index("idx_communication_log_org").on(table.organizationId),
    index("idx_communication_log_channel").on(table.channel),
  ],
)

export type CommunicationLogEntry = typeof communicationLog.$inferSelect
export type NewCommunicationLogEntry = typeof communicationLog.$inferInsert

export const segments = pgTable(
  "segments",
  {
    id: typeId("segments"),
    name: text("name").notNull(),
    description: text("description"),
    conditions: jsonb("conditions").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_segments_created").on(table.createdAt)],
)

export type Segment = typeof segments.$inferSelect
export type NewSegment = typeof segments.$inferInsert

export const segmentMembers = pgTable(
  "segment_members",
  {
    id: typeId("segment_members"),
    segmentId: typeIdRef("segment_id")
      .notNull()
      .references(() => segments.id, { onDelete: "cascade" }),
    personId: typeIdRef("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_segment_members_segment").on(table.segmentId),
    index("idx_segment_members_person").on(table.personId),
  ],
)

export type SegmentMember = typeof segmentMembers.$inferSelect
export type NewSegmentMember = typeof segmentMembers.$inferInsert

export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert
export type Person = typeof people.$inferSelect
export type NewPerson = typeof people.$inferInsert
