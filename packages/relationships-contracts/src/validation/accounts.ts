import { emailAddress } from "@voyant-travel/schema-kit/email"
import { kmsEnvelopeSchema } from "@voyant-travel/schema-kit/kms"
import { z } from "zod"

import {
  nullableTrimmedStringSchema,
  paginationSchema,
  recordStatusSchema,
  relationTypeSchema,
} from "./common.js"

const currencyCodeSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, "Expected ISO 4217 code")

export const organizationCoreSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().nullable().optional(),
  website: z
    .string()
    .url()
    .nullable()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  taxId: nullableTrimmedStringSchema,
  industry: z.string().nullable().optional(),
  relation: relationTypeSchema.nullable().optional(),
  ownerId: z.string().nullable().optional(),
  defaultCurrency: currencyCodeSchema.nullable().optional(),
  preferredLanguage: z.string().nullable().optional(),
  paymentTerms: z.number().int().positive().max(365).nullable().optional(),
  status: recordStatusSchema.default("active"),
  source: z.string().nullable().optional(),
  sourceRef: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  // Values are always `customFields[namespace][key]`; scalar validation is
  // performed against the resolved registry at the write boundary.
  customFields: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  notes: z.string().nullable().optional(),
})

export const insertOrganizationSchema = organizationCoreSchema
export const updateOrganizationSchema = organizationCoreSchema
  .extend({
    status: recordStatusSchema.optional(),
    tags: z.array(z.string()).optional(),
  })
  .partial()
export const mergeOrganizationSchema = z.object({
  mergeId: z.string().min(1),
})

export const organizationListSortFieldSchema = z.enum([
  "name",
  "industry",
  "relation",
  "status",
  "createdAt",
  "updatedAt",
])

export const organizationListSortDirSchema = z.enum(["asc", "desc"])

export const organizationListQuerySchema = paginationSchema
  .extend({
    ownerId: z.string().optional(),
    relation: relationTypeSchema.optional(),
    status: recordStatusSchema.optional(),
    search: z.string().optional(),
    taxId: z.string().optional(),
    tax_id: z.string().optional(),
    sortBy: organizationListSortFieldSchema.default("updatedAt"),
    sortDir: organizationListSortDirSchema.default("desc"),
  })
  .transform(({ tax_id: taxIdSnake, ...query }) => ({
    ...query,
    taxId: query.taxId?.trim() || taxIdSnake?.trim() || undefined,
  }))

export const personCoreSchema = z.object({
  organizationId: z.string().nullable().optional(),
  firstName: z.string().min(1),
  middleName: z.string().nullable().optional(),
  lastName: z.string().min(1),
  gender: z.enum(["M", "F", "X"]).nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  relation: relationTypeSchema.nullable().optional(),
  preferredLanguage: z.string().nullable().optional(),
  preferredCurrency: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  status: recordStatusSchema.default("active"),
  source: z.string().nullable().optional(),
  sourceRef: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  // Values are always `customFields[namespace][key]`; scalar validation is
  // performed against the resolved registry at the write boundary.
  customFields: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Encrypted PII slots (canonical store; documents live in person_documents).
  // `z.lazy(() => …)` defers cross-package schema dereferencing until
  // first parse — see #501 for the bundler chunk-init hazard otherwise.
  accessibilityEncrypted: z.lazy(() => kmsEnvelopeSchema).optional(),
  dietaryEncrypted: z.lazy(() => kmsEnvelopeSchema).optional(),
  loyaltyEncrypted: z.lazy(() => kmsEnvelopeSchema).optional(),
  insuranceEncrypted: z.lazy(() => kmsEnvelopeSchema).optional(),
  // Inline identity fields — synced to identity module on create/update
  email: z.preprocess(
    (value) => (value === "" ? null : value),
    emailAddress().nullable().optional(),
  ),
  phone: z.string().nullable().optional(),
  website: z
    .string()
    .url()
    .nullable()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
})

export const insertPersonSchema = personCoreSchema
export const updatePersonSchema = personCoreSchema
  .extend({
    status: recordStatusSchema.optional(),
    tags: z.array(z.string()).optional(),
  })
  .partial()
export const mergePersonSchema = z.object({
  mergeId: z.string().min(1),
})

export const personListSortFieldSchema = z.enum([
  "name",
  "relation",
  "status",
  "createdAt",
  "updatedAt",
])

export const personListSortDirSchema = z.enum(["asc", "desc"])

export const personListQuerySchema = paginationSchema.extend({
  organizationId: z.string().optional(),
  ownerId: z.string().optional(),
  relation: relationTypeSchema.optional(),
  status: recordStatusSchema.optional(),
  search: z.string().optional(),
  sortBy: personListSortFieldSchema.default("updatedAt"),
  sortDir: personListSortDirSchema.default("desc"),
})
