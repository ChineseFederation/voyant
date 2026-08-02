/**
 * Supplier admin routes. The `suppliersApiModule` mounts this bundle as the
 * module's `adminRoutes`, so these resolve under `/v1/admin/suppliers/*`
 * (staff-actor-gated by the parent app's middleware chain).
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 /
 * voyant#2208). To keep each `.openapi()` chain's type inference modest, the
 * bundle is assembled from per-resource sub-chains (suppliers, contact-points,
 * contacts, addresses, services, rates, notes, availability, contracts), each
 * its own small `OpenAPIHono`, composed via `.route("/", subApp)`.
 *
 * Request schemas reuse the `suppliers-contracts` (`./validation`) and identity
 * `validation` schemas the handlers already parse; response schemas are authored
 * here from the row shapes (§17: `Date`/`date` columns serialize to strings over
 * the wire — never `Date`). The supplier rows carry the directory-projection
 * fields merged in by `hydrateSuppliers`.
 *
 * agent-quality: file-size exception — intentional: a single mounted supplier
 * admin surface spanning nine resources (33 legs) whose `createRoute` objects
 * co-locate with their per-resource sub-chain handlers (mirrors
 * `commerce/src/pricing/routes-core.ts`). Splitting per resource would fragment
 * the one mounted instance without aiding review. See voyant#2114 / voyant#2208.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { EventBus } from "@voyant-travel/core"
import {
  aggregateSnapshotKey,
  readThroughAggregateSnapshot,
} from "@voyant-travel/db/aggregate-snapshots"
import { openApiValidationHook, requireUserId } from "@voyant-travel/hono"
import {
  insertAddressForEntitySchema,
  insertContactPointForEntitySchema,
  insertNamedContactForEntitySchema,
  updateAddressSchema as updateIdentityAddressSchema,
  updateContactPointSchema as updateIdentityContactPointSchema,
  updateNamedContactSchema as updateIdentityNamedContactSchema,
} from "@voyant-travel/identity/validation"
import { listResponseSchema } from "@voyant-travel/types"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { suppliersService } from "./service.js"
import {
  availabilityQuerySchema,
  insertAvailabilitySchema,
  insertContractSchema,
  insertRateSchema,
  insertServiceSchema,
  insertSupplierNoteSchema,
  insertSupplierSchema,
  supplierAggregatesQuerySchema,
  supplierListQuerySchema,
  updateContractSchema,
  updateRateSchema,
  updateServiceSchema,
  updateSupplierSchema,
} from "./validation.js"

type Env = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
    eventBus?: EventBus
  }
}

const DASHBOARD_AGGREGATES_CACHE_CONTROL = "private, max-age=30"

/** Server-side snapshot TTL — see readThroughAggregateSnapshot (#1629). */
const DASHBOARD_AGGREGATES_TTL_SECONDS = 60

function cacheDashboardAggregates(c: {
  header: (name: string, value: string, options?: { append?: boolean }) => void
}) {
  c.header("Cache-Control", DASHBOARD_AGGREGATES_CACHE_CONTROL)
  c.header("Vary", "Authorization", { append: true })
  c.header("Vary", "Cookie", { append: true })
}

// ==========================================================================
// Shared response building blocks
// ==========================================================================

const errorResponseSchema = z.object({ error: z.string() })
const deleteResponseSchema = z.object({ success: z.boolean() })

const idParamSchema = z.object({ id: z.string() })
const contactPointIdParamSchema = z.object({ contactPointId: z.string() })
const contactIdParamSchema = z.object({ contactId: z.string() })
const rateIdParamSchema = z.object({ id: z.string(), serviceId: z.string(), rateId: z.string() })
const contractIdParamSchema = z.object({ id: z.string(), contractId: z.string() })
const addressOnlyIdParamSchema = z.object({ addressId: z.string() })
const serviceOnlyIdParamSchema = z.object({ id: z.string(), serviceId: z.string() })

const jsonRecordSchema = z.record(z.string(), z.unknown())

// --- enum value lists mirror the Drizzle pgEnums (suppliers + identity) -----

const supplierTypeValues = [
  "hotel",
  "transfer",
  "guide",
  "experience",
  "airline",
  "restaurant",
  "other",
] as const
const supplierStatusValues = ["active", "inactive", "pending"] as const
const serviceTypeValues = [
  "accommodation",
  "transfer",
  "experience",
  "guide",
  "meal",
  "other",
] as const
const rateUnitValues = ["per_person", "per_group", "per_night", "per_vehicle", "flat"] as const
const supplierContractStatusValues = ["active", "expired", "pending", "terminated"] as const
const contactPointKindValues = [
  "email",
  "phone",
  "mobile",
  "whatsapp",
  "website",
  "sms",
  "fax",
  "social",
  "other",
] as const
const addressLabelValues = [
  "primary",
  "billing",
  "shipping",
  "mailing",
  "meeting",
  "service",
  "legal",
  "other",
] as const
const namedContactRoleValues = [
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
] as const

// --- response row schemas (authored from the row shapes; §17: timestamp /
//     `date` columns are strings over the wire) ----------------------------

/**
 * Wire shape of a hydrated `suppliers` row. `createdAt`/`updatedAt` are
 * timestamps → strings (§17). The trailing nine fields are merged in by
 * `hydrateSuppliers` from the identity projection (never stored on the row).
 */
const supplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(supplierTypeValues),
  status: z.enum(supplierStatusValues),
  description: z.string().nullable(),
  defaultCurrency: z.string().nullable(),
  paymentTermsDays: z.number().int().nullable(),
  reservationTimeoutMinutes: z.number().int().nullable(),
  primaryFacilityId: z.string().nullable(),
  // Opaque jsonb (no Drizzle `$type`); shape mirrors finance `PaymentPolicy`
  // but the column is untyped at the DB layer, so the wire contract is `unknown`.
  customerPaymentPolicy: z.unknown(),
  tags: z.array(z.string()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // hydrated directory-projection fields
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
})

const supplierAggregatesSchema = z.object({
  total: z.number().int(),
  countsByStatus: z.array(
    z.object({ status: z.enum(supplierStatusValues), count: z.number().int() }),
  ),
  countsByType: z.array(z.object({ type: z.enum(supplierTypeValues), count: z.number().int() })),
  active: z.number().int(),
})

/** Wire shape of an `identity_contact_points` row (§17 timestamps → strings). */
const contactPointSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  kind: z.enum(contactPointKindValues),
  label: z.string().nullable(),
  value: z.string(),
  normalizedValue: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecordSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Wire shape of an `identity_named_contacts` row (§17 timestamps → strings). */
const namedContactSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  role: z.enum(namedContactRoleValues),
  name: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecordSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Wire shape of an `identity_addresses` row (§17 timestamps → strings). */
const addressSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  label: z.enum(addressLabelValues),
  fullText: z.string().nullable(),
  line1: z.string().nullable(),
  line2: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  timezone: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
  metadata: jsonRecordSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Wire shape of a `supplier_services` row (§17 timestamps → strings). */
const serviceSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  serviceType: z.enum(serviceTypeValues),
  facilityId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  duration: z.string().nullable(),
  capacity: z.number().int().nullable(),
  active: z.boolean(),
  tags: z.array(z.string()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Wire shape of a `supplier_rates` row (`validFrom`/`validTo` are `date`s → strings, §17). */
const rateSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  name: z.string(),
  currency: z.string(),
  amountCents: z.number().int(),
  unit: z.enum(rateUnitValues),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  minPax: z.number().int().nullable(),
  maxPax: z.number().int().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
})

/** Wire shape of a `supplier_notes` row (§17 timestamp → string). */
const noteSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: z.string(),
})

/** Wire shape of a `supplier_availability` row (`date` + timestamp → strings, §17). */
const availabilitySchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  date: z.string(),
  available: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string(),
})

/** Wire shape of a `supplier_contracts` row (`*Date` are `date`s + timestamps → strings, §17). */
const contractSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  agreementNumber: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  renewalDate: z.string().nullable(),
  terms: z.string().nullable(),
  status: z.enum(supplierContractStatusValues),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// ==========================================================================
// Suppliers — CRUD + dashboard aggregates
// ==========================================================================

const getAggregatesRoute = createRoute({
  method: "get",
  path: "/aggregates",
  request: { query: supplierAggregatesQuerySchema },
  responses: {
    200: {
      description: "Dashboard supplier KPIs (served from a read-through TTL snapshot)",
      content: { "application/json": { schema: z.object({ data: supplierAggregatesSchema }) } },
    },
  },
})

const listSuppliersRoute = createRoute({
  method: "get",
  path: "/",
  request: { query: supplierListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of suppliers",
      content: { "application/json": { schema: listResponseSchema(supplierSchema) } },
    },
  },
})

const createSupplierRoute = createRoute({
  method: "post",
  path: "/",
  request: {
    body: { required: true, content: { "application/json": { schema: insertSupplierSchema } } },
  },
  responses: {
    201: {
      description: "The created supplier",
      content: { "application/json": { schema: z.object({ data: supplierSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getSupplierRoute = createRoute({
  method: "get",
  path: "/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A supplier by id",
      content: { "application/json": { schema: z.object({ data: supplierSchema }) } },
    },
    404: {
      description: "Supplier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateSupplierRoute = createRoute({
  method: "patch",
  path: "/{id}",
  request: {
    params: idParamSchema,
    body: { required: true, content: { "application/json": { schema: updateSupplierSchema } } },
  },
  responses: {
    200: {
      description: "The updated supplier",
      content: { "application/json": { schema: z.object({ data: supplierSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteSupplierRoute = createRoute({
  method: "delete",
  path: "/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Supplier deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Supplier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const supplierRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  // GET /aggregates before /{id} so the matcher doesn't swallow it.
  .openapi(getAggregatesRoute, async (c) => {
    const query = c.req.valid("query")
    cacheDashboardAggregates(c)
    const snapshot = await readThroughAggregateSnapshot(c.get("db"), {
      key: aggregateSnapshotKey("suppliers", "aggregates", query),
      ttlSeconds: DASHBOARD_AGGREGATES_TTL_SECONDS,
      compute: () => suppliersService.getSupplierAggregates(c.get("db"), query),
    })
    return c.json({ data: snapshot.data }, 200)
  })
  .openapi(listSuppliersRoute, async (c) =>
    c.json(await suppliersService.listSuppliers(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createSupplierRoute, async (c) => {
    const row = await suppliersService.createSupplier(c.get("db"), c.req.valid("json"))
    await c.get("eventBus")?.emit("supplier.created", { id: row.id })
    return c.json({ data: row }, 201)
  })
  .openapi(getSupplierRoute, async (c) => {
    const row = await suppliersService.getSupplierById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Supplier not found" }, 404)
  })
  .openapi(updateSupplierRoute, async (c) => {
    const row = await suppliersService.updateSupplier(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    if (!row) return c.json({ error: "Supplier not found" }, 404)
    await c.get("eventBus")?.emit("supplier.updated", { id: row.id })
    return c.json({ data: row }, 200)
  })
  .openapi(deleteSupplierRoute, async (c) => {
    const row = await suppliersService.deleteSupplier(c.get("db"), c.req.valid("param").id)
    if (!row) return c.json({ error: "Supplier not found" }, 404)
    await c.get("eventBus")?.emit("supplier.deleted", {
      id: row.id,
      affectedProductIds: row.affectedProductIds,
    })
    return c.json({ success: true }, 200)
  })

// ==========================================================================
// Contact points (shared identity contact points for a supplier)
// ==========================================================================

const listContactPointsRoute = createRoute({
  method: "get",
  path: "/{id}/contact-points",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Shared contact points for a supplier",
      content: { "application/json": { schema: z.object({ data: z.array(contactPointSchema) }) } },
    },
  },
})

const createContactPointRoute = createRoute({
  method: "post",
  path: "/{id}/contact-points",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertContactPointForEntitySchema } },
    },
  },
  responses: {
    201: {
      description: "The created contact point",
      content: { "application/json": { schema: z.object({ data: contactPointSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateContactPointRoute = createRoute({
  method: "patch",
  path: "/contact-points/{contactPointId}",
  request: {
    params: contactPointIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateIdentityContactPointSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated contact point",
      content: { "application/json": { schema: z.object({ data: contactPointSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Contact point not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteContactPointRoute = createRoute({
  method: "delete",
  path: "/contact-points/{contactPointId}",
  request: { params: contactPointIdParamSchema },
  responses: {
    200: {
      description: "Contact point deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Contact point not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const contactPointRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listContactPointsRoute, async (c) =>
    c.json(
      { data: await suppliersService.listContactPoints(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(createContactPointRoute, async (c) => {
    const row = await suppliersService.createContactPoint(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Supplier not found" }, 404)
  })
  .openapi(updateContactPointRoute, async (c) => {
    const row = await suppliersService.updateContactPoint(
      c.get("db"),
      c.req.valid("param").contactPointId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Contact point not found" }, 404)
  })
  .openapi(deleteContactPointRoute, async (c) => {
    const row = await suppliersService.deleteContactPoint(
      c.get("db"),
      c.req.valid("param").contactPointId,
    )
    return row ? c.json({ success: true }, 200) : c.json({ error: "Contact point not found" }, 404)
  })

// ==========================================================================
// Named contacts
// ==========================================================================

const listContactsRoute = createRoute({
  method: "get",
  path: "/{id}/contacts",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Shared named contacts for a supplier",
      content: { "application/json": { schema: z.object({ data: z.array(namedContactSchema) }) } },
    },
  },
})

const createContactRoute = createRoute({
  method: "post",
  path: "/{id}/contacts",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertNamedContactForEntitySchema } },
    },
  },
  responses: {
    201: {
      description: "The created named contact",
      content: { "application/json": { schema: z.object({ data: namedContactSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateContactRoute = createRoute({
  method: "patch",
  path: "/contacts/{contactId}",
  request: {
    params: contactIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateIdentityNamedContactSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated named contact",
      content: { "application/json": { schema: z.object({ data: namedContactSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Contact not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteContactRoute = createRoute({
  method: "delete",
  path: "/contacts/{contactId}",
  request: { params: contactIdParamSchema },
  responses: {
    200: {
      description: "Named contact deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Contact not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const contactRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listContactsRoute, async (c) =>
    c.json(
      { data: await suppliersService.listNamedContacts(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(createContactRoute, async (c) => {
    const row = await suppliersService.createNamedContact(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Supplier not found" }, 404)
  })
  .openapi(updateContactRoute, async (c) => {
    const row = await suppliersService.updateNamedContact(
      c.get("db"),
      c.req.valid("param").contactId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Contact not found" }, 404)
  })
  .openapi(deleteContactRoute, async (c) => {
    const row = await suppliersService.deleteNamedContact(
      c.get("db"),
      c.req.valid("param").contactId,
    )
    return row ? c.json({ success: true }, 200) : c.json({ error: "Contact not found" }, 404)
  })

// ==========================================================================
// Addresses
// ==========================================================================

const listAddressesRoute = createRoute({
  method: "get",
  path: "/{id}/addresses",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Shared addresses for a supplier",
      content: { "application/json": { schema: z.object({ data: z.array(addressSchema) }) } },
    },
  },
})

const createAddressRoute = createRoute({
  method: "post",
  path: "/{id}/addresses",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertAddressForEntitySchema } },
    },
  },
  responses: {
    201: {
      description: "The created address",
      content: { "application/json": { schema: z.object({ data: addressSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateAddressRoute = createRoute({
  method: "patch",
  path: "/addresses/{addressId}",
  request: {
    params: addressOnlyIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateIdentityAddressSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated address",
      content: { "application/json": { schema: z.object({ data: addressSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Address not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteAddressRoute = createRoute({
  method: "delete",
  path: "/addresses/{addressId}",
  request: { params: addressOnlyIdParamSchema },
  responses: {
    200: {
      description: "Address deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Address not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const addressRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listAddressesRoute, async (c) =>
    c.json(
      { data: await suppliersService.listAddresses(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(createAddressRoute, async (c) => {
    const row = await suppliersService.createAddress(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Supplier not found" }, 404)
  })
  .openapi(updateAddressRoute, async (c) => {
    const row = await suppliersService.updateAddress(
      c.get("db"),
      c.req.valid("param").addressId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Address not found" }, 404)
  })
  .openapi(deleteAddressRoute, async (c) => {
    const row = await suppliersService.deleteAddress(c.get("db"), c.req.valid("param").addressId)
    return row ? c.json({ success: true }, 200) : c.json({ error: "Address not found" }, 404)
  })

// ==========================================================================
// Services
// ==========================================================================

const listServicesRoute = createRoute({
  method: "get",
  path: "/{id}/services",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Services for a supplier",
      content: { "application/json": { schema: z.object({ data: z.array(serviceSchema) }) } },
    },
  },
})

const createServiceRoute = createRoute({
  method: "post",
  path: "/{id}/services",
  request: {
    params: idParamSchema,
    body: { required: true, content: { "application/json": { schema: insertServiceSchema } } },
  },
  responses: {
    201: {
      description: "The created service",
      content: { "application/json": { schema: z.object({ data: serviceSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateServiceRoute = createRoute({
  method: "patch",
  path: "/{id}/services/{serviceId}",
  request: {
    params: serviceOnlyIdParamSchema,
    body: { required: true, content: { "application/json": { schema: updateServiceSchema } } },
  },
  responses: {
    200: {
      description: "The updated service",
      content: { "application/json": { schema: z.object({ data: serviceSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Service not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteServiceRoute = createRoute({
  method: "delete",
  path: "/{id}/services/{serviceId}",
  request: { params: serviceOnlyIdParamSchema },
  responses: {
    200: {
      description: "Service deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Service not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const serviceRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listServicesRoute, async (c) =>
    c.json(
      { data: await suppliersService.listServices(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(createServiceRoute, async (c) => {
    const row = await suppliersService.createService(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Supplier not found" }, 404)
  })
  .openapi(updateServiceRoute, async (c) => {
    const params = c.req.valid("param")
    const row = await suppliersService.updateService(
      c.get("db"),
      params.id,
      params.serviceId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Service not found" }, 404)
  })
  .openapi(deleteServiceRoute, async (c) => {
    const params = c.req.valid("param")
    const row = await suppliersService.deleteService(c.get("db"), params.id, params.serviceId)
    return row ? c.json({ success: true }, 200) : c.json({ error: "Service not found" }, 404)
  })

// ==========================================================================
// Rates
// ==========================================================================

const listRatesRoute = createRoute({
  method: "get",
  path: "/{id}/services/{serviceId}/rates",
  request: { params: serviceOnlyIdParamSchema },
  responses: {
    200: {
      description: "Rates for a service",
      content: { "application/json": { schema: z.object({ data: z.array(rateSchema) }) } },
    },
  },
})

const createRateRoute = createRoute({
  method: "post",
  path: "/{id}/services/{serviceId}/rates",
  request: {
    params: serviceOnlyIdParamSchema,
    body: { required: true, content: { "application/json": { schema: insertRateSchema } } },
  },
  responses: {
    201: {
      description: "The created rate",
      content: { "application/json": { schema: z.object({ data: rateSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Service not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateRateRoute = createRoute({
  method: "patch",
  path: "/{id}/services/{serviceId}/rates/{rateId}",
  request: {
    params: rateIdParamSchema,
    body: { required: true, content: { "application/json": { schema: updateRateSchema } } },
  },
  responses: {
    200: {
      description: "The updated rate",
      content: { "application/json": { schema: z.object({ data: rateSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Rate not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteRateRoute = createRoute({
  method: "delete",
  path: "/{id}/services/{serviceId}/rates/{rateId}",
  request: { params: rateIdParamSchema },
  responses: {
    200: {
      description: "Rate deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Rate not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const rateRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listRatesRoute, async (c) => {
    const params = c.req.valid("param")
    return c.json(
      { data: await suppliersService.listRates(c.get("db"), params.id, params.serviceId) },
      200,
    )
  })
  .openapi(createRateRoute, async (c) => {
    const params = c.req.valid("param")
    const row = await suppliersService.createRate(
      c.get("db"),
      params.id,
      params.serviceId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Service not found" }, 404)
  })
  .openapi(updateRateRoute, async (c) => {
    const params = c.req.valid("param")
    const row = await suppliersService.updateRate(
      c.get("db"),
      params.id,
      params.serviceId,
      params.rateId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Rate not found" }, 404)
  })
  .openapi(deleteRateRoute, async (c) => {
    const params = c.req.valid("param")
    const row = await suppliersService.deleteRate(
      c.get("db"),
      params.id,
      params.serviceId,
      params.rateId,
    )
    return row ? c.json({ success: true }, 200) : c.json({ error: "Rate not found" }, 404)
  })

// ==========================================================================
// Notes
// ==========================================================================

const listNotesRoute = createRoute({
  method: "get",
  path: "/{id}/notes",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Notes for a supplier",
      content: { "application/json": { schema: z.object({ data: z.array(noteSchema) }) } },
    },
  },
})

const createNoteRoute = createRoute({
  method: "post",
  path: "/{id}/notes",
  request: {
    params: idParamSchema,
    body: { required: true, content: { "application/json": { schema: insertSupplierNoteSchema } } },
  },
  responses: {
    201: {
      description: "The created note",
      content: { "application/json": { schema: z.object({ data: noteSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const noteRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listNotesRoute, async (c) =>
    c.json({ data: await suppliersService.listNotes(c.get("db"), c.req.valid("param").id) }, 200),
  )
  .openapi(createNoteRoute, async (c) => {
    const userId = requireUserId(c)
    const row = await suppliersService.createNote(
      c.get("db"),
      c.req.valid("param").id,
      userId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Supplier not found" }, 404)
  })

// ==========================================================================
// Availability
// ==========================================================================

const listAvailabilityRoute = createRoute({
  method: "get",
  path: "/{id}/availability",
  request: { params: idParamSchema, query: availabilityQuerySchema },
  responses: {
    200: {
      description: "Availability entries for a supplier",
      content: { "application/json": { schema: z.object({ data: z.array(availabilitySchema) }) } },
    },
  },
})

const createAvailabilityRoute = createRoute({
  method: "post",
  path: "/{id}/availability",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      description:
        "A single availability entry or an array of entries (bulk upsert). Both " +
        "shapes are accepted via a union; a single object is normalized to a " +
        "one-element batch server-side.",
      content: {
        "application/json": {
          schema: z.union([z.array(insertAvailabilitySchema), insertAvailabilitySchema]),
        },
      },
    },
  },
  responses: {
    201: {
      description: "The upserted availability entries",
      content: { "application/json": { schema: z.object({ data: z.array(availabilitySchema) }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const availabilityRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listAvailabilityRoute, async (c) =>
    c.json(
      {
        data: await suppliersService.listAvailability(
          c.get("db"),
          c.req.valid("param").id,
          c.req.valid("query"),
        ),
      },
      200,
    ),
  )
  .openapi(createAvailabilityRoute, async (c) => {
    const body = c.req.valid("json")
    const entries = Array.isArray(body) ? body : [body]
    const row = await suppliersService.createAvailability(
      c.get("db"),
      c.req.valid("param").id,
      entries,
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Supplier not found" }, 404)
  })

// ==========================================================================
// Contracts
// ==========================================================================

const listContractsRoute = createRoute({
  method: "get",
  path: "/{id}/contracts",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Contracts for a supplier",
      content: { "application/json": { schema: z.object({ data: z.array(contractSchema) }) } },
    },
  },
})

const createContractRoute = createRoute({
  method: "post",
  path: "/{id}/contracts",
  request: {
    params: idParamSchema,
    body: { required: true, content: { "application/json": { schema: insertContractSchema } } },
  },
  responses: {
    201: {
      description: "The created contract",
      content: { "application/json": { schema: z.object({ data: contractSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Supplier not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateContractRoute = createRoute({
  method: "patch",
  path: "/{id}/contracts/{contractId}",
  request: {
    params: contractIdParamSchema,
    body: { required: true, content: { "application/json": { schema: updateContractSchema } } },
  },
  responses: {
    200: {
      description: "The updated contract",
      content: { "application/json": { schema: z.object({ data: contractSchema }) } },
    },
    400: {
      description: "Invalid request body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Contract not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteContractRoute = createRoute({
  method: "delete",
  path: "/{id}/contracts/{contractId}",
  request: { params: contractIdParamSchema },
  responses: {
    200: {
      description: "Contract deleted",
      content: { "application/json": { schema: deleteResponseSchema } },
    },
    404: {
      description: "Contract not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const contractRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listContractsRoute, async (c) =>
    c.json(
      { data: await suppliersService.listContracts(c.get("db"), c.req.valid("param").id) },
      200,
    ),
  )
  .openapi(createContractRoute, async (c) => {
    const row = await suppliersService.createContract(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Supplier not found" }, 404)
  })
  .openapi(updateContractRoute, async (c) => {
    const params = c.req.valid("param")
    const row = await suppliersService.updateContract(
      c.get("db"),
      params.id,
      params.contractId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Contract not found" }, 404)
  })
  .openapi(deleteContractRoute, async (c) => {
    const params = c.req.valid("param")
    const row = await suppliersService.deleteContract(c.get("db"), params.id, params.contractId)
    return row ? c.json({ success: true }, 200) : c.json({ error: "Contract not found" }, 404)
  })

// ==========================================================================
// Composition — per-resource sub-chains mounted onto one bundle. Static and
// nested-resource segments (contact-points/contacts/addresses) are registered
// before the dynamic `/{id}` family so the router matches them first.
// ==========================================================================

export const suppliersAdminRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .route("/", contactPointRoutes)
  .route("/", contactRoutes)
  .route("/", addressRoutes)
  .route("/", serviceRoutes)
  .route("/", rateRoutes)
  .route("/", noteRoutes)
  .route("/", availabilityRoutes)
  .route("/", contractRoutes)
  .route("/", supplierRoutes)

export type SupplierRoutes = typeof suppliersAdminRoutes
