/**
 * Distribution admin routes — channels (+ identity contact points / named
 * contacts), channel contracts, commission rules, product mappings, booking
 * links, and webhook events, plus the inventory and settlement sub-chains
 * mounted from `routes/inventory.ts` and `routes/settlements.ts`.
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 —
 * distribution sub-batch) via a NON-BREAKING dual-mount: the same
 * `OpenAPIHono` instance is exported as `distributionRoutes` and mounted by the
 * framework on BOTH the legacy `/v1/distribution/*` surface (the
 * `distribution-react` dashboard still calls those paths) AND the documented
 * staff surface at `/v1/admin/distribution/*` (see `index.ts`). Request schemas
 * reuse the exported `validation.ts` insert/update/list-query schemas the
 * handlers already parsed; response row schemas live in
 * `routes/openapi-schemas.ts` (authored from the Drizzle `$inferSelect` shapes;
 * §17 timestamps/dates → strings). Business logic, identity sync, and the wire
 * envelopes (`{ data, total, limit, offset }` lists, `{ data }` singles,
 * `{ success: true }` deletes) are unchanged; handlers read `c.req.valid(...)`.
 *
 * Each resource family is its own small `OpenAPIHono` sub-chain composed onto
 * the parent via `.route("/")` so the `.openapi()` operations propagate up while
 * keeping type-inference cost bounded (one flat chain has O(n²) inference cost).
 *
 * agent-quality: file-size exception — this is the aggregated distribution
 * OpenAPI admin mount; the per-resource sub-chains above already split the
 * logic, and fragmenting the single mounted `OpenAPIHono` instance across
 * files would hurt, not help, review. See voyant#2114.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook, stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import {
  insertContactPointForEntitySchema,
  insertNamedContactForEntitySchema,
  updateContactPointSchema as updateIdentityContactPointSchema,
  updateNamedContactSchema as updateIdentityNamedContactSchema,
} from "@voyant-travel/identity/validation"
import { listResponseSchema } from "@voyant-travel/types"

import {
  batchIdsSchema,
  batchUpdateChannelBookingLinkSchema,
  batchUpdateChannelCommissionRuleSchema,
  batchUpdateChannelContractSchema,
  batchUpdateChannelProductMappingSchema,
  batchUpdateChannelSchema,
  batchUpdateChannelWebhookEventSchema,
  handleBatchDelete,
  handleBatchUpdate,
} from "./routes/batch.js"
import type { DistributionRouteEnv } from "./routes/env.js"
import { inventoryRoutes } from "./routes/inventory.js"
import {
  batchDeleteResponseSchema,
  batchUpdateResponseSchema,
  channelBookingLinkSchema,
  channelCommissionRuleSchema,
  channelContactPointSchema,
  channelContractSchema,
  channelNamedContactSchema,
  channelProductMappingSchema,
  channelProductPublicationSchema,
  channelPublicationReindexIntentSchema,
  channelSchema,
  channelSupplierPublicationSchema,
  channelWebhookEventSchema,
  effectivePublicationSchema,
  errorResponseSchema,
  idParamSchema,
  successResponseSchema,
  supplierPublicationMutationResponseSchema,
  supplierPublicationPreviewResponseSchema,
} from "./routes/openapi-schemas.js"
import { settlementRoutes } from "./routes/settlements.js"
import { distributionService } from "./service.js"
import {
  channelBookingLinkListQuerySchema,
  channelCommissionRuleListQuerySchema,
  channelContractListQuerySchema,
  channelListQuerySchema,
  channelProductMappingListQuerySchema,
  channelProductPublicationListQuerySchema,
  channelSupplierPublicationListQuerySchema,
  channelWebhookEventListQuerySchema,
  effectivePublicationInputSchema,
  insertChannelBookingLinkSchema,
  insertChannelCommissionRuleSchema,
  insertChannelContractSchema,
  insertChannelProductMappingSchema,
  insertChannelProductPublicationSchema,
  insertChannelSchema,
  insertChannelSupplierPublicationSchema,
  insertChannelWebhookEventSchema,
  previewChannelSupplierPublicationSchema,
  updateChannelBookingLinkSchema,
  updateChannelCommissionRuleSchema,
  updateChannelContractSchema,
  updateChannelProductMappingSchema,
  updateChannelProductPublicationSchema,
  updateChannelSchema,
  updateChannelSupplierPublicationSchema,
  updateChannelWebhookEventSchema,
} from "./validation.js"

const jsonContent = <T extends z.ZodTypeAny>(schema: T) => ({
  content: { "application/json": { schema } },
})

const requiredJsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  body: { required: true, content: { "application/json": { schema } } },
})

// --- channels ---------------------------------------------------------------

const listChannelsRoute = createRoute({
  method: "get",
  path: "/channels",
  request: { query: channelListQuerySchema },
  responses: {
    200: { description: "Paginated channels", ...jsonContent(listResponseSchema(channelSchema)) },
  },
})

const createChannelRoute = createRoute({
  method: "post",
  path: "/channels",
  request: requiredJsonBody(insertChannelSchema),
  responses: {
    201: { description: "The created channel", ...jsonContent(z.object({ data: channelSchema })) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const batchUpdateChannelsRoute = createRoute({
  method: "post",
  path: "/channels/batch-update",
  request: requiredJsonBody(batchUpdateChannelSchema),
  responses: {
    200: {
      description: "Per-id batch-update results",
      ...jsonContent(batchUpdateResponseSchema(channelSchema)),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const batchDeleteChannelsRoute = createRoute({
  method: "post",
  path: "/channels/batch-delete",
  request: requiredJsonBody(batchIdsSchema),
  responses: {
    200: { description: "Per-id batch-delete results", ...jsonContent(batchDeleteResponseSchema) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getChannelRoute = createRoute({
  method: "get",
  path: "/channels/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "A channel by id", ...jsonContent(z.object({ data: channelSchema })) },
    404: { description: "Channel not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateChannelRoute = createRoute({
  method: "patch",
  path: "/channels/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateChannelSchema) },
  responses: {
    200: { description: "The updated channel", ...jsonContent(z.object({ data: channelSchema })) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Channel not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteChannelRoute = createRoute({
  method: "delete",
  path: "/channels/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Channel deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Channel not found", ...jsonContent(errorResponseSchema) },
  },
})

const channelRoutes = new OpenAPIHono<DistributionRouteEnv>({ defaultHook: openApiValidationHook })
  .openapi(listChannelsRoute, async (c) =>
    c.json(await distributionService.listChannels(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createChannelRoute, async (c) => {
    const row = await distributionService.createChannel(c.get("db"), c.req.valid("json"))
    if (row) await c.get("eventBus")?.emit("channel.created", { id: row.id })
    return c.json({ data: row! }, 201)
  })
  .openapi(batchUpdateChannelsRoute, async (c) => {
    const body = c.req.valid("json")
    const eventBus = c.get("eventBus")
    return c.json(
      await handleBatchUpdate({
        db: c.get("db"),
        ids: body.ids,
        patch: body.patch,
        update: async (db, id, patch) => {
          const row = await distributionService.updateChannel(db, id, patch)
          if (row) await eventBus?.emit("channel.updated", { id: row.id })
          return row
        },
      }),
      200,
    )
  })
  .openapi(batchDeleteChannelsRoute, async (c) => {
    const body = c.req.valid("json")
    const eventBus = c.get("eventBus")
    return c.json(
      await handleBatchDelete({
        db: c.get("db"),
        ids: body.ids,
        remove: async (db, id) => {
          const row = await distributionService.deleteChannel(db, id)
          if (row)
            await eventBus?.emit("channel.deleted", {
              id: row.id,
              affectedProductIds: row.affectedProductIds,
            })
          return row
        },
      }),
      200,
    )
  })
  .openapi(getChannelRoute, async (c) => {
    const row = await distributionService.getChannelById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Channel not found" }, 404)
  })
  .openapi(updateChannelRoute, async (c) => {
    const row = await distributionService.updateChannel(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    if (row) await c.get("eventBus")?.emit("channel.updated", { id: row.id })
    return row ? c.json({ data: row }, 200) : c.json({ error: "Channel not found" }, 404)
  })
  .openapi(deleteChannelRoute, async (c) => {
    const row = await distributionService.deleteChannel(c.get("db"), c.req.valid("param").id)
    if (row)
      await c.get("eventBus")?.emit("channel.deleted", {
        id: row.id,
        affectedProductIds: row.affectedProductIds,
      })
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Channel not found" }, 404)
  })

// --- channel contact points / named contacts --------------------------------

const channelIdParamSchema = z.object({ id: z.string() })
const contactPointIdParamSchema = z.object({ contactPointId: z.string() })
const contactIdParamSchema = z.object({ contactId: z.string() })

const listChannelContactPointsRoute = createRoute({
  method: "get",
  path: "/channels/{id}/contact-points",
  request: { params: channelIdParamSchema },
  responses: {
    200: {
      description: "Contact points for a channel",
      ...jsonContent(z.object({ data: z.array(channelContactPointSchema) })),
    },
    404: { description: "Channel not found", ...jsonContent(errorResponseSchema) },
  },
})

const createChannelContactPointRoute = createRoute({
  method: "post",
  path: "/channels/{id}/contact-points",
  request: { params: channelIdParamSchema, ...requiredJsonBody(insertContactPointForEntitySchema) },
  responses: {
    201: {
      description: "The created contact point",
      ...jsonContent(z.object({ data: channelContactPointSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Channel not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateChannelContactPointRoute = createRoute({
  method: "patch",
  path: "/channel-contact-points/{contactPointId}",
  request: {
    params: contactPointIdParamSchema,
    ...requiredJsonBody(updateIdentityContactPointSchema),
  },
  responses: {
    200: {
      description: "The updated contact point",
      ...jsonContent(z.object({ data: channelContactPointSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Channel contact point not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteChannelContactPointRoute = createRoute({
  method: "delete",
  path: "/channel-contact-points/{contactPointId}",
  request: { params: contactPointIdParamSchema },
  responses: {
    200: { description: "Contact point deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Channel contact point not found", ...jsonContent(errorResponseSchema) },
  },
})

const listChannelContactsRoute = createRoute({
  method: "get",
  path: "/channels/{id}/contacts",
  request: { params: channelIdParamSchema },
  responses: {
    200: {
      description: "Named contacts for a channel",
      ...jsonContent(z.object({ data: z.array(channelNamedContactSchema) })),
    },
    404: { description: "Channel not found", ...jsonContent(errorResponseSchema) },
  },
})

const createChannelContactRoute = createRoute({
  method: "post",
  path: "/channels/{id}/contacts",
  request: { params: channelIdParamSchema, ...requiredJsonBody(insertNamedContactForEntitySchema) },
  responses: {
    201: {
      description: "The created named contact",
      ...jsonContent(z.object({ data: channelNamedContactSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Channel not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateChannelContactRoute = createRoute({
  method: "patch",
  path: "/channel-contacts/{contactId}",
  request: { params: contactIdParamSchema, ...requiredJsonBody(updateIdentityNamedContactSchema) },
  responses: {
    200: {
      description: "The updated named contact",
      ...jsonContent(z.object({ data: channelNamedContactSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Channel contact not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteChannelContactRoute = createRoute({
  method: "delete",
  path: "/channel-contacts/{contactId}",
  request: { params: contactIdParamSchema },
  responses: {
    200: { description: "Named contact deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Channel contact not found", ...jsonContent(errorResponseSchema) },
  },
})

const channelContactRoutes = new OpenAPIHono<DistributionRouteEnv>({
  defaultHook: openApiValidationHook,
})
  .openapi(listChannelContactPointsRoute, async (c) => {
    const rows = await distributionService.listChannelContactPoints(
      c.get("db"),
      c.req.valid("param").id,
    )
    return rows ? c.json({ data: rows }, 200) : c.json({ error: "Channel not found" }, 404)
  })
  .openapi(createChannelContactPointRoute, async (c) => {
    const row = await distributionService.createChannelContactPoint(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Channel not found" }, 404)
  })
  .openapi(updateChannelContactPointRoute, async (c) => {
    const row = await distributionService.updateChannelContactPoint(
      c.get("db"),
      c.req.valid("param").contactPointId,
      c.req.valid("json"),
    )
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Channel contact point not found" }, 404)
  })
  .openapi(deleteChannelContactPointRoute, async (c) => {
    const row = await distributionService.deleteChannelContactPoint(
      c.get("db"),
      c.req.valid("param").contactPointId,
    )
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Channel contact point not found" }, 404)
  })
  .openapi(listChannelContactsRoute, async (c) => {
    const rows = await distributionService.listChannelContacts(c.get("db"), c.req.valid("param").id)
    return rows ? c.json({ data: rows }, 200) : c.json({ error: "Channel not found" }, 404)
  })
  .openapi(createChannelContactRoute, async (c) => {
    const row = await distributionService.createChannelContact(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 201) : c.json({ error: "Channel not found" }, 404)
  })
  .openapi(updateChannelContactRoute, async (c) => {
    const row = await distributionService.updateChannelContact(
      c.get("db"),
      c.req.valid("param").contactId,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Channel contact not found" }, 404)
  })
  .openapi(deleteChannelContactRoute, async (c) => {
    const row = await distributionService.deleteChannelContact(
      c.get("db"),
      c.req.valid("param").contactId,
    )
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Channel contact not found" }, 404)
  })

// --- contracts --------------------------------------------------------------

const listContractsRoute = createRoute({
  method: "get",
  path: "/contracts",
  request: { query: channelContractListQuerySchema },
  responses: {
    200: {
      description: "Paginated channel contracts",
      ...jsonContent(listResponseSchema(channelContractSchema)),
    },
  },
})

const createContractRoute = createRoute({
  method: "post",
  path: "/contracts",
  request: requiredJsonBody(insertChannelContractSchema),
  responses: {
    201: {
      description: "The created contract",
      ...jsonContent(z.object({ data: channelContractSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const batchUpdateContractsRoute = createRoute({
  method: "post",
  path: "/contracts/batch-update",
  request: requiredJsonBody(batchUpdateChannelContractSchema),
  responses: {
    200: {
      description: "Per-id batch-update results",
      ...jsonContent(batchUpdateResponseSchema(channelContractSchema)),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const batchDeleteContractsRoute = createRoute({
  method: "post",
  path: "/contracts/batch-delete",
  request: requiredJsonBody(batchIdsSchema),
  responses: {
    200: { description: "Per-id batch-delete results", ...jsonContent(batchDeleteResponseSchema) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getContractRoute = createRoute({
  method: "get",
  path: "/contracts/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A contract by id",
      ...jsonContent(z.object({ data: channelContractSchema })),
    },
    404: { description: "Channel contract not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateContractRoute = createRoute({
  method: "patch",
  path: "/contracts/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateChannelContractSchema) },
  responses: {
    200: {
      description: "The updated contract",
      ...jsonContent(z.object({ data: channelContractSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Channel contract not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteContractRoute = createRoute({
  method: "delete",
  path: "/contracts/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Contract deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Channel contract not found", ...jsonContent(errorResponseSchema) },
  },
})

const contractRoutes = new OpenAPIHono<DistributionRouteEnv>({ defaultHook: openApiValidationHook })
  .openapi(listContractsRoute, async (c) =>
    c.json(await distributionService.listContracts(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createContractRoute, async (c) => {
    const row = await distributionService.createContract(c.get("db"), c.req.valid("json"))
    return c.json({ data: row! }, 201)
  })
  .openapi(batchUpdateContractsRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchUpdate({
        db: c.get("db"),
        ids: body.ids,
        patch: body.patch,
        update: distributionService.updateContract,
      }),
      200,
    )
  })
  .openapi(batchDeleteContractsRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchDelete({
        db: c.get("db"),
        ids: body.ids,
        remove: distributionService.deleteContract,
      }),
      200,
    )
  })
  .openapi(getContractRoute, async (c) => {
    const row = await distributionService.getContractById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Channel contract not found" }, 404)
  })
  .openapi(updateContractRoute, async (c) => {
    const row = await distributionService.updateContract(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Channel contract not found" }, 404)
  })
  .openapi(deleteContractRoute, async (c) => {
    const row = await distributionService.deleteContract(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Channel contract not found" }, 404)
  })

// --- commission rules -------------------------------------------------------

const listCommissionRulesRoute = createRoute({
  method: "get",
  path: "/commission-rules",
  request: { query: channelCommissionRuleListQuerySchema },
  responses: {
    200: {
      description: "Paginated commission rules",
      ...jsonContent(listResponseSchema(channelCommissionRuleSchema)),
    },
  },
})

const createCommissionRuleRoute = createRoute({
  method: "post",
  path: "/commission-rules",
  request: requiredJsonBody(insertChannelCommissionRuleSchema),
  responses: {
    201: {
      description: "The created commission rule",
      ...jsonContent(z.object({ data: channelCommissionRuleSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const batchUpdateCommissionRulesRoute = createRoute({
  method: "post",
  path: "/commission-rules/batch-update",
  request: requiredJsonBody(batchUpdateChannelCommissionRuleSchema),
  responses: {
    200: {
      description: "Per-id batch-update results",
      ...jsonContent(batchUpdateResponseSchema(channelCommissionRuleSchema)),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const batchDeleteCommissionRulesRoute = createRoute({
  method: "post",
  path: "/commission-rules/batch-delete",
  request: requiredJsonBody(batchIdsSchema),
  responses: {
    200: { description: "Per-id batch-delete results", ...jsonContent(batchDeleteResponseSchema) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getCommissionRuleRoute = createRoute({
  method: "get",
  path: "/commission-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A commission rule by id",
      ...jsonContent(z.object({ data: channelCommissionRuleSchema })),
    },
    404: { description: "Channel commission rule not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateCommissionRuleRoute = createRoute({
  method: "patch",
  path: "/commission-rules/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateChannelCommissionRuleSchema) },
  responses: {
    200: {
      description: "The updated commission rule",
      ...jsonContent(z.object({ data: channelCommissionRuleSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Channel commission rule not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteCommissionRuleRoute = createRoute({
  method: "delete",
  path: "/commission-rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Commission rule deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Channel commission rule not found", ...jsonContent(errorResponseSchema) },
  },
})

const commissionRuleRoutes = new OpenAPIHono<DistributionRouteEnv>({
  defaultHook: openApiValidationHook,
})
  .openapi(listCommissionRulesRoute, async (c) =>
    c.json(await distributionService.listCommissionRules(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createCommissionRuleRoute, async (c) => {
    const row = await distributionService.createCommissionRule(c.get("db"), c.req.valid("json"))
    return c.json({ data: row! }, 201)
  })
  .openapi(batchUpdateCommissionRulesRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchUpdate({
        db: c.get("db"),
        ids: body.ids,
        patch: body.patch,
        update: distributionService.updateCommissionRule,
      }),
      200,
    )
  })
  .openapi(batchDeleteCommissionRulesRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchDelete({
        db: c.get("db"),
        ids: body.ids,
        remove: distributionService.deleteCommissionRule,
      }),
      200,
    )
  })
  .openapi(getCommissionRuleRoute, async (c) => {
    const row = await distributionService.getCommissionRuleById(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Channel commission rule not found" }, 404)
  })
  .openapi(updateCommissionRuleRoute, async (c) => {
    const row = await distributionService.updateCommissionRule(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Channel commission rule not found" }, 404)
  })
  .openapi(deleteCommissionRuleRoute, async (c) => {
    const row = await distributionService.deleteCommissionRule(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Channel commission rule not found" }, 404)
  })

// --- product mappings -------------------------------------------------------

const listProductMappingsRoute = createRoute({
  method: "get",
  path: "/product-mappings",
  request: { query: channelProductMappingListQuerySchema },
  responses: {
    200: {
      description: "Paginated product mappings",
      ...jsonContent(listResponseSchema(channelProductMappingSchema)),
    },
  },
})

const createProductMappingRoute = createRoute({
  method: "post",
  path: "/product-mappings",
  request: requiredJsonBody(insertChannelProductMappingSchema),
  responses: {
    201: {
      description: "The created product mapping",
      ...jsonContent(z.object({ data: channelProductMappingSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const batchUpdateProductMappingsRoute = createRoute({
  method: "post",
  path: "/product-mappings/batch-update",
  request: requiredJsonBody(batchUpdateChannelProductMappingSchema),
  responses: {
    200: {
      description: "Per-id batch-update results",
      ...jsonContent(batchUpdateResponseSchema(channelProductMappingSchema)),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const batchDeleteProductMappingsRoute = createRoute({
  method: "post",
  path: "/product-mappings/batch-delete",
  request: requiredJsonBody(batchIdsSchema),
  responses: {
    200: { description: "Per-id batch-delete results", ...jsonContent(batchDeleteResponseSchema) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getProductMappingRoute = createRoute({
  method: "get",
  path: "/product-mappings/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A product mapping by id",
      ...jsonContent(z.object({ data: channelProductMappingSchema })),
    },
    404: { description: "Channel product mapping not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateProductMappingRoute = createRoute({
  method: "patch",
  path: "/product-mappings/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateChannelProductMappingSchema) },
  responses: {
    200: {
      description: "The updated product mapping",
      ...jsonContent(z.object({ data: channelProductMappingSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Channel product mapping not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteProductMappingRoute = createRoute({
  method: "delete",
  path: "/product-mappings/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Product mapping deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Channel product mapping not found", ...jsonContent(errorResponseSchema) },
  },
})

const productMappingRoutes = new OpenAPIHono<DistributionRouteEnv>({
  defaultHook: openApiValidationHook,
})
  .openapi(listProductMappingsRoute, async (c) =>
    c.json(await distributionService.listProductMappings(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createProductMappingRoute, async (c) => {
    const row = await distributionService.createProductMapping(
      c.get("db"),
      c.req.valid("json"),
      c.get("eventBus"),
    )
    return c.json({ data: row! }, 201)
  })
  .openapi(batchUpdateProductMappingsRoute, async (c) => {
    const body = c.req.valid("json")
    const eventBus = c.get("eventBus")
    return c.json(
      await handleBatchUpdate({
        db: c.get("db"),
        ids: body.ids,
        patch: body.patch,
        // Bind the bus so each per-id write emits `product.publication.changed`.
        update: (db, id, patch) =>
          distributionService.updateProductMapping(db, id, patch, eventBus),
      }),
      200,
    )
  })
  .openapi(batchDeleteProductMappingsRoute, async (c) => {
    const body = c.req.valid("json")
    const eventBus = c.get("eventBus")
    return c.json(
      await handleBatchDelete({
        db: c.get("db"),
        ids: body.ids,
        remove: (db, id) => distributionService.deleteProductMapping(db, id, eventBus),
      }),
      200,
    )
  })
  .openapi(getProductMappingRoute, async (c) => {
    const row = await distributionService.getProductMappingById(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Channel product mapping not found" }, 404)
  })
  .openapi(updateProductMappingRoute, async (c) => {
    const row = await distributionService.updateProductMapping(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
      c.get("eventBus"),
    )
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Channel product mapping not found" }, 404)
  })
  .openapi(deleteProductMappingRoute, async (c) => {
    const row = await distributionService.deleteProductMapping(
      c.get("db"),
      c.req.valid("param").id,
      c.get("eventBus"),
    )
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Channel product mapping not found" }, 404)
  })

// --- publications -----------------------------------------------------------

const listProductPublicationsRoute = createRoute({
  method: "get",
  path: "/product-publications",
  request: { query: channelProductPublicationListQuerySchema },
  responses: {
    200: {
      description: "Paginated product publication rules",
      ...jsonContent(listResponseSchema(channelProductPublicationSchema)),
    },
  },
})

const upsertProductPublicationRoute = createRoute({
  method: "put",
  path: "/product-publications",
  request: requiredJsonBody(insertChannelProductPublicationSchema),
  responses: {
    200: {
      description: "The authored product publication rule",
      ...jsonContent(z.object({ data: channelProductPublicationSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getProductPublicationRoute = createRoute({
  method: "get",
  path: "/product-publications/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A product publication rule by id",
      ...jsonContent(z.object({ data: channelProductPublicationSchema })),
    },
    404: { description: "Product publication not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateProductPublicationRoute = createRoute({
  method: "patch",
  path: "/product-publications/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateChannelProductPublicationSchema) },
  responses: {
    200: {
      description: "The updated product publication rule",
      ...jsonContent(z.object({ data: channelProductPublicationSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Product publication not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteProductPublicationRoute = createRoute({
  method: "delete",
  path: "/product-publications/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Product publication deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Product publication not found", ...jsonContent(errorResponseSchema) },
  },
})

const listSupplierPublicationsRoute = createRoute({
  method: "get",
  path: "/supplier-publications",
  request: { query: channelSupplierPublicationListQuerySchema },
  responses: {
    200: {
      description: "Paginated supplier publication rules",
      ...jsonContent(listResponseSchema(channelSupplierPublicationSchema)),
    },
  },
})

const upsertSupplierPublicationRoute = createRoute({
  method: "put",
  path: "/supplier-publications",
  request: requiredJsonBody(insertChannelSupplierPublicationSchema),
  responses: {
    200: {
      description: "The authored supplier publication rule with affected count",
      ...jsonContent(supplierPublicationMutationResponseSchema),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const previewSupplierPublicationRoute = createRoute({
  method: "post",
  path: "/supplier-publications/preview",
  request: requiredJsonBody(previewChannelSupplierPublicationSchema),
  responses: {
    200: {
      description: "Dry-run supplier publication affected-product count",
      ...jsonContent(supplierPublicationPreviewResponseSchema),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getSupplierPublicationRoute = createRoute({
  method: "get",
  path: "/supplier-publications/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A supplier publication rule by id",
      ...jsonContent(z.object({ data: channelSupplierPublicationSchema })),
    },
    404: { description: "Supplier publication not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateSupplierPublicationRoute = createRoute({
  method: "patch",
  path: "/supplier-publications/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateChannelSupplierPublicationSchema) },
  responses: {
    200: {
      description: "The updated supplier publication rule with affected count",
      ...jsonContent(supplierPublicationMutationResponseSchema),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Supplier publication not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteSupplierPublicationRoute = createRoute({
  method: "delete",
  path: "/supplier-publications/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Supplier publication deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Supplier publication not found", ...jsonContent(errorResponseSchema) },
  },
})

const previewEffectivePublicationRoute = createRoute({
  method: "post",
  path: "/publications/effective",
  request: requiredJsonBody(effectivePublicationInputSchema),
  responses: {
    200: {
      description: "Effective publication decision for a channel and product",
      ...jsonContent(z.object({ data: effectivePublicationSchema })),
    },
  },
})

const listPublicationReindexIntentsRoute = createRoute({
  method: "get",
  path: "/publication-reindex-intents",
  responses: {
    200: {
      description: "Recent publication reindex intents",
      ...jsonContent(z.object({ data: z.array(channelPublicationReindexIntentSchema) })),
    },
  },
})

const publicationRoutes = new OpenAPIHono<DistributionRouteEnv>({
  defaultHook: openApiValidationHook,
})
  .openapi(listProductPublicationsRoute, async (c) =>
    c.json(
      await distributionService.listProductPublications(c.get("db"), c.req.valid("query")),
      200,
    ),
  )
  .openapi(upsertProductPublicationRoute, async (c) => {
    const row = await distributionService.upsertProductPublication(
      c.get("db"),
      c.req.valid("json"),
      {
        actorId: c.get("userId") ?? null,
        eventBus: c.get("eventBus"),
      },
    )
    return c.json({ data: row }, 200)
  })
  .openapi(getProductPublicationRoute, async (c) => {
    const row = await distributionService.getProductPublicationById(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Product publication not found" }, 404)
  })
  .openapi(updateProductPublicationRoute, async (c) => {
    const row = await distributionService.updateProductPublication(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
      { actorId: c.get("userId") ?? null, eventBus: c.get("eventBus") },
    )
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Product publication not found" }, 404)
  })
  .openapi(deleteProductPublicationRoute, async (c) => {
    const row = await distributionService.deleteProductPublication(
      c.get("db"),
      c.req.valid("param").id,
      { actorId: c.get("userId") ?? null, eventBus: c.get("eventBus") },
    )
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Product publication not found" }, 404)
  })
  .openapi(listSupplierPublicationsRoute, async (c) =>
    c.json(
      await distributionService.listSupplierPublications(c.get("db"), c.req.valid("query")),
      200,
    ),
  )
  .openapi(upsertSupplierPublicationRoute, async (c) => {
    const result = await distributionService.upsertSupplierPublication(
      c.get("db"),
      c.req.valid("json"),
      {
        actorId: c.get("userId") ?? null,
      },
    )
    return c.json(
      { data: result.publication, affectedProductCount: result.affectedProductCount },
      200,
    )
  })
  .openapi(previewSupplierPublicationRoute, async (c) => {
    const result = await distributionService.previewSupplierPublication(
      c.get("db"),
      c.req.valid("json"),
    )
    return c.json({ data: result.input, affectedProductCount: result.affectedProductCount }, 200)
  })
  .openapi(getSupplierPublicationRoute, async (c) => {
    const row = await distributionService.getSupplierPublicationById(
      c.get("db"),
      c.req.valid("param").id,
    )
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Supplier publication not found" }, 404)
  })
  .openapi(updateSupplierPublicationRoute, async (c) => {
    const result = await distributionService.updateSupplierPublication(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
      { actorId: c.get("userId") ?? null },
    )
    return result
      ? c.json({ data: result.publication, affectedProductCount: result.affectedProductCount }, 200)
      : c.json({ error: "Supplier publication not found" }, 404)
  })
  .openapi(deleteSupplierPublicationRoute, async (c) => {
    const row = await distributionService.deleteSupplierPublication(
      c.get("db"),
      c.req.valid("param").id,
      { actorId: c.get("userId") ?? null },
    )
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Supplier publication not found" }, 404)
  })
  .openapi(previewEffectivePublicationRoute, async (c) => {
    const result = await distributionService.getEffectivePublication(
      c.get("db"),
      c.req.valid("json"),
    )
    return c.json({ data: result }, 200)
  })
  .openapi(listPublicationReindexIntentsRoute, async (c) =>
    c.json({ data: await distributionService.listPublicationReindexIntents(c.get("db")) }, 200),
  )

// --- booking links ----------------------------------------------------------

const listBookingLinksRoute = createRoute({
  method: "get",
  path: "/booking-links",
  request: { query: channelBookingLinkListQuerySchema },
  responses: {
    200: {
      description: "Paginated booking links",
      ...jsonContent(listResponseSchema(channelBookingLinkSchema)),
    },
  },
})

const createBookingLinkRoute = createRoute({
  method: "post",
  path: "/booking-links",
  request: requiredJsonBody(insertChannelBookingLinkSchema),
  responses: {
    201: {
      description: "The created booking link",
      ...jsonContent(z.object({ data: channelBookingLinkSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    409: { description: "duplicate_channel_booking_link", ...jsonContent(errorResponseSchema) },
  },
})

const batchUpdateBookingLinksRoute = createRoute({
  method: "post",
  path: "/booking-links/batch-update",
  request: requiredJsonBody(batchUpdateChannelBookingLinkSchema),
  responses: {
    200: {
      description: "Per-id batch-update results",
      ...jsonContent(batchUpdateResponseSchema(channelBookingLinkSchema)),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const batchDeleteBookingLinksRoute = createRoute({
  method: "post",
  path: "/booking-links/batch-delete",
  request: requiredJsonBody(batchIdsSchema),
  responses: {
    200: { description: "Per-id batch-delete results", ...jsonContent(batchDeleteResponseSchema) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getBookingLinkRoute = createRoute({
  method: "get",
  path: "/booking-links/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A booking link by id",
      ...jsonContent(z.object({ data: channelBookingLinkSchema })),
    },
    404: { description: "Channel booking link not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateBookingLinkRoute = createRoute({
  method: "patch",
  path: "/booking-links/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateChannelBookingLinkSchema) },
  responses: {
    200: {
      description: "The updated booking link",
      ...jsonContent(z.object({ data: channelBookingLinkSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Channel booking link not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteBookingLinkRoute = createRoute({
  method: "delete",
  path: "/booking-links/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Booking link deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Channel booking link not found", ...jsonContent(errorResponseSchema) },
  },
})

const bookingLinkRoutes = new OpenAPIHono<DistributionRouteEnv>({
  defaultHook: openApiValidationHook,
})
  .openapi(listBookingLinksRoute, async (c) =>
    c.json(await distributionService.listBookingLinks(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createBookingLinkRoute, async (c) => {
    const row = await distributionService.createBookingLink(c.get("db"), c.req.valid("json"))
    return c.json({ data: row! }, 201)
  })
  .openapi(batchUpdateBookingLinksRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchUpdate({
        db: c.get("db"),
        ids: body.ids,
        patch: body.patch,
        update: distributionService.updateBookingLink,
      }),
      200,
    )
  })
  .openapi(batchDeleteBookingLinksRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchDelete({
        db: c.get("db"),
        ids: body.ids,
        remove: distributionService.deleteBookingLink,
      }),
      200,
    )
  })
  .openapi(getBookingLinkRoute, async (c) => {
    const row = await distributionService.getBookingLinkById(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Channel booking link not found" }, 404)
  })
  .openapi(updateBookingLinkRoute, async (c) => {
    const row = await distributionService.updateBookingLink(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Channel booking link not found" }, 404)
  })
  .openapi(deleteBookingLinkRoute, async (c) => {
    const row = await distributionService.deleteBookingLink(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Channel booking link not found" }, 404)
  })

// --- webhook events ---------------------------------------------------------

const listWebhookEventsRoute = createRoute({
  method: "get",
  path: "/webhook-events",
  request: { query: channelWebhookEventListQuerySchema },
  responses: {
    200: {
      description: "Paginated webhook events",
      ...jsonContent(listResponseSchema(channelWebhookEventSchema)),
    },
  },
})

const createWebhookEventRoute = createRoute({
  method: "post",
  path: "/webhook-events",
  request: requiredJsonBody(insertChannelWebhookEventSchema),
  responses: {
    201: {
      description: "The created webhook event",
      ...jsonContent(z.object({ data: channelWebhookEventSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const batchUpdateWebhookEventsRoute = createRoute({
  method: "post",
  path: "/webhook-events/batch-update",
  request: requiredJsonBody(batchUpdateChannelWebhookEventSchema),
  responses: {
    200: {
      description: "Per-id batch-update results",
      ...jsonContent(batchUpdateResponseSchema(channelWebhookEventSchema)),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const batchDeleteWebhookEventsRoute = createRoute({
  method: "post",
  path: "/webhook-events/batch-delete",
  request: requiredJsonBody(batchIdsSchema),
  responses: {
    200: { description: "Per-id batch-delete results", ...jsonContent(batchDeleteResponseSchema) },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
  },
})

const getWebhookEventRoute = createRoute({
  method: "get",
  path: "/webhook-events/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A webhook event by id",
      ...jsonContent(z.object({ data: channelWebhookEventSchema })),
    },
    404: { description: "Channel webhook event not found", ...jsonContent(errorResponseSchema) },
  },
})

const updateWebhookEventRoute = createRoute({
  method: "patch",
  path: "/webhook-events/{id}",
  request: { params: idParamSchema, ...requiredJsonBody(updateChannelWebhookEventSchema) },
  responses: {
    200: {
      description: "The updated webhook event",
      ...jsonContent(z.object({ data: channelWebhookEventSchema })),
    },
    400: { description: "invalid_request", ...jsonContent(errorResponseSchema) },
    404: { description: "Channel webhook event not found", ...jsonContent(errorResponseSchema) },
  },
})

const deleteWebhookEventRoute = createRoute({
  method: "delete",
  path: "/webhook-events/{id}",
  request: { params: idParamSchema },
  responses: {
    200: { description: "Webhook event deleted", ...jsonContent(successResponseSchema) },
    404: { description: "Channel webhook event not found", ...jsonContent(errorResponseSchema) },
  },
})

const webhookEventRoutes = new OpenAPIHono<DistributionRouteEnv>({
  defaultHook: openApiValidationHook,
})
  .openapi(listWebhookEventsRoute, async (c) =>
    c.json(await distributionService.listWebhookEvents(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createWebhookEventRoute, async (c) => {
    const row = await distributionService.createWebhookEvent(c.get("db"), c.req.valid("json"))
    return c.json({ data: row! }, 201)
  })
  .openapi(batchUpdateWebhookEventsRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchUpdate({
        db: c.get("db"),
        ids: body.ids,
        patch: body.patch,
        update: distributionService.updateWebhookEvent,
      }),
      200,
    )
  })
  .openapi(batchDeleteWebhookEventsRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchDelete({
        db: c.get("db"),
        ids: body.ids,
        remove: distributionService.deleteWebhookEvent,
      }),
      200,
    )
  })
  .openapi(getWebhookEventRoute, async (c) => {
    const row = await distributionService.getWebhookEventById(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Channel webhook event not found" }, 404)
  })
  .openapi(updateWebhookEventRoute, async (c) => {
    const row = await distributionService.updateWebhookEvent(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Channel webhook event not found" }, 404)
  })
  .openapi(deleteWebhookEventRoute, async (c) => {
    const row = await distributionService.deleteWebhookEvent(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Channel webhook event not found" }, 404)
  })

export const distributionRoutes = stampOpenApiRegistryApiId(
  new OpenAPIHono<DistributionRouteEnv>({ defaultHook: openApiValidationHook })
    .route("/", channelRoutes)
    .route("/", channelContactRoutes)
    .route("/", contractRoutes)
    .route("/", commissionRuleRoutes)
    .route("/", productMappingRoutes)
    .route("/", publicationRoutes)
    .route("/", bookingLinkRoutes)
    .route("/", webhookEventRoutes)
    .route("/", inventoryRoutes)
    .route("/", settlementRoutes),
  "@voyant-travel/distribution#api",
)

export type DistributionRoutes = typeof distributionRoutes
