import { typeId } from "@voyant-travel/db/lib/typeid-column"
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const contactPointKindEnum = pgEnum("contact_point_kind", [
  "email",
  "phone",
  "mobile",
  "whatsapp",
  "website",
  "sms",
  "fax",
  "social",
  "other",
])

export const addressLabelEnum = pgEnum("address_label", [
  "primary",
  "billing",
  "shipping",
  "mailing",
  "meeting",
  "service",
  "legal",
  "other",
])

export const namedContactRoleEnum = pgEnum("named_contact_role", [
  "general",
  "primary",
  "reservations",
  "operations",
  "front_desk",
  "sales",
  "emergency",
  "accounting",
  "legal",
  "other",
])

export const identityContactPoints = pgTable(
  "identity_contact_points",
  {
    id: typeId("identity_contact_points"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    kind: contactPointKindEnum("kind").notNull(),
    label: text("label"),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_identity_contact_points_entity").on(table.entityType, table.entityId),
    index("idx_identity_contact_points_entity_primary_created").on(
      table.entityType,
      table.entityId,
      table.isPrimary,
      table.createdAt,
    ),
    index("idx_identity_contact_points_entity_kind_primary_created").on(
      table.entityType,
      table.entityId,
      table.kind,
      table.isPrimary,
      table.createdAt,
    ),
    index("idx_identity_contact_points_kind").on(table.kind),
    index("idx_identity_contact_points_normalized").on(table.normalizedValue),
    uniqueIndex("uidx_identity_contact_points_entity_kind_value").on(
      table.entityType,
      table.entityId,
      table.kind,
      table.value,
    ),
  ],
)

export const identityAddresses = pgTable(
  "identity_addresses",
  {
    id: typeId("identity_addresses"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    label: addressLabelEnum("label").notNull().default("other"),
    fullText: text("full_text"),
    line1: text("line_1"),
    line2: text("line_2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    timezone: text("timezone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_identity_addresses_entity").on(table.entityType, table.entityId),
    index("idx_identity_addresses_entity_primary_created").on(
      table.entityType,
      table.entityId,
      table.isPrimary,
      table.createdAt,
    ),
    index("idx_identity_addresses_label").on(table.label),
  ],
)

export const identityNamedContacts = pgTable(
  "identity_named_contacts",
  {
    id: typeId("identity_named_contacts"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    role: namedContactRoleEnum("role").notNull().default("general"),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_identity_named_contacts_entity").on(table.entityType, table.entityId),
    index("idx_identity_named_contacts_entity_primary_created").on(
      table.entityType,
      table.entityId,
      table.isPrimary,
      table.createdAt,
    ),
    index("idx_identity_named_contacts_entity_role_primary_created").on(
      table.entityType,
      table.entityId,
      table.role,
      table.isPrimary,
      table.createdAt,
    ),
    index("idx_identity_named_contacts_role").on(table.role),
    index("idx_identity_named_contacts_primary").on(table.isPrimary),
  ],
)

export type IdentityContactPoint = typeof identityContactPoints.$inferSelect
export type NewIdentityContactPoint = typeof identityContactPoints.$inferInsert
export type IdentityAddress = typeof identityAddresses.$inferSelect
export type NewIdentityAddress = typeof identityAddresses.$inferInsert
export type IdentityNamedContact = typeof identityNamedContacts.$inferSelect
export type NewIdentityNamedContact = typeof identityNamedContacts.$inferInsert

// Customer verification challenges moved here with the module (voyant#4627).
// Re-exported so this barrel remains the package's single declared schema.
export * from "./verification/schema.js"
