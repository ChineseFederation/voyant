/**
 * agent-quality: file-size exception -- owner: relationships; existing accounts route surface stays co-located until route groups are split without changing mount order or OpenAPI output.
 *
 * Relationships "accounts" admin routes — organizations, people, their notes,
 * contact methods, addresses, payment methods, communications, segments, and
 * the people CSV import/export. Migrated to `@hono/zod-openapi` for the OpenAPI
 * admin backfill (voyant#2276 — step 3.5, stage A) via a NON-BREAKING
 * dual-mount: the parent `relationshipsRoutes` (see `index.ts`) is an
 * `OpenAPIHono` exported as both `routes` (legacy `/v1/relationships/*`) and
 * `adminRoutes` (documented `/v1/admin/relationships/*`). Request schemas reuse
 * the exported `validation.ts` / identity insert/update/list-query schemas the
 * handlers already parsed; response row schemas live in
 * `accounts-openapi-schemas.ts` (authored from the Drizzle `$inferSelect`
 * shapes; §17 timestamps/dates → strings). Business logic and the wire
 * envelopes are unchanged — handlers read `c.req.valid(...)` and still call the
 * same `relationshipsService` methods via `c.get("db")` / `c.get("eventBus")` /
 * `c.get("container")`.
 *
 * Each resource family is its own small `OpenAPIHono` sub-chain composed onto
 * `accountRoutes` via `.route("/")` so the `.openapi()` operations propagate up
 * while keeping type-inference cost bounded (one flat chain is O(n²)).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { EventBus, ModuleContainer } from "@voyant-travel/core"
import {
  type CustomFieldDefinition,
  createCustomFieldRegistry,
  customFieldsVisibleIn,
  type NamespacedCustomFieldValues,
  validateCustomFields,
} from "@voyant-travel/core/custom-fields"
import {
  idempotencyKey,
  openApiValidationHook,
  RequestValidationError,
  requireUserId,
} from "@voyant-travel/hono"
import {
  insertAddressForEntitySchema,
  insertContactPointForEntitySchema,
  updateAddressSchema,
  updateContactPointSchema,
} from "@voyant-travel/identity/validation"
import { listResponseSchema } from "@voyant-travel/types"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { emitOrganizationChanged, emitPersonChanged } from "../events.js"
import {
  RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY,
  type RelationshipsRouteRuntime,
} from "../route-runtime.js"
import { RelationshipsMergeError } from "../service/accounts-merge.js"
import { relationshipsService } from "../service/index.js"
import { mergePersonCommunications } from "../service/person-communications.js"
import {
  communicationListQuerySchema,
  insertCommunicationLogSchema,
  insertOrganizationNoteSchema,
  insertOrganizationSchema,
  insertPersonNoteSchema,
  insertPersonPaymentMethodSchema,
  insertPersonSchema,
  insertSegmentSchema,
  mergeOrganizationSchema,
  mergePersonSchema,
  organizationListQuerySchema,
  personListQuerySchema,
  updateOrganizationNoteSchema,
  updateOrganizationSchema,
  updatePersonNoteSchema,
  updatePersonPaymentMethodSchema,
  updatePersonSchema,
} from "../validation.js"
import {
  addressSchema,
  communicationLogEntrySchema,
  contactMethodSchema,
  csvBodySchema,
  errorResponseSchema,
  idParamSchema,
  organizationNoteSchema,
  organizationSchema,
  peopleImportResultSchema,
  personNoteSchema,
  personPaymentMethodSchema,
  personSchema,
  segmentIdParamSchema,
  segmentSchema,
  successResponseSchema,
} from "./accounts-openapi-schemas.js"

type Env = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
    container?: ModuleContainer
    eventBus?: EventBus
  }
}

const organizationEntity = "organization" as const
const personEntity = "person" as const

const jsonContent = <T extends z.ZodTypeAny>(schema: T) => ({
  content: { "application/json": { schema } },
})

const requiredJsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  body: { required: true, content: { "application/json": { schema } } },
})

function mergeErrorResponse(c: Context<Env>, error: unknown) {
  if (error instanceof RelationshipsMergeError) {
    return c.json({ error: error.message }, error.status)
  }
  throw error
}

function optionalHydratedPersonField(row: object, field: "email" | "phone" | "website") {
  const value = Reflect.get(row, field)
  return typeof value === "string" ? value : null
}

/**
 * Validate a person/organization write's `customFields` against the resolved
 * database-backed custom-field registry and replace
 * the payload with the cleaned value. No-op when the write carries none. Rejects
 * (400) unknown keys / missing required / bad types, or any `customFields` when
 * no persisted definition exists. See the custom-fields architecture guide.
 */
async function validateRelationshipsCustomFields(
  c: Context<Env>,
  entity: "person" | "organization",
  data: { customFields?: NamespacedCustomFieldValues },
  mode: "create" | "update",
  db: PostgresJsDatabase,
): Promise<void> {
  const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
    | RelationshipsRouteRuntime
    | undefined
  const resolveRegistry = runtime?.customFieldsForWrite
  if (data.customFields === undefined) {
    // Partial update without custom fields, or no registry → no-op. A create with
    // an absent envelope still validates `{}` so `required` fields are enforced.
    if (mode === "update" || !resolveRegistry) {
      return
    }
  } else if (!resolveRegistry) {
    throw new RequestValidationError("Custom fields are not configured for this deployment", {
      fields: { fieldErrors: { customFields: ["not configured"] }, formErrors: [] },
    })
  }
  if (!resolveRegistry) {
    return
  }
  const registry = await resolveRegistry(db, entity)
  const operatorRegistry = createCustomFieldRegistry(
    registry.forEntity(entity).filter((definition) => definition.namespace === "custom"),
  )
  const result = validateCustomFields(operatorRegistry, entity, data.customFields ?? {})
  if (!result.ok) {
    throw new RequestValidationError(`Invalid ${entity} custom fields`, {
      fields: {
        fieldErrors: Object.fromEntries(
          result.errors.map((e) => [`${e.namespace}.${e.key}`, [e.message]]),
        ),
        formErrors: [],
      },
    })
  }
  data.customFields = result.value
}

/** Custom fields for `entity` visible in `channel` (export / invoice / search). */
async function resolveVisibleCustomFields(
  c: Context<Env>,
  entity: "person" | "organization",
  channel: "export" | "invoice" | "search",
): Promise<CustomFieldDefinition[]> {
  const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
    | RelationshipsRouteRuntime
    | undefined
  const resolveRegistry = runtime?.customFields
  if (!resolveRegistry) return []
  return customFieldsVisibleIn(await resolveRegistry(c.get("db")), entity, channel)
}

// ===========================================================================
// Organizations (+ organization notes)
// ===========================================================================

const listOrganizationsRoute = createRoute({
  method: "get",
  path: "/organizations",
  request: { query: organizationListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of organizations",
      ...jsonContent(listResponseSchema(organizationSchema)),
    },
  },
})

const createOrganizationRoute = createRoute({
  method: "post",
  path: "/organizations",
  request: requiredJsonBody(insertOrganizationSchema),
  responses: {
    201: {
      description: "The created organization",
      ...jsonContent(z.object({ data: organizationSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getOrganizationRoute = createRoute({
  method: "get",
  path: "/organizations/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "An organization by id",
      ...jsonContent(z.object({ data: organizationSchema })),
    },
    404: { description: "Organization not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateOrganizationRoute = createRoute({
  method: "patch",
  path: "/organizations/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateOrganizationSchema) },
  responses: {
    200: {
      description: "The updated organization",
      ...jsonContent(z.object({ data: organizationSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Organization not found", ...jsonContent(errorResponseSchema) },
  },
})

const mergeOrganizationRoute = createRoute({
  method: "post",
  path: "/organizations/{id}/merge",
  request: { params: idParamSchema, ...requiredJsonBody(mergeOrganizationSchema) },
  responses: {
    200: {
      description: "The surviving organization after merge",
      ...jsonContent(z.object({ data: organizationSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Organization not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteOrganizationRoute = createRoute({
  method: "delete",
  path: "/organizations/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Organization deleted", ...jsonContent(successResponseSchema) },
    409: { description: "Organization has linked people", ...jsonContent(errorResponseSchema) },
    404: { description: "Organization not found", ...jsonContent(errorResponseSchema) },
  },
})

const listOrganizationContactMethodsRoute = createRoute({
  method: "get",
  path: "/organizations/{id}/contact-methods",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Contact methods for the organization",
      ...jsonContent(z.object({ data: z.array(contactMethodSchema) })),
    },
  },
})

const createOrganizationContactMethodRoute = createRoute({
  method: "post",
  path: "/organizations/{id}/contact-methods",
  request: { params: idParamSchema, ...requiredJsonBody(insertContactPointForEntitySchema) },
  responses: {
    201: {
      description: "The created contact method",
      ...jsonContent(z.object({ data: contactMethodSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Organization not found", ...jsonContent(errorResponseSchema) },
  },
})

const listOrganizationAddressesRoute = createRoute({
  method: "get",
  path: "/organizations/{id}/addresses",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Addresses for the organization",
      ...jsonContent(z.object({ data: z.array(addressSchema) })),
    },
  },
})

const createOrganizationAddressRoute = createRoute({
  method: "post",
  path: "/organizations/{id}/addresses",
  request: { params: idParamSchema, ...requiredJsonBody(insertAddressForEntitySchema) },
  responses: {
    201: {
      description: "The created address",
      ...jsonContent(z.object({ data: addressSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Organization not found", ...jsonContent(errorResponseSchema) },
  },
})

const listOrganizationNotesRoute = createRoute({
  method: "get",
  path: "/organizations/{id}/notes",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Notes for the organization",
      ...jsonContent(z.object({ data: z.array(organizationNoteSchema) })),
    },
  },
})

const createOrganizationNoteRoute = createRoute({
  method: "post",
  path: "/organizations/{id}/notes",
  request: { params: idParamSchema, ...requiredJsonBody(insertOrganizationNoteSchema) },
  responses: {
    201: {
      description: "The created organization note",
      ...jsonContent(z.object({ data: organizationNoteSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Organization not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateOrganizationNoteRoute = createRoute({
  method: "patch",
  path: "/organization-notes/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateOrganizationNoteSchema) },
  responses: {
    200: {
      description: "The updated organization note",
      ...jsonContent(z.object({ data: organizationNoteSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Note not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteOrganizationNoteRoute = createRoute({
  method: "delete",
  path: "/organization-notes/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Note deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Note not found", ...jsonContent(errorResponseSchema) },
  },
})

const organizationRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
// `createRoute` has no per-method middleware slot, so the idempotency guard is
// registered via `.use(path, mw)` before the `.openapi()` chain (it no-ops when
// the request carries no Idempotency-Key header, so GET /organizations is safe).
organizationRoutes.use(
  "/organizations",
  idempotencyKey({ scope: "POST /v1/admin/relationships/organizations" }),
)

organizationRoutes
  .openapi(listOrganizationsRoute, async (c) =>
    c.json(await relationshipsService.listOrganizations(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createOrganizationRoute, async (c) => {
    const data = c.req.valid("json")
    const db = c.get("db")
    const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
      | RelationshipsRouteRuntime
      | undefined
    const row = runtime?.customFieldsForWrite
      ? await db.transaction(async (tx) => {
          await validateRelationshipsCustomFields(c, organizationEntity, data, "create", tx)
          return relationshipsService.createOrganization(tx, data)
        })
      : await (async () => {
          await validateRelationshipsCustomFields(c, organizationEntity, data, "create", db)
          return relationshipsService.createOrganization(db, data)
        })()
    if (row) await emitOrganizationChanged(c.get("eventBus"), { id: row.id, action: "created" })
    return c.json({ data: row! }, 201)
  })
  .openapi(getOrganizationRoute, async (c) => {
    const row = await relationshipsService.getOrganizationById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Organization not found" }, 404)
  })
  .openapi(updateOrganizationRoute, async (c) => {
    const data = c.req.valid("json")
    const db = c.get("db")
    const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
      | RelationshipsRouteRuntime
      | undefined
    const row =
      data.customFields !== undefined && runtime?.customFieldsForWrite
        ? await db.transaction(async (tx) => {
            await validateRelationshipsCustomFields(c, organizationEntity, data, "update", tx)
            return relationshipsService.updateOrganization(tx, c.req.valid("param").id, data)
          })
        : await (async () => {
            await validateRelationshipsCustomFields(c, organizationEntity, data, "update", db)
            return relationshipsService.updateOrganization(db, c.req.valid("param").id, data)
          })()
    if (!row) return c.json({ error: "Organization not found" }, 404)
    await emitOrganizationChanged(c.get("eventBus"), { id: row.id, action: "updated" })
    return c.json({ data: row }, 200)
  })
  .openapi(mergeOrganizationRoute, async (c) => {
    try {
      const body = c.req.valid("json")
      const row = await relationshipsService.mergeOrganization(
        c.get("db"),
        c.req.valid("param").id,
        body.mergeId,
      )
      return c.json({ data: row }, 200)
    } catch (error) {
      return mergeErrorResponse(c, error)
    }
  })
  .openapi(deleteOrganizationRoute, async (c) => {
    const id = c.req.valid("param").id
    const row = await relationshipsService.deleteOrganization(c.get("db"), id)
    if (row && "conflict" in row) {
      return c.json({ error: "Organization has linked people" }, 409)
    }
    if (!row) return c.json({ error: "Organization not found" }, 404)
    await emitOrganizationChanged(c.get("eventBus"), { id, action: "deleted" })
    return c.json({ success: true } as const, 200)
  })
  .openapi(listOrganizationContactMethodsRoute, async (c) =>
    c.json(
      {
        data: await relationshipsService.listContactMethods(
          c.get("db"),
          organizationEntity,
          c.req.valid("param").id,
        ),
      },
      200,
    ),
  )
  .openapi(createOrganizationContactMethodRoute, async (c) => {
    const row = await relationshipsService.createContactMethod(
      c.get("db"),
      organizationEntity,
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Organization not found" }, 404)
  })
  .openapi(listOrganizationAddressesRoute, async (c) =>
    c.json(
      {
        data: await relationshipsService.listAddresses(
          c.get("db"),
          organizationEntity,
          c.req.valid("param").id,
        ),
      },
      200,
    ),
  )
  .openapi(createOrganizationAddressRoute, async (c) => {
    const row = await relationshipsService.createAddress(
      c.get("db"),
      organizationEntity,
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Organization not found" }, 404)
  })
  .openapi(listOrganizationNotesRoute, async (c) =>
    c.json(
      {
        data: await relationshipsService.listOrganizationNotes(
          c.get("db"),
          c.req.valid("param").id,
        ),
      },
      200,
    ),
  )
  .openapi(createOrganizationNoteRoute, async (c) => {
    const userId = requireUserId(c)
    const row = await relationshipsService.createOrganizationNote(
      c.get("db"),
      c.req.valid("param").id,
      userId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Organization not found" }, 404)
  })
  .openapi(updateOrganizationNoteRoute, async (c) => {
    const body = c.req.valid("json")
    const row = await relationshipsService.updateOrganizationNote(
      c.get("db"),
      c.req.valid("param").id,
      body.content,
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Note not found" }, 404)
  })
  .openapi(deleteOrganizationNoteRoute, async (c) => {
    const row = await relationshipsService.deleteOrganizationNote(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row ? c.json({ success: true } as const, 200) : c.json({ error: "Note not found" }, 404)
  })

// ===========================================================================
// People (+ notes, payment methods, communications, contact methods, addresses)
// ===========================================================================

const listPeopleRoute = createRoute({
  method: "get",
  path: "/people",
  request: { query: personListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of people",
      ...jsonContent(listResponseSchema(personSchema)),
    },
  },
})

const createPersonRoute = createRoute({
  method: "post",
  path: "/people",
  request: requiredJsonBody(insertPersonSchema),
  responses: {
    201: { description: "The created person", ...jsonContent(z.object({ data: personSchema })) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getPersonRoute = createRoute({
  method: "get",
  path: "/people/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "A person by id", ...jsonContent(z.object({ data: personSchema })) },
    404: { description: "Person not found", ...jsonContent(errorResponseSchema) },
  },
})

const updatePersonRoute = createRoute({
  method: "patch",
  path: "/people/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updatePersonSchema) },
  responses: {
    200: { description: "The updated person", ...jsonContent(z.object({ data: personSchema })) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Person not found", ...jsonContent(errorResponseSchema) },
  },
})

const mergePersonRoute = createRoute({
  method: "post",
  path: "/people/{id}/merge",
  request: { params: idParamSchema, ...requiredJsonBody(mergePersonSchema) },
  responses: {
    200: {
      description: "The surviving person after merge",
      ...jsonContent(z.object({ data: personSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Person not found", ...jsonContent(errorResponseSchema) },
  },
})

const deletePersonRoute = createRoute({
  method: "delete",
  path: "/people/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Person deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Person not found", ...jsonContent(errorResponseSchema) },
  },
})

const listPersonContactMethodsRoute = createRoute({
  method: "get",
  path: "/people/{id}/contact-methods",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Contact methods for the person",
      ...jsonContent(z.object({ data: z.array(contactMethodSchema) })),
    },
  },
})

const createPersonContactMethodRoute = createRoute({
  method: "post",
  path: "/people/{id}/contact-methods",
  request: { params: idParamSchema, ...requiredJsonBody(insertContactPointForEntitySchema) },
  responses: {
    201: {
      description: "The created contact method",
      ...jsonContent(z.object({ data: contactMethodSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Person not found", ...jsonContent(errorResponseSchema) },
  },
})

const listPersonAddressesRoute = createRoute({
  method: "get",
  path: "/people/{id}/addresses",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Addresses for the person",
      ...jsonContent(z.object({ data: z.array(addressSchema) })),
    },
  },
})

const createPersonAddressRoute = createRoute({
  method: "post",
  path: "/people/{id}/addresses",
  request: { params: idParamSchema, ...requiredJsonBody(insertAddressForEntitySchema) },
  responses: {
    201: {
      description: "The created address",
      ...jsonContent(z.object({ data: addressSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Person not found", ...jsonContent(errorResponseSchema) },
  },
})

const listPersonNotesRoute = createRoute({
  method: "get",
  path: "/people/{id}/notes",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Notes for the person",
      ...jsonContent(z.object({ data: z.array(personNoteSchema) })),
    },
  },
})

const createPersonNoteRoute = createRoute({
  method: "post",
  path: "/people/{id}/notes",
  request: { params: idParamSchema, ...requiredJsonBody(insertPersonNoteSchema) },
  responses: {
    201: {
      description: "The created person note",
      ...jsonContent(z.object({ data: personNoteSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Person not found", ...jsonContent(errorResponseSchema) },
  },
})

const updatePersonNoteRoute = createRoute({
  method: "patch",
  path: "/person-notes/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updatePersonNoteSchema) },
  responses: {
    200: {
      description: "The updated person note",
      ...jsonContent(z.object({ data: personNoteSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Note not found", ...jsonContent(errorResponseSchema) },
  },
})

const deletePersonNoteRoute = createRoute({
  method: "delete",
  path: "/person-notes/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Note deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Note not found", ...jsonContent(errorResponseSchema) },
  },
})

const listPersonPaymentMethodsRoute = createRoute({
  method: "get",
  path: "/people/{id}/payment-methods",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Payment methods on file for the person",
      ...jsonContent(z.object({ data: z.array(personPaymentMethodSchema) })),
    },
  },
})

const createPersonPaymentMethodRoute = createRoute({
  method: "post",
  path: "/people/{id}/payment-methods",
  request: { params: idParamSchema, ...requiredJsonBody(insertPersonPaymentMethodSchema) },
  responses: {
    201: {
      description: "The created payment method",
      ...jsonContent(z.object({ data: personPaymentMethodSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Person not found", ...jsonContent(errorResponseSchema) },
  },
})

const updatePersonPaymentMethodRoute = createRoute({
  method: "patch",
  path: "/person-payment-methods/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updatePersonPaymentMethodSchema) },
  responses: {
    200: {
      description: "The updated payment method",
      ...jsonContent(z.object({ data: personPaymentMethodSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Payment method not found", ...jsonContent(errorResponseSchema) },
  },
})

const deletePersonPaymentMethodRoute = createRoute({
  method: "delete",
  path: "/person-payment-methods/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Payment method deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Payment method not found", ...jsonContent(errorResponseSchema) },
  },
})

const listCommunicationsRoute = createRoute({
  method: "get",
  path: "/people/{id}/communications",
  request: { params: idParamSchema, query: communicationListQuerySchema },
  responses: {
    200: {
      description: "Communication log entries for the person",
      ...jsonContent(z.object({ data: z.array(communicationLogEntrySchema) })),
    },
  },
})

const createCommunicationRoute = createRoute({
  method: "post",
  path: "/people/{id}/communications",
  request: { params: idParamSchema, ...requiredJsonBody(insertCommunicationLogSchema) },
  responses: {
    201: {
      description: "The created communication log entry",
      ...jsonContent(z.object({ data: communicationLogEntrySchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Person not found", ...jsonContent(errorResponseSchema) },
  },
})

const peopleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
// Idempotency guard for POST /people (no-op without an Idempotency-Key header).
peopleRoutes.use("/people", idempotencyKey({ scope: "POST /v1/admin/relationships/people" }))

peopleRoutes
  .openapi(listPeopleRoute, async (c) => {
    const query = c.req.valid("query")
    const searchableFields = query.search
      ? await resolveVisibleCustomFields(c, personEntity, "search")
      : []
    return c.json(await relationshipsService.listPeople(c.get("db"), query, searchableFields), 200)
  })
  .openapi(createPersonRoute, async (c) => {
    const data = c.req.valid("json")
    const db = c.get("db")
    const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
      | RelationshipsRouteRuntime
      | undefined
    const row = runtime?.customFieldsForWrite
      ? await db.transaction(async (tx) => {
          await validateRelationshipsCustomFields(c, personEntity, data, "create", tx)
          return relationshipsService.createPerson(tx, data)
        })
      : await (async () => {
          await validateRelationshipsCustomFields(c, personEntity, data, "create", db)
          return relationshipsService.createPerson(db, data)
        })()
    if (row) await emitPersonChanged(c.get("eventBus"), { id: row.id, action: "created" })
    return c.json({ data: row! }, 201)
  })
  .openapi(getPersonRoute, async (c) => {
    const row = await relationshipsService.getPersonById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Person not found" }, 404)
  })
  .openapi(updatePersonRoute, async (c) => {
    const data = c.req.valid("json")
    const db = c.get("db")
    const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
      | RelationshipsRouteRuntime
      | undefined
    const row =
      data.customFields !== undefined && runtime?.customFieldsForWrite
        ? await db.transaction(async (tx) => {
            await validateRelationshipsCustomFields(c, personEntity, data, "update", tx)
            return relationshipsService.updatePerson(tx, c.req.valid("param").id, data)
          })
        : await (async () => {
            await validateRelationshipsCustomFields(c, personEntity, data, "update", db)
            return relationshipsService.updatePerson(db, c.req.valid("param").id, data)
          })()
    if (!row) return c.json({ error: "Person not found" }, 404)
    await emitPersonChanged(c.get("eventBus"), { id: row.id, action: "updated" })
    return c.json({ data: row }, 200)
  })
  .openapi(mergePersonRoute, async (c) => {
    try {
      const body = c.req.valid("json")
      const row = await relationshipsService.mergePerson(
        c.get("db"),
        c.req.valid("param").id,
        body.mergeId,
      )
      // The service always returns the hydrated survivor (email/phone/website);
      // the `?? row` fallback in the service only widens the static type.
      const data = {
        ...row,
        email: optionalHydratedPersonField(row, "email"),
        phone: optionalHydratedPersonField(row, "phone"),
        website: optionalHydratedPersonField(row, "website"),
      }
      return c.json({ data }, 200)
    } catch (error) {
      return mergeErrorResponse(c, error)
    }
  })
  .openapi(deletePersonRoute, async (c) => {
    const id = c.req.valid("param").id
    const row = await relationshipsService.deletePerson(c.get("db"), id)
    if (!row) return c.json({ error: "Person not found" }, 404)
    await emitPersonChanged(c.get("eventBus"), { id, action: "deleted" })
    return c.json({ success: true } as const, 200)
  })
  .openapi(listPersonContactMethodsRoute, async (c) =>
    c.json(
      {
        data: await relationshipsService.listContactMethods(
          c.get("db"),
          personEntity,
          c.req.valid("param").id,
        ),
      },
      200,
    ),
  )
  .openapi(createPersonContactMethodRoute, async (c) => {
    const row = await relationshipsService.createContactMethod(
      c.get("db"),
      personEntity,
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Person not found" }, 404)
  })
  .openapi(listPersonAddressesRoute, async (c) =>
    c.json(
      {
        data: await relationshipsService.listAddresses(
          c.get("db"),
          personEntity,
          c.req.valid("param").id,
        ),
      },
      200,
    ),
  )
  .openapi(createPersonAddressRoute, async (c) => {
    const row = await relationshipsService.createAddress(
      c.get("db"),
      personEntity,
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Person not found" }, 404)
  })
  .openapi(listPersonNotesRoute, async (c) =>
    c.json(
      { data: await relationshipsService.listPersonNotes(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(createPersonNoteRoute, async (c) => {
    const userId = requireUserId(c)
    const row = await relationshipsService.createPersonNote(
      c.get("db"),
      c.req.valid("param").id,
      userId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Person not found" }, 404)
  })
  .openapi(updatePersonNoteRoute, async (c) => {
    const body = c.req.valid("json")
    const row = await relationshipsService.updatePersonNote(
      c.get("db"),
      c.req.valid("param").id,
      body.content,
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Note not found" }, 404)
  })
  .openapi(deletePersonNoteRoute, async (c) => {
    const row = await relationshipsService.deletePersonNote(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ success: true } as const, 200) : c.json({ error: "Note not found" }, 404)
  })
  .openapi(listPersonPaymentMethodsRoute, async (c) =>
    c.json(
      {
        data: await relationshipsService.listPersonPaymentMethods(
          c.get("db"),
          c.req.valid("param").id,
        ),
      },
      200,
    ),
  )
  .openapi(createPersonPaymentMethodRoute, async (c) => {
    const row = await relationshipsService.createPersonPaymentMethod(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Person not found" }, 404)
  })
  .openapi(updatePersonPaymentMethodRoute, async (c) => {
    const row = await relationshipsService.updatePersonPaymentMethod(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Payment method not found" }, 404)
  })
  .openapi(deletePersonPaymentMethodRoute, async (c) => {
    const row = await relationshipsService.deletePersonPaymentMethod(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Payment method not found" }, 404)
  })
  .openapi(listCommunicationsRoute, async (c) => {
    const personId = c.req.valid("param").id
    const query = c.req.valid("query")
    const runtime = c.get("container")?.resolve(RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY) as
      | RelationshipsRouteRuntime
      | undefined
    const [logged, delivered] = await Promise.all([
      relationshipsService.listCommunications(c.get("db"), personId, query),
      // Deliveries are outbound by definition, so a caller filtering for
      // inbound is asking for hand-logged entries only.
      query.direction === "inbound" || !runtime?.personNotifications
        ? Promise.resolve([])
        : runtime.personNotifications.listPersonDeliveries(c.get("db"), personId, query),
    ])
    return c.json({ data: mergePersonCommunications(personId, logged, delivered, query) }, 200)
  })
  .openapi(createCommunicationRoute, async (c) => {
    const row = await relationshipsService.createCommunication(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row
      ? c.json({ data: { ...row, source: "logged" as const } }, 201)
      : c.json({ error: "Person not found" }, 404)
  })

// ===========================================================================
// Segments
// ===========================================================================

const listSegmentsRoute = createRoute({
  method: "get",
  path: "/segments",
  responses: {
    200: {
      description: "All segments",
      ...jsonContent(z.object({ data: z.array(segmentSchema) })),
    },
  },
})

const createSegmentRoute = createRoute({
  method: "post",
  path: "/segments",
  request: requiredJsonBody(insertSegmentSchema),
  responses: {
    201: { description: "The created segment", ...jsonContent(z.object({ data: segmentSchema })) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const deleteSegmentRoute = createRoute({
  method: "delete",
  path: "/segments/{segmentId}",
  request: { params: segmentIdParamSchema },
  responses: {
    200: { description: "Segment deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Segment not found", ...jsonContent(errorResponseSchema) },
  },
})

const segmentRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listSegmentsRoute, async (c) =>
    c.json({ data: await relationshipsService.listSegments(c.get("db")) }, 200),
  )
  .openapi(createSegmentRoute, async (c) => {
    const row = await relationshipsService.createSegment(c.get("db"), c.req.valid("json"))
    return c.json({ data: row! }, 201)
  })
  .openapi(deleteSegmentRoute, async (c) => {
    const row = await relationshipsService.deleteSegment(
      c.get("db"),
      c.req.valid("param").segmentId,
    )
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Segment not found" }, 404)
  })

// ===========================================================================
// People CSV export / import
// ===========================================================================

const exportPeopleRoute = createRoute({
  method: "post",
  path: "/people/export",
  responses: {
    200: {
      description: "People exported as a CSV download",
      content: { "text/csv": { schema: csvBodySchema } },
    },
  },
})

const importPeopleRoute = createRoute({
  method: "post",
  path: "/people/import",
  request: { body: { required: true, content: { "text/csv": { schema: csvBodySchema } } } },
  responses: {
    200: { description: "Import summary", ...jsonContent(peopleImportResultSchema) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const csvRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(exportPeopleRoute, async (c) => {
    const visibleFields = await resolveVisibleCustomFields(c, personEntity, "export")
    const csv = await relationshipsService.exportPeopleCsv(c.get("db"), visibleFields)
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="people.csv"',
      },
    })
  })
  .openapi(importPeopleRoute, async (c) => {
    const result = await relationshipsService.importPeopleCsv(c.get("db"), await c.req.text())
    if ("error" in result) {
      return c.json({ error: result.error as string }, 400)
    }
    return c.json(result, 200)
  })

// ===========================================================================
// Shared contact-method and address resources
// ===========================================================================

const updateContactMethodRoute = createRoute({
  method: "patch",
  path: "/contact-methods/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateContactPointSchema) },
  responses: {
    200: {
      description: "The updated contact method",
      ...jsonContent(z.object({ data: contactMethodSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Contact method not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteContactMethodRoute = createRoute({
  method: "delete",
  path: "/contact-methods/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Contact method deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Contact method not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateAddressRoute = createRoute({
  method: "patch",
  path: "/addresses/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateAddressSchema) },
  responses: {
    200: {
      description: "The updated address",
      ...jsonContent(z.object({ data: addressSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Address not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteAddressRoute = createRoute({
  method: "delete",
  path: "/addresses/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Address deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Address not found", ...jsonContent(errorResponseSchema) },
  },
})

const sharedContactAddressRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(updateContactMethodRoute, async (c) => {
    const row = await relationshipsService.updateContactMethod(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Contact method not found" }, 404)
  })
  .openapi(deleteContactMethodRoute, async (c) => {
    const row = await relationshipsService.deleteContactMethod(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Contact method not found" }, 404)
  })
  .openapi(updateAddressRoute, async (c) => {
    const row = await relationshipsService.updateAddress(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Address not found" }, 404)
  })
  .openapi(deleteAddressRoute, async (c) => {
    const row = await relationshipsService.deleteAddress(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Address not found" }, 404)
  })

export const accountRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .route("/", organizationRoutes)
  .route("/", peopleRoutes)
  .route("/", segmentRoutes)
  .route("/", csvRoutes)
  .route("/", sharedContactAddressRoutes)
