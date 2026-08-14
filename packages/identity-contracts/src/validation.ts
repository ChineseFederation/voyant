import { emailAddress } from "@voyant-travel/schema-kit/email"
import { booleanQueryParam } from "@voyant-travel/schema-kit/query-params"
import { typeIdSchema } from "@voyant-travel/schema-kit/typeid"
import { z } from "zod"

export const contactPointKindSchema = z.enum([
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

export const addressLabelSchema = z.enum([
  "primary",
  "billing",
  "shipping",
  "mailing",
  "meeting",
  "service",
  "legal",
  "other",
])

export const namedContactRoleSchema = z.enum([
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

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const contactPointCoreSchema = z.object({
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1).max(100),
  kind: contactPointKindSchema,
  label: z.string().max(100).nullable().optional(),
  value: z.string().min(1).max(500),
  normalizedValue: z.string().max(500).nullable().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

const addressCoreSchema = z.object({
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1).max(100),
  label: addressLabelSchema.default("other"),
  fullText: z.string().nullable().optional(),
  line1: z.string().nullable().optional(),
  line2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

const namedContactCoreSchema = z.object({
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1).max(100),
  role: namedContactRoleSchema.default("general"),
  name: z.string().min(1).max(255),
  title: z.string().max(255).nullable().optional(),
  email: emailAddress().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const insertContactPointSchema = contactPointCoreSchema
export const updateContactPointSchema = contactPointCoreSchema.partial()
export const insertContactPointForEntitySchema = contactPointCoreSchema.omit({
  entityType: true,
  entityId: true,
})
export const contactPointListQuerySchema = paginationSchema.extend({
  entityType: z.string().max(100).optional(),
  entityId: z.string().max(100).optional(),
  kind: contactPointKindSchema.optional(),
  isPrimary: booleanQueryParam.optional(),
  search: z.string().optional(),
})
export const selectContactPointSchema = contactPointCoreSchema.extend({
  id: typeIdSchema("identity_contact_points"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type InsertContactPoint = z.infer<typeof insertContactPointSchema>
export type UpdateContactPoint = z.infer<typeof updateContactPointSchema>
export type InsertContactPointForEntity = z.infer<typeof insertContactPointForEntitySchema>
export type SelectContactPoint = z.infer<typeof selectContactPointSchema>

export const insertAddressSchema = addressCoreSchema
export const updateAddressSchema = addressCoreSchema.partial()
export const insertAddressForEntitySchema = addressCoreSchema.omit({
  entityType: true,
  entityId: true,
})
export const addressListQuerySchema = paginationSchema.extend({
  entityType: z.string().max(100).optional(),
  entityId: z.string().max(100).optional(),
  label: addressLabelSchema.optional(),
  isPrimary: booleanQueryParam.optional(),
  search: z.string().optional(),
})
export const selectAddressSchema = addressCoreSchema.extend({
  id: typeIdSchema("identity_addresses"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type InsertAddress = z.infer<typeof insertAddressSchema>
export type UpdateAddress = z.infer<typeof updateAddressSchema>
export type InsertAddressForEntity = z.infer<typeof insertAddressForEntitySchema>
export type SelectAddress = z.infer<typeof selectAddressSchema>

export const insertNamedContactSchema = namedContactCoreSchema
export const updateNamedContactSchema = namedContactCoreSchema.partial()
export const insertNamedContactForEntitySchema = namedContactCoreSchema.omit({
  entityType: true,
  entityId: true,
})
export const namedContactListQuerySchema = paginationSchema.extend({
  entityType: z.string().max(100).optional(),
  entityId: z.string().max(100).optional(),
  role: namedContactRoleSchema.optional(),
  isPrimary: booleanQueryParam.optional(),
  search: z.string().optional(),
})
export const selectNamedContactSchema = namedContactCoreSchema.extend({
  id: typeIdSchema("identity_named_contacts"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type InsertNamedContact = z.infer<typeof insertNamedContactSchema>
export type UpdateNamedContact = z.infer<typeof updateNamedContactSchema>
export type InsertNamedContactForEntity = z.infer<typeof insertNamedContactForEntitySchema>
export type SelectNamedContact = z.infer<typeof selectNamedContactSchema>
