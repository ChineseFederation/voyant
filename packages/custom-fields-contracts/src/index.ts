import { z } from "zod"

export const customFieldTypeSchema = z.enum([
  "varchar",
  "text",
  "double",
  "monetary",
  "date",
  "boolean",
  "enum",
  "set",
  "json",
  "address",
  "phone",
])

export const customFieldOwnerKindSchema = z.enum(["platform", "operator", "app"])
export const customFieldLifecycleStateSchema = z.enum(["active", "inactive", "deprecated"])
export const customFieldDefinitionProvenanceSchema = z.record(z.string(), z.unknown())

export const customFieldDefinitionInputSchema = z
  .object({
    entityType: z.string().min(1),
    key: z.string().min(1),
    label: z.string().min(1),
    fieldType: customFieldTypeSchema,
    isRequired: z.boolean().default(false),
    isSearchable: z.boolean().default(false),
    isExportable: z.boolean().default(true),
    isInvoiceable: z.boolean().default(false),
    options: z
      .array(z.object({ label: z.string(), value: z.string() }))
      .nullable()
      .optional(),
  })
  .strict()

export const updateCustomFieldDefinitionSchema = z
  .object({
    key: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
    isRequired: z.boolean().optional(),
    isSearchable: z.boolean().optional(),
    isExportable: z.boolean().optional(),
    isInvoiceable: z.boolean().optional(),
    options: z
      .array(z.object({ label: z.string(), value: z.string() }))
      .nullable()
      .optional(),
  })
  .strict()

export const customFieldDefinitionListQuerySchema = z.object({
  entityType: z.string().min(1).optional(),
  ownerKind: customFieldOwnerKindSchema.optional(),
  lifecycleState: customFieldLifecycleStateSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
})

export type CustomFieldDefinitionInput = z.infer<typeof customFieldDefinitionInputSchema>
export type CustomFieldDefinitionUpdate = z.infer<typeof updateCustomFieldDefinitionSchema>
export type CustomFieldDefinitionListQuery = z.infer<typeof customFieldDefinitionListQuerySchema>
