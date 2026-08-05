/** Module-owned CRM lifecycle tools backed by Relationships services. */
// agent-quality: file-size exception -- owner: relationships; CRM entity tools stay co-located because person/org/address/contact handlers share one admission and schema surface.

import {
  insertAddressForEntitySchema,
  insertContactPointForEntitySchema,
  updateAddressSchema,
  updateContactPointSchema,
} from "@voyant-travel/identity/validation"
import {
  admitHandlerActionPolicy,
  defineTool,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

import {
  RELATIONSHIPS_ORGANIZATION_HANDLER_ACTION_POLICY,
  RELATIONSHIPS_PERSON_HANDLER_ACTION_POLICY,
} from "./created-target-policy.js"
import {
  addressSchema,
  contactMethodSchema,
  organizationNoteSchema,
  organizationSchema,
  personNoteSchema,
  personSchema,
} from "./routes/accounts-openapi-schemas.js"
import {
  insertOrganizationSchema,
  insertPersonNoteSchema,
  insertPersonSchema,
  organizationListQuerySchema,
  organizationListSortDirSchema,
  organizationListSortFieldSchema,
  personListQuerySchema,
  recordStatusSchema,
  relationTypeSchema,
  updateOrganizationSchema,
  updatePersonNoteSchema,
  updatePersonSchema,
} from "./validation.js"

const OWNER = "@voyant-travel/relationships"
const VERSION = "v1"
const READ_SCOPES = ["crm:read"] as const
const WRITE_SCOPES = ["crm:write"] as const
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const ROUTINE_WRITE_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  sideEffects: ["data-write"],
} as const
const SENSITIVE_WRITE_RISK = {
  ...ROUTINE_WRITE_RISK,
  confirmationRequired: false,
} as const
const CREATED_WRITE_RISK = {
  destructive: false,
  reversible: false,
  dryRunSupported: false,
  confirmationRequired: false,
  sideEffects: ["data-write"],
} as const

const idArgsSchema = z.object({ id: z.string().min(1).describe("The CRM record id.") })
const relationshipEntitySchema = z.enum(["person", "organization"])
const relationshipEntityArgsSchema = z.object({
  entityType: relationshipEntitySchema,
  entityId: z.string().min(1),
})

// Encrypted KMS envelopes are intentionally absent from the agent surface.
const personToolSchema = personSchema.omit({
  accessibilityEncrypted: true,
  dietaryEncrypted: true,
  loyaltyEncrypted: true,
  insuranceEncrypted: true,
})
const peopleListOutputSchema = listResponseSchema(personToolSchema)
const organizationListOutputSchema = listResponseSchema(organizationSchema)

export const organizationToolListInputSchema = z.object({
  ownerId: z.string().optional(),
  relation: relationTypeSchema.optional(),
  status: recordStatusSchema.optional(),
  search: z.string().optional(),
  taxId: z.string().optional(),
  tax_id: z.string().optional(),
  vatNumber: z.string().optional().describe("Compatibility alias for taxId."),
  sortBy: organizationListSortFieldSchema.default("updatedAt"),
  sortDir: organizationListSortDirSchema.default("desc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const createPersonToolInputSchema = insertPersonSchema
  .omit({
    ownerId: true,
    source: true,
    sourceRef: true,
    customFields: true,
    accessibilityEncrypted: true,
    dietaryEncrypted: true,
    loyaltyEncrypted: true,
    insuranceEncrypted: true,
  })
  .extend({
    allowDuplicateName: z
      .boolean()
      .optional()
      .describe(
        "Removed compatibility field. Omit it; use list_people before create_person when resolving an existing person.",
      ),
    idempotencyKey: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .describe("Compatibility copy of the admitted created-command idempotency key."),
  })

export const updatePersonToolInputSchema = updatePersonSchema
  .omit({
    ownerId: true,
    source: true,
    sourceRef: true,
    customFields: true,
    accessibilityEncrypted: true,
    dietaryEncrypted: true,
    loyaltyEncrypted: true,
    insuranceEncrypted: true,
  })
  .extend({ id: z.string().min(1) })

const billingAddressSchema = insertAddressForEntitySchema.omit({ metadata: true }).optional()

export const createOrganizationToolInputSchema = insertOrganizationSchema
  .omit({ ownerId: true, source: true, sourceRef: true, customFields: true })
  .extend({
    idempotencyKey: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .describe("Compatibility copy of the admitted created-command idempotency key."),
    vatNumber: z.string().optional().describe("Compatibility alias for taxId."),
    billingAddress: billingAddressSchema,
  })

export const updateOrganizationToolInputSchema = updateOrganizationSchema
  .omit({ ownerId: true, source: true, sourceRef: true, customFields: true })
  .extend({
    id: z.string().min(1),
    vatNumber: z.string().optional().describe("Compatibility alias for taxId."),
  })

const createPersonOutputSchema = z.object({
  status: z.literal("created"),
  person: z.object({ id: z.string().min(1) }),
  replayed: z.boolean(),
})
const createOrganizationOutputSchema = z.object({
  status: z.literal("created"),
  organization: z.object({ id: z.string().min(1) }),
  replayed: z.boolean(),
})

const noteSchema = z.union([personNoteSchema, organizationNoteSchema])
const noteListOutputSchema = z.array(noteSchema)
const addNoteInputSchema = relationshipEntityArgsSchema.and(insertPersonNoteSchema)
const addOwnedNoteInputSchema = z
  .object({ entityId: z.string().min(1) })
  .and(insertPersonNoteSchema)
const editNoteInputSchema = z.object({
  entityType: relationshipEntitySchema,
  id: z.string().min(1),
  content: updatePersonNoteSchema.shape.content,
})

const contactMethodWriteSchema = insertContactPointForEntitySchema.omit({
  normalizedValue: true,
  metadata: true,
})
const addContactMethodInputSchema = relationshipEntityArgsSchema.and(contactMethodWriteSchema)
const addOwnedContactMethodInputSchema = z
  .object({ entityId: z.string().min(1) })
  .and(contactMethodWriteSchema)
const editContactMethodInputSchema = updateContactPointSchema
  .omit({ entityType: true, entityId: true, normalizedValue: true, metadata: true })
  .extend({ id: z.string().min(1) })

const addressWriteSchema = insertAddressForEntitySchema.omit({ metadata: true })
const addAddressInputSchema = relationshipEntityArgsSchema.and(addressWriteSchema)
const addOwnedAddressInputSchema = z.object({ entityId: z.string().min(1) }).and(addressWriteSchema)
const editAddressInputSchema = updateAddressSchema
  .omit({ entityType: true, entityId: true, metadata: true })
  .extend({ id: z.string().min(1) })

type PersonListQuery = z.infer<typeof personListQuerySchema>
type OrganizationListQuery = z.infer<typeof organizationListQuerySchema>
type OrganizationToolListInput = z.infer<typeof organizationToolListInputSchema>
type CreatePersonInput = z.infer<typeof createPersonToolInputSchema>
type UpdatePersonInput = z.infer<typeof updatePersonToolInputSchema>
type CreateOrganizationInput = z.infer<typeof createOrganizationToolInputSchema>
type UpdateOrganizationInput = z.infer<typeof updateOrganizationToolInputSchema>
type EntityArgs = z.infer<typeof relationshipEntityArgsSchema>
type AddNoteInput = z.infer<typeof addNoteInputSchema>
type AddOwnedNoteInput = z.infer<typeof addOwnedNoteInputSchema>
type EditNoteInput = z.infer<typeof editNoteInputSchema>
type AddContactMethodInput = z.infer<typeof addContactMethodInputSchema>
type AddOwnedContactMethodInput = z.infer<typeof addOwnedContactMethodInputSchema>
type EditContactMethodInput = z.infer<typeof editContactMethodInputSchema>
type AddAddressInput = z.infer<typeof addAddressInputSchema>
type AddOwnedAddressInput = z.infer<typeof addOwnedAddressInputSchema>
type EditAddressInput = z.infer<typeof editAddressInputSchema>

/** Request-scoped Relationships operations used by CRM tools. */
export interface RelationshipsToolServices {
  listPeople(query: PersonListQuery): Promise<unknown>
  getPersonById(id: string): Promise<unknown>
  createPerson(input: CreatePersonInput, admitted: ToolHandlerActionPolicyContext): Promise<unknown>
  updatePerson(input: UpdatePersonInput): Promise<unknown>
  listOrganizations(query: OrganizationListQuery): Promise<unknown>
  getOrganizationById(id: string): Promise<unknown>
  createOrganization(
    input: CreateOrganizationInput,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  updateOrganization(input: UpdateOrganizationInput): Promise<unknown>
  listNotes(input: EntityArgs): Promise<unknown>
  addNote(input: AddNoteInput): Promise<unknown>
  updateNote(input: EditNoteInput): Promise<unknown>
  listContactMethods(input: EntityArgs): Promise<unknown>
  addContactMethod(input: AddContactMethodInput): Promise<unknown>
  updateContactMethod(input: EditContactMethodInput): Promise<unknown>
  listAddresses(input: EntityArgs): Promise<unknown>
  addAddress(input: AddAddressInput): Promise<unknown>
  updateAddress(input: EditAddressInput): Promise<unknown>
}

export type RelationshipsToolContext = ToolContext & { relationships?: RelationshipsToolServices }

function crm(ctx: RelationshipsToolContext): RelationshipsToolServices {
  return requireService(ctx.relationships, "relationships")
}

const readMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: READ_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "read" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { idempotentHint: true },
}
const routineWriteMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write" as const,
  riskPolicy: ROUTINE_WRITE_RISK,
}
const sensitiveReadMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: READ_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "sensitive" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
}
const sensitiveWriteMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "sensitive" as const,
  riskPolicy: SENSITIVE_WRITE_RISK,
}

export const listPeopleTool = defineTool<
  PersonListQuery,
  z.infer<typeof peopleListOutputSchema>,
  RelationshipsToolContext
>({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-people`,
  name: "list_people",
  description: "Search CRM people by name, contact point, organization, relationship, or status.",
  inputSchema: personListQuerySchema,
  outputSchema: peopleListOutputSchema,
  async handler(query, ctx) {
    return parseJsonResult(peopleListOutputSchema, await crm(ctx).listPeople(query))
  },
})

export const getPersonTool = defineTool<
  z.infer<typeof idArgsSchema>,
  z.infer<typeof personToolSchema> | null,
  RelationshipsToolContext
>({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.get-person`,
  name: "get_person",
  description: "Read one CRM person by id. Returns null when not found.",
  inputSchema: idArgsSchema,
  outputSchema: personToolSchema.nullable(),
  async handler({ id }, ctx) {
    return parseJsonResult(personToolSchema.nullable(), await crm(ctx).getPersonById(id))
  },
})

export const createPersonTool = defineTool<
  CreatePersonInput,
  z.infer<typeof createPersonOutputSchema>,
  RelationshipsToolContext
>({
  ...sensitiveWriteMetadata,
  riskPolicy: CREATED_WRITE_RISK,
  capabilityId: `${OWNER}#tool.create-person`,
  name: "create_person",
  // voyant#3921: this handler derives its own idempotency key, so the caller must
  // not be asked for one. Without this flag the admission still lists
  // `idempotencyKey` as caller-required, the agent invents a value, reuses it
  // across a retry with different input, and the ledger rejects the fingerprint.
  resolvesIdempotencyKeyServerSide: true,

  description:
    "Create a new CRM person with at least one real email or phone. Exact retries return the original immutable person reference; use read tools to resolve an existing person.",
  inputSchema: createPersonToolInputSchema,
  outputSchema: createPersonOutputSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx) {
    if (input.allowDuplicateName !== undefined) {
      throw new ToolError(
        "`allowDuplicateName` is no longer supported because `create_person` always creates a new person. Use `list_people` first to resolve an existing person, then omit `allowDuplicateName`.",
        "INVALID_INPUT",
      )
    }
    if (!input.email?.trim() && !input.phone?.trim()) {
      throw new ToolError("A CRM person requires an email or phone.", "INVALID_INPUT")
    }
    const admitted = admitHandlerActionPolicy(ctx, RELATIONSHIPS_PERSON_HANDLER_ACTION_POLICY)
    return parseJsonResult(createPersonOutputSchema, await crm(ctx).createPerson(input, admitted))
  },
})

export const updatePersonTool = defineTool<
  UpdatePersonInput,
  z.infer<typeof personToolSchema> | null,
  RelationshipsToolContext
>({
  ...sensitiveWriteMetadata,
  capabilityId: `${OWNER}#tool.update-person`,
  name: "update_person",
  description:
    "Update a CRM person's profile, inline primary contact, tags, or lifecycle status. Returns null when not found.",
  inputSchema: updatePersonToolInputSchema,
  outputSchema: personToolSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return parseJsonResult(personToolSchema.nullable(), await crm(ctx).updatePerson(input))
  },
})

export const listOrganizationsTool = defineTool<
  OrganizationToolListInput,
  z.infer<typeof organizationListOutputSchema>,
  RelationshipsToolContext
>({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-organizations`,
  name: "list_organizations",
  description: "Search CRM organizations by name, website, exact tax id, relationship, or status.",
  inputSchema: organizationToolListInputSchema,
  outputSchema: organizationListOutputSchema,
  async handler(query, ctx) {
    return parseJsonResult(
      organizationListOutputSchema,
      await crm(ctx).listOrganizations(
        organizationListQuerySchema.parse({
          ...query,
          taxId: query.taxId ?? query.tax_id ?? query.vatNumber,
        }),
      ),
    )
  },
})

export const getOrganizationTool = defineTool<
  z.infer<typeof idArgsSchema>,
  z.infer<typeof organizationSchema> | null,
  RelationshipsToolContext
>({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.get-organization`,
  name: "get_organization",
  description: "Read one CRM organization by id. Returns null when not found.",
  inputSchema: idArgsSchema,
  outputSchema: organizationSchema.nullable(),
  async handler({ id }, ctx) {
    return parseJsonResult(organizationSchema.nullable(), await crm(ctx).getOrganizationById(id))
  },
})

export const createOrganizationTool = defineTool<
  CreateOrganizationInput,
  z.infer<typeof createOrganizationOutputSchema>,
  RelationshipsToolContext
>({
  ...routineWriteMetadata,
  riskPolicy: CREATED_WRITE_RISK,
  capabilityId: `${OWNER}#tool.create-organization`,
  name: "create_organization",
  description:
    "Create a CRM organization and optional billing address atomically. Exact retries return the original immutable organization reference.",
  inputSchema: createOrganizationToolInputSchema,
  outputSchema: createOrganizationOutputSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx) {
    const admitted = admitHandlerActionPolicy(ctx, RELATIONSHIPS_ORGANIZATION_HANDLER_ACTION_POLICY)
    return parseJsonResult(
      createOrganizationOutputSchema,
      await crm(ctx).createOrganization(input, admitted),
    )
  },
})

export const updateOrganizationTool = defineTool<
  UpdateOrganizationInput,
  z.infer<typeof organizationSchema> | null,
  RelationshipsToolContext
>({
  ...routineWriteMetadata,
  capabilityId: `${OWNER}#tool.update-organization`,
  name: "update_organization",
  description:
    "Update an organization's profile, tags, or lifecycle status. Returns null when not found.",
  inputSchema: updateOrganizationToolInputSchema,
  outputSchema: organizationSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return parseJsonResult(organizationSchema.nullable(), await crm(ctx).updateOrganization(input))
  },
})

export const listRelationshipNotesTool = defineTool<
  EntityArgs,
  z.infer<typeof noteListOutputSchema>,
  RelationshipsToolContext
>({
  ...sensitiveReadMetadata,
  capabilityId: `${OWNER}#tool.list-relationship-notes`,
  name: "list_relationship_notes",
  description: "List staff-authored notes on a CRM person or organization.",
  inputSchema: relationshipEntityArgsSchema,
  outputSchema: noteListOutputSchema,
  async handler(input, ctx) {
    return parseJsonResult(noteListOutputSchema, await crm(ctx).listNotes(input))
  },
})

function defineAddNoteTool(
  ownerType: "person" | "organization",
  ownerSchema: typeof personNoteSchema | typeof organizationNoteSchema,
) {
  return defineTool<
    AddOwnedNoteInput,
    z.infer<typeof personNoteSchema> | z.infer<typeof organizationNoteSchema> | null,
    RelationshipsToolContext
  >({
    ...sensitiveWriteMetadata,
    capabilityId: `${OWNER}#tool.add-${ownerType}-note`,
    name: `add_${ownerType}_note`,
    description: `Add a staff-attributed note to a CRM ${ownerType}.`,
    inputSchema: addOwnedNoteInputSchema,
    outputSchema: ownerSchema.nullable(),
    async handler(input, ctx) {
      return parseJsonResult(
        ownerSchema.nullable(),
        await crm(ctx).addNote({ ...input, entityType: ownerType }),
      )
    },
  })
}

export const addPersonNoteTool = defineTool(defineAddNoteTool("person", personNoteSchema))
export const addOrganizationNoteTool = defineTool(
  defineAddNoteTool("organization", organizationNoteSchema),
)

export const updateRelationshipNoteTool = defineTool<
  EditNoteInput,
  z.infer<typeof noteSchema> | null,
  RelationshipsToolContext
>({
  ...sensitiveWriteMetadata,
  capabilityId: `${OWNER}#tool.update-relationship-note`,
  name: "update_relationship_note",
  description: "Edit an existing CRM person or organization note. Returns null when not found.",
  inputSchema: editNoteInputSchema,
  outputSchema: noteSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return parseJsonResult(noteSchema.nullable(), await crm(ctx).updateNote(input))
  },
})

export const listRelationshipContactMethodsTool = defineTool<
  EntityArgs,
  z.infer<typeof contactMethodSchema>[],
  RelationshipsToolContext
>({
  ...sensitiveReadMetadata,
  capabilityId: `${OWNER}#tool.list-relationship-contact-methods`,
  name: "list_relationship_contact_methods",
  description: "List email, phone, messaging, website, and other contact methods for a CRM entity.",
  inputSchema: relationshipEntityArgsSchema,
  outputSchema: z.array(contactMethodSchema),
  async handler(input, ctx) {
    return parseJsonResult(z.array(contactMethodSchema), await crm(ctx).listContactMethods(input))
  },
})

function defineAddContactMethodTool(ownerType: "person" | "organization") {
  return defineTool<
    AddOwnedContactMethodInput,
    z.infer<typeof contactMethodSchema> | null,
    RelationshipsToolContext
  >({
    ...sensitiveWriteMetadata,
    capabilityId: `${OWNER}#tool.add-${ownerType}-contact-method`,
    name: `add_${ownerType}_contact_method`,
    description: `Add a contact method to a CRM ${ownerType}.`,
    inputSchema: addOwnedContactMethodInputSchema,
    outputSchema: contactMethodSchema.nullable(),
    async handler(input, ctx) {
      return parseJsonResult(
        contactMethodSchema.nullable(),
        await crm(ctx).addContactMethod({ ...input, entityType: ownerType }),
      )
    },
  })
}

export const addPersonContactMethodTool = defineTool(defineAddContactMethodTool("person"))
export const addOrganizationContactMethodTool = defineTool(
  defineAddContactMethodTool("organization"),
)

export const updateRelationshipContactMethodTool = defineTool<
  EditContactMethodInput,
  z.infer<typeof contactMethodSchema> | null,
  RelationshipsToolContext
>({
  ...sensitiveWriteMetadata,
  capabilityId: `${OWNER}#tool.update-relationship-contact-method`,
  name: "update_relationship_contact_method",
  description: "Update a CRM contact method without re-parenting it. Returns null when not found.",
  inputSchema: editContactMethodInputSchema,
  outputSchema: contactMethodSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return parseJsonResult(
      contactMethodSchema.nullable(),
      await crm(ctx).updateContactMethod(input),
    )
  },
})

export const listRelationshipAddressesTool = defineTool<
  EntityArgs,
  z.infer<typeof addressSchema>[],
  RelationshipsToolContext
>({
  ...sensitiveReadMetadata,
  capabilityId: `${OWNER}#tool.list-relationship-addresses`,
  name: "list_relationship_addresses",
  description: "List billing, legal, primary, and other addresses for a CRM entity.",
  inputSchema: relationshipEntityArgsSchema,
  outputSchema: z.array(addressSchema),
  async handler(input, ctx) {
    return parseJsonResult(z.array(addressSchema), await crm(ctx).listAddresses(input))
  },
})

function defineAddAddressTool(ownerType: "person" | "organization") {
  return defineTool<
    AddOwnedAddressInput,
    z.infer<typeof addressSchema> | null,
    RelationshipsToolContext
  >({
    ...sensitiveWriteMetadata,
    capabilityId: `${OWNER}#tool.add-${ownerType}-address`,
    name: `add_${ownerType}_address`,
    description: `Add an address to a CRM ${ownerType}.`,
    inputSchema: addOwnedAddressInputSchema,
    outputSchema: addressSchema.nullable(),
    async handler(input, ctx) {
      return parseJsonResult(
        addressSchema.nullable(),
        await crm(ctx).addAddress({ ...input, entityType: ownerType }),
      )
    },
  })
}

export const addPersonAddressTool = defineTool(defineAddAddressTool("person"))
export const addOrganizationAddressTool = defineTool(defineAddAddressTool("organization"))

export const updateRelationshipAddressTool = defineTool<
  EditAddressInput,
  z.infer<typeof addressSchema> | null,
  RelationshipsToolContext
>({
  ...sensitiveWriteMetadata,
  capabilityId: `${OWNER}#tool.update-relationship-address`,
  name: "update_relationship_address",
  description: "Update a CRM address without re-parenting it. Returns null when not found.",
  inputSchema: editAddressInputSchema,
  outputSchema: addressSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return parseJsonResult(addressSchema.nullable(), await crm(ctx).updateAddress(input))
  },
})

export const relationshipsTools = [
  listPeopleTool,
  getPersonTool,
  createPersonTool,
  updatePersonTool,
  listOrganizationsTool,
  getOrganizationTool,
  createOrganizationTool,
  updateOrganizationTool,
  listRelationshipNotesTool,
  addPersonNoteTool,
  addOrganizationNoteTool,
  updateRelationshipNoteTool,
  listRelationshipContactMethodsTool,
  addPersonContactMethodTool,
  addOrganizationContactMethodTool,
  updateRelationshipContactMethodTool,
  listRelationshipAddressesTool,
  addPersonAddressTool,
  addOrganizationAddressTool,
  updateRelationshipAddressTool,
] as const

function parseJsonResult<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(toJsonValue(value))
}

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toJsonValue(nested)] as const)
      .filter(([, nested]) => nested !== undefined),
  )
}
