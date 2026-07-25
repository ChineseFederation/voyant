/**
 * Catalog booking-engine routes (quote / drafts / holds). The factory is
 * mounted on BOTH adminRoutes AND publicRoutes, so each leg appears under
 * `/v1/admin/catalog/*` and `/v1/public/catalog/*`.
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 /
 * voyant#2208). Request schemas reuse `routes-contracts`; quote/book responses
 * reuse the `@voyant-travel/catalog-contracts` V1 wire schemas the handlers
 * already serialize through; the draft row schema is authored from
 * `SelectBookingDraft` (§17: timestamp columns serialize to ISO strings).
 *
 * agent-quality: file-size exception — intentional: the seven `createRoute`
 * objects (each with its real status set) co-locate with the handler helpers
 * per the established admin route pattern (mirrors `commerce/pricing/
 * routes-core.ts`). Splitting the route table from its handlers would fragment
 * one mounted instance without aiding review. See voyant#2114 / voyant#2208.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { handleApiError, openApiValidationHook, RequestValidationError } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import type { Context } from "hono"

import type { SourceAdapterContext } from "../adapter/contract.js"
import { readSourcedEntry } from "../services/sourced-entry-service.js"
import type { PricingBasis } from "../snapshot/schema.js"

import {
  type PricingBreakdownV1,
  type QuoteBatchResponseV1,
  type QuoteResponseV1,
  quoteBatchResponseV1,
  quoteResponseV1,
} from "./contracts.js"
import {
  createBookingDraft,
  DEFAULT_DRAFT_TTL_MS,
  deleteBookingDraft,
  getBookingDraft,
  updateBookingDraft,
} from "./drafts-service.js"
import {
  BookingEngineError,
  NO_ADAPTER_REGISTERED,
  NO_HANDLER_REGISTERED,
  ORDER_ALREADY_CANCELLED,
  ORDER_NOT_FOUND,
  QUOTE_EXPIRED,
  QUOTE_NOT_FOUND,
} from "./errors.js"
import { OWNED_SOURCE_KIND } from "./owned-handler.js"
import { type QuoteEntityResult, quoteEntitiesBatch, quoteEntity } from "./quote.js"
import {
  batchQuoteBodySchema,
  type CatalogBookingAdapterContextInput,
  type CatalogBookingBatchQuoteBody,
  type CatalogBookingBatchQuoteSelection,
  type CatalogBookingBatchQuoteTransformInput,
  type CatalogBookingDraftBody,
  type CatalogBookingHoldPlaceBody,
  type CatalogBookingHoldReleaseBody,
  type CatalogBookingProvenance,
  type CatalogBookingQuoteBody,
  type CatalogBookingRoutesOptions,
  draftBodySchema,
  holdPlaceBodySchema,
  holdReleaseBodySchema,
  quoteBodySchema,
} from "./routes-contracts.js"

const DEFAULT_HOLD_TTL_MS = 30 * 60 * 1000

/**
 * Deployment `Variables` the engine reads off the request context — `db` and
 * `userId` are resolved by the parent app's middleware chain and read back
 * through the injected `resolveDb`/`resolveActorId` resolvers. Kept permissive
 * because the resolvers own the actual lookup.
 */
type Env = {
  Variables: {
    db?: AnyDrizzleDb
    userId?: string
  }
}

// ─────────────────────────────────────────────────────────────────
// OpenAPI route + response schemas (voyant#2114 / voyant#2208).
//
// Request schemas reuse `routes-contracts` (which mirror the
// `@voyant-travel/catalog-contracts` engine schemas); quote/book response
// schemas reuse the catalog-contracts V1 wire schemas the handlers already
// serialize through. The draft row schema is authored here from
// `SelectBookingDraft` — §17: `timestamp` columns serialize to ISO strings
// over the wire, never `Date`.
//
// Both factories mount on adminRoutes AND publicRoutes, so these ops appear
// under `/v1/admin/catalog/*` and `/v1/public/catalog/*` (dual-surface).
// ─────────────────────────────────────────────────────────────────

const errorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

const idParamSchema = z.object({ id: z.string() })

/** Wire shape of a `booking_drafts` row (§17: timestamps → ISO strings). */
const bookingDraftRowSchema = z.object({
  id: z.string(),
  entity_module: z.string(),
  entity_id: z.string(),
  source_kind: z.string(),
  source_connection_id: z.string().nullable(),
  source_ref: z.string().nullable(),
  draft_payload: z.record(z.string(), z.unknown()),
  current_step: z.string().nullable(),
  current_quote_id: z.string().nullable(),
  hold_expires_at: z.string().nullable(),
  consumed_booking_id: z.string().nullable(),
  consumed_at: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  expires_at: z.string(),
})

const holdPlaceResponseSchema = z.object({
  holdToken: z.string(),
  expiresAt: z.string(),
})

const quoteRoute = createRoute({
  method: "post",
  path: "/quote",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: quoteBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Quote for the entity at the requested scope",
      content: { "application/json": { schema: quoteResponseV1 } },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Quote/order referenced by the engine was not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Quote expired or conflicts with current availability",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    502: {
      description: "Upstream reservation failed",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    503: {
      description: "No adapter/handler registered for this vertical",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const batchQuoteRoute = createRoute({
  method: "post",
  path: "/quotes/batch",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: batchQuoteBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Batch quote results for the requested selections",
      content: { "application/json": { schema: quoteBatchResponseV1 } },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Quote/order referenced by the engine was not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Quote expired or conflicts with current availability",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    502: {
      description: "Upstream reservation failed",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    503: {
      description: "No adapter/handler registered for one or more selections",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const draftPutRoute = createRoute({
  method: "put",
  path: "/drafts/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: draftBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Existing draft updated",
      content: { "application/json": { schema: bookingDraftRowSchema } },
    },
    201: {
      description: "Draft created",
      content: { "application/json": { schema: bookingDraftRowSchema } },
    },
    400: {
      description:
        "invalid_request — body failed validation, or entityModule/entityId missing on create",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const draftGetRoute = createRoute({
  method: "get",
  path: "/drafts/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The draft by id",
      content: { "application/json": { schema: bookingDraftRowSchema } },
    },
    404: {
      description: "Draft not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const draftDeleteRoute = createRoute({
  method: "delete",
  path: "/drafts/{id}",
  responses: {
    204: { description: "Draft deleted (idempotent)" },
  },
  request: { params: idParamSchema },
})

const holdPlaceRoute = createRoute({
  method: "post",
  path: "/holds/place",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: holdPlaceBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Soft hold placed",
      content: { "application/json": { schema: holdPlaceResponseSchema } },
    },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Quote/order referenced by the hold was not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Hold conflicts with current availability",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    502: {
      description: "Upstream hold failed",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    503: {
      description: "No hold primitive registered for this vertical",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const holdReleaseRoute = createRoute({
  method: "post",
  path: "/holds/release",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: holdReleaseBodySchema } },
    },
  },
  responses: {
    204: { description: "Hold released (idempotent; no-op when none registered)" },
    400: {
      description: "invalid_request — body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Quote/order referenced by the hold was not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Hold conflicts with current availability",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    502: {
      description: "Upstream release failed",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export type {
  CatalogBookingAdapterContextInput,
  CatalogBookingBatchQuoteBody,
  CatalogBookingBatchQuoteSelection,
  CatalogBookingBatchQuoteTransformInput,
  CatalogBookingDraftBody,
  CatalogBookingHoldPlaceBody,
  CatalogBookingHoldReleaseBody,
  CatalogBookingHoldTtlInput,
  CatalogBookingProvenance,
  CatalogBookingProvenanceInput,
  CatalogBookingQuoteBody,
  CatalogBookingQuoteTransformInput,
  CatalogBookingRoutesOptions,
} from "./routes-contracts.js"

export function createCatalogBookingRoutes(options: CatalogBookingRoutesOptions): OpenAPIHono<Env> {
  // The handlers branch across many declared statuses and serialize through the
  // V1 contract schemas, returning a plain `Response`. `.openapi()` infers a
  // per-route typed-response union the bare `Response` doesn't structurally
  // satisfy; `asRouteResponse` bridges the two without weakening the handlers.
  // Runtime payloads honor the declared schemas (asserted by the contract tests).
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(quoteRoute, async (c) => asRouteResponse(handleQuote(c, options, c.req.valid("json"))))
    .openapi(batchQuoteRoute, async (c) =>
      asRouteResponse(handleBatchQuote(c, options, c.req.valid("json"))),
    )
    .openapi(draftPutRoute, async (c) =>
      asRouteResponse(handleDraftPut(c, options, c.req.valid("param").id, c.req.valid("json"))),
    )
    .openapi(draftGetRoute, async (c) =>
      asRouteResponse(handleDraftGet(c, options, c.req.valid("param").id)),
    )
    .openapi(draftDeleteRoute, async (c) =>
      asRouteResponse(handleDraftDelete(c, options, c.req.valid("param").id)),
    )
    .openapi(holdPlaceRoute, async (c) =>
      asRouteResponse(handleHoldPlace(c, options, c.req.valid("json"))),
    )
    .openapi(holdReleaseRoute, async (c) =>
      asRouteResponse(handleHoldRelease(c, options, c.req.valid("json"))),
    )
}

/**
 * Bridge a helper's plain `Promise<Response>` to the typed-response shape
 * `.openapi()` infers per route. The runtime value is already a valid `Response`
 * honoring the declared schemas; this only relaxes the compile-time union.
 */
// biome-ignore lint/suspicious/noExplicitAny: intentional — bridges bare Response to the inferred typed-response union (voyant#2114)
function asRouteResponse(response: Promise<Response>): Promise<any> {
  return response
}

export function createCatalogBookingApiModule(options: CatalogBookingRoutesOptions): ApiModule {
  return {
    module: { name: "catalog" },
    adminRoutes: createCatalogBookingRoutes(options),
    publicRoutes: createCatalogBookingRoutes(options),
  }
}

async function handleQuote(
  c: Context,
  options: CatalogBookingRoutesOptions,
  body: CatalogBookingQuoteBody,
): Promise<Response> {
  const db = options.resolveDb(c)
  const provenance = body.sourceKind
    ? {
        sourceKind: body.sourceKind,
        sourceProvider: body.sourceProvider,
        sourceConnectionId: body.sourceConnectionId,
        sourceRef: body.sourceRef,
      }
    : await resolveEntityProvenance(c, options, db, body.entityModule, body.entityId)
  const correlationId = resolveCorrelationId(c, options)
  const adapterContext = resolveAdapterContext(c, options, {
    db,
    operation: "quote",
    entityModule: body.entityModule,
    entityId: body.entityId,
    sourceKind: provenance.sourceKind,
    sourceConnectionId: provenance.sourceConnectionId,
    correlationId,
  })

  try {
    const result = await quoteEntity(
      db,
      {
        registry: options.resolveSourceRegistry(c),
        ownedHandlers: options.resolveOwnedHandlers?.(c),
        contentEnricher: options.contentEnricher,
        onEnricherError: options.onContentEnricherError,
        evaluatePromotions: options.resolveEvaluatePromotions?.({ c, db }),
      },
      {
        entityModule: body.entityModule,
        entityId: body.entityId,
        sourceKind: provenance.sourceKind,
        sourceProvider: provenance.sourceProvider,
        sourceConnectionId: provenance.sourceConnectionId,
        sourceRef: provenance.sourceRef,
        scope: {
          locale: body.scope?.locale ?? "en-GB",
          audience: body.scope?.audience ?? defaultAudienceForPath(c),
          market: body.scope?.market ?? "default",
          currency: body.scope?.currency,
        },
        parameters: engineParametersFromDraft(body.parameters, body.draft, {
          entityModule: body.entityModule,
          sourceKind: provenance.sourceKind,
          sourceProvider: provenance.sourceProvider,
        }),
        ttlMs: body.ttlMs,
        adapterContext,
      },
    )
    const transformed =
      (await options.transformQuoteResult?.({ c, db, request: body, provenance, result })) ?? result
    return c.json(serializeQuoteResult(transformed))
  } catch (err) {
    return bookingEngineErrorResponse(c, err)
  }
}

async function handleBatchQuote(
  c: Context,
  options: CatalogBookingRoutesOptions,
  body: CatalogBookingBatchQuoteBody,
): Promise<Response> {
  const db = options.resolveDb(c)
  const correlationId = resolveCorrelationId(c, options)

  try {
    const prepared = await Promise.all(
      body.selections.map(async (selection, index) => {
        const request = quoteRequestFromBatchSelection(c, body, selection)
        const provenance = request.sourceKind
          ? {
              sourceKind: request.sourceKind,
              sourceProvider: request.sourceProvider,
              sourceConnectionId: request.sourceConnectionId,
              sourceRef: request.sourceRef,
            }
          : await resolveEntityProvenance(c, options, db, request.entityModule, request.entityId)
        const adapterContext = resolveAdapterContext(c, options, {
          db,
          operation: "quote",
          entityModule: request.entityModule,
          entityId: request.entityId,
          sourceKind: provenance.sourceKind,
          sourceConnectionId: provenance.sourceConnectionId,
          correlationId,
        })
        const scope = {
          locale: request.scope?.locale ?? "en-GB",
          audience: request.scope?.audience ?? defaultAudienceForPath(c),
          market: request.scope?.market ?? "default",
          currency: request.scope?.currency,
        }
        return {
          selectionId: String(index),
          selection,
          request,
          provenance,
          engineRequest: {
            entityModule: request.entityModule,
            entityId: request.entityId,
            sourceKind: provenance.sourceKind,
            sourceProvider: provenance.sourceProvider,
            sourceConnectionId: provenance.sourceConnectionId,
            sourceRef: provenance.sourceRef,
            scope,
            parameters: engineParametersFromDraft(request.parameters, request.draft, {
              entityModule: request.entityModule,
              sourceKind: provenance.sourceKind,
              sourceProvider: provenance.sourceProvider,
            }),
            ttlMs: request.ttlMs,
            adapterContext,
            selectionId: String(index),
          },
        }
      }),
    )
    const quoted = await quoteEntitiesBatch(
      db,
      {
        registry: options.resolveSourceRegistry(c),
        ownedHandlers: options.resolveOwnedHandlers?.(c),
        contentEnricher: options.contentEnricher,
        onEnricherError: options.onContentEnricherError,
        evaluatePromotions: options.resolveEvaluatePromotions?.({ c, db }),
      },
      prepared.map((item) => item.engineRequest),
    )
    const bySelectionId = new Map(quoted.map((item) => [item.selectionId, item.result]))
    const resultItems = await Promise.all(
      prepared.map(async (item) => {
        const result = bySelectionId.get(item.selectionId)
        if (!result) throw new Error(`missing batch quote result ${item.selectionId}`)
        const transformed =
          (await options.transformQuoteResult?.({
            c,
            db,
            request: item.request,
            provenance: item.provenance,
            result,
          })) ?? result
        return {
          selection: item.selection,
          request: item.request,
          provenance: item.provenance,
          result: transformed,
        }
      }),
    )
    const transformed =
      (await options.transformBatchQuoteResults?.({
        c,
        db,
        request: body,
        results: resultItems,
      })) ?? resultItems
    return c.json(serializeBatchQuoteResult(transformed))
  } catch (err) {
    return bookingEngineErrorResponse(c, err)
  }
}

async function handleDraftPut(
  c: Context,
  options: CatalogBookingRoutesOptions,
  id: string,
  body: CatalogBookingDraftBody,
): Promise<Response> {
  const db = options.resolveDb(c)
  const existing = await getBookingDraft(db, id)
  if (existing) {
    const updated = await updateBookingDraft(db, id, {
      draftPayload: body.draftPayload,
      currentStep: body.currentStep,
      currentQuoteId: body.currentQuoteId,
      refreshTtlMs: body.ttlMs ?? DEFAULT_DRAFT_TTL_MS,
    })
    return c.json(updated)
  }

  if (!body.entityModule || !body.entityId) {
    throw new RequestValidationError("entityModule and entityId are required when creating a draft")
  }

  const provenance = body.sourceKind
    ? {
        sourceKind: body.sourceKind,
        sourceConnectionId: body.sourceConnectionId,
        sourceRef: body.sourceRef,
      }
    : await resolveEntityProvenance(c, options, db, body.entityModule, body.entityId)

  const created = await createBookingDraft(db, {
    id,
    entityModule: body.entityModule,
    entityId: body.entityId,
    sourceKind: provenance.sourceKind,
    sourceConnectionId: provenance.sourceConnectionId,
    sourceRef: provenance.sourceRef,
    draftPayload: body.draftPayload,
    currentStep: body.currentStep,
    currentQuoteId: body.currentQuoteId,
    createdBy: resolveActorId(c, options),
    ttlMs: body.ttlMs,
  })
  return c.json(created, 201)
}

async function handleDraftGet(
  c: Context,
  options: CatalogBookingRoutesOptions,
  id: string,
): Promise<Response> {
  const row = await getBookingDraft(options.resolveDb(c), id)
  if (!row) return c.json({ error: "draft not found" }, 404)
  return c.json(row)
}

async function handleDraftDelete(
  c: Context,
  options: CatalogBookingRoutesOptions,
  id: string,
): Promise<Response> {
  await deleteBookingDraft(options.resolveDb(c), id)
  return c.body(null, 204)
}

async function handleHoldPlace(
  c: Context,
  options: CatalogBookingRoutesOptions,
  body: CatalogBookingHoldPlaceBody,
): Promise<Response> {
  const ownedHandlers = options.resolveOwnedHandlers?.(c)
  const handler = ownedHandlers?.resolve(body.entityModule)
  if (!handler?.placeHold) {
    return c.json({ error: "no hold primitive registered for this vertical" }, 503)
  }

  const db = options.resolveDb(c)
  const correlationId = resolveCorrelationId(c, options)
  const ttlMs =
    body.ttlMs ??
    (await (options.resolveHoldTtlMs?.({
      c,
      db,
      entityModule: body.entityModule,
      entityId: body.entityId,
    }) ?? DEFAULT_HOLD_TTL_MS))
  const adapterContext = resolveAdapterContext(c, options, {
    db,
    operation: "hold",
    entityModule: body.entityModule,
    entityId: body.entityId,
    sourceKind: "engine",
    correlationId,
  })

  try {
    const result = await handler.placeHold(
      { db, adapterContext },
      {
        entityModule: body.entityModule,
        entityId: body.entityId,
        draftId: body.draftId,
        ttlMs,
        parameters: body.parameters,
      },
    )
    return c.json({ holdToken: result.holdToken, expiresAt: result.expiresAt.toISOString() })
  } catch (err) {
    return bookingEngineErrorResponse(c, err)
  }
}

async function handleHoldRelease(
  c: Context,
  options: CatalogBookingRoutesOptions,
  body: CatalogBookingHoldReleaseBody,
): Promise<Response> {
  const ownedHandlers = options.resolveOwnedHandlers?.(c)
  const handler = ownedHandlers?.resolve(body.entityModule)
  if (!handler?.releaseHold) {
    return c.body(null, 204)
  }

  const db = options.resolveDb(c)
  const correlationId = resolveCorrelationId(c, options)
  const adapterContext = resolveAdapterContext(c, options, {
    db,
    operation: "hold",
    entityModule: body.entityModule,
    sourceKind: "engine",
    correlationId,
  })

  try {
    await handler.releaseHold({ db, adapterContext }, body.holdToken)
    return c.body(null, 204)
  } catch (err) {
    return bookingEngineErrorResponse(c, err)
  }
}

async function resolveEntityProvenance(
  c: Context,
  options: CatalogBookingRoutesOptions,
  db: AnyDrizzleDb,
  entityModule: string,
  entityId: string,
): Promise<CatalogBookingProvenance> {
  if (options.resolveEntityProvenance) {
    return options.resolveEntityProvenance({ c, db, entityModule, entityId })
  }

  const row = await readSourcedEntry(db, entityModule, entityId)
  if (!row) return { sourceKind: OWNED_SOURCE_KIND }
  return {
    sourceKind: row.source_kind,
    sourceProvider: row.source_provider ?? undefined,
    sourceConnectionId: row.source_connection_id ?? undefined,
    sourceRef: row.source_ref ?? undefined,
  }
}

function resolveActorId(c: Context, options: CatalogBookingRoutesOptions): string | null {
  if (options.resolveActorId) return options.resolveActorId(c)
  const userId = (c.var as { userId?: string }).userId
  return typeof userId === "string" ? userId : null
}

function resolveCorrelationId(c: Context, options: CatalogBookingRoutesOptions): string {
  return options.resolveCorrelationId?.(c) ?? c.req.header("x-request-id") ?? cryptoRandom()
}

function resolveAdapterContext(
  c: Context,
  options: CatalogBookingRoutesOptions,
  input: Omit<CatalogBookingAdapterContextInput, "c">,
): SourceAdapterContext {
  return (
    options.resolveAdapterContext?.({ c, ...input }) ?? {
      connection_id: input.sourceConnectionId ?? input.sourceKind,
      correlation_id: input.correlationId,
    }
  )
}

function defaultAudienceForPath(c: Context): "staff" | "customer" {
  return c.req.path.startsWith("/v1/public/") ? "customer" : "staff"
}

function quoteRequestFromBatchSelection(
  c: Context,
  body: CatalogBookingBatchQuoteBody,
  selection: CatalogBookingBatchQuoteSelection,
): CatalogBookingQuoteBody {
  const draft = mergeBatchDraft(body.draft, selection.draft, body.criteria, selection)
  return {
    entityModule: selection.entityModule,
    entityId: selection.entityId,
    sourceKind: selection.sourceKind,
    sourceProvider: selection.sourceProvider,
    sourceConnectionId: selection.sourceConnectionId,
    sourceRef: selection.sourceRef,
    scope: {
      locale: body.scope?.locale ?? "en-GB",
      audience: body.scope?.audience ?? defaultAudienceForPath(c),
      market: body.scope?.market ?? "default",
      currency: body.scope?.currency,
    },
    parameters: {
      ...(body.parameters ?? {}),
      ...(selection.parameters ?? {}),
      ...(selection.ratePlanId ? { ratePlanId: selection.ratePlanId } : {}),
    },
    draft,
    ttlMs: body.ttlMs,
  }
}

function mergeBatchDraft(
  baseDraft: Record<string, unknown> | undefined,
  selectionDraft: Record<string, unknown> | undefined,
  criteria: CatalogBookingBatchQuoteBody["criteria"],
  selection: CatalogBookingBatchQuoteSelection,
): Record<string, unknown> | undefined {
  const draft = deepMergeRecords(baseDraft, selectionDraft)
  if (!criteria || selection.entityModule !== "accommodations") return draft
  const configure = asRecord(draft?.configure) ?? {}
  const accommodation = asRecord(draft?.accommodation) ?? {}
  const checkIn = criteria.checkIn
  const checkOut = criteria.checkOut
  const nextConfigure = {
    ...configure,
    ...(checkIn || checkOut
      ? {
          dateRange: {
            ...(asRecord(configure.dateRange) ?? {}),
            ...(checkIn ? { checkIn } : {}),
            ...(checkOut ? { checkOut } : {}),
          },
        }
      : {}),
    ...(criteria.occupancy ? { pax: { ...criteria.occupancy } } : {}),
  }
  const roomCount = criteria.roomCount ?? 1
  const roomOccupancy = criteria.occupancy
    ? {
        ...(typeof criteria.occupancy.adult === "number"
          ? { adults: criteria.occupancy.adult }
          : {}),
        ...(typeof criteria.occupancy.child === "number"
          ? { children: criteria.occupancy.child }
          : {}),
        ...(typeof criteria.occupancy.infant === "number"
          ? { infants: criteria.occupancy.infant }
          : {}),
      }
    : {}
  const rooms = Array.from({ length: roomCount }, () => ({
    optionUnitId: selection.entityId,
    quantity: 1,
    ...roomOccupancy,
    ...(selection.ratePlanId ? { ratePlanId: selection.ratePlanId } : {}),
  }))
  return {
    ...(draft ?? {}),
    configure: nextConfigure,
    accommodation: { ...accommodation, rooms },
  }
}

function deepMergeRecords(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base) return override
  if (!override) return base
  const merged = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const baseValue = asRecord(merged[key])
    const overrideValue = asRecord(value)
    merged[key] = baseValue && overrideValue ? deepMergeRecords(baseValue, overrideValue) : value
  }
  return merged
}

export function engineParametersFromDraft(
  parameters: Record<string, unknown> | undefined,
  draftPayload: unknown,
  context: {
    entityModule?: string
    sourceKind?: string
    sourceProvider?: string
  } = {},
): Record<string, unknown> {
  const draft = asRecord(draftPayload)
  const configure = asRecord(draft?.configure)
  const departureSlotId = stringValue(configure?.departureSlotId)
  const paxCount = sumDraftPax(configure?.pax)
  const next: Record<string, unknown> = {
    ...(parameters ?? {}),
    ...(draft ? { draft } : {}),
  }

  if (departureSlotId) {
    if (next.departureSlotId == null) next.departureSlotId = departureSlotId
    if (next.departure_id == null) next.departure_id = departureSlotId
    if (next.slotId == null) next.slotId = departureSlotId
  }
  if (paxCount > 0 && next.paxCount == null) {
    next.paxCount = paxCount
  }
  for (const key of ["roomTypeId", "ratePlanId", "board"] as const) {
    const value = stringValue(configure?.[key])
    if (value && next[key] == null) next[key] = value
  }
  // Lift `draft.promotionCode` to the top-level so `quoteEntity`'s
  // promotion hook can read it without descending into the nested
  // draft. Same lifting pattern as `paxCount` above. Per
  // docs/architecture/promotions-architecture.md §7.0.
  const promotionCode = stringValue(draft?.promotionCode)
  if (promotionCode && next.promotionCode == null) {
    next.promotionCode = promotionCode
  }
  applyConnectPackageConfirmParameters(next, draft, context)

  return next
}

function applyConnectPackageConfirmParameters(
  parameters: Record<string, unknown>,
  draft: Record<string, unknown> | undefined,
  context: { entityModule?: string; sourceKind?: string },
): void {
  if (!draft || !isConnectPackageCandidate(parameters, draft, context)) return

  if (parameters.connectRoute == null) parameters.connectRoute = "packages"

  const billing = asRecord(draft.billing)
  const contact = asRecord(billing?.contact)
  const mappedContact = mapPackageContact(contact)
  if (mappedContact && parameters.contact == null) parameters.contact = mappedContact

  const travelers = mapPackageTravelers(draft.travelers, contact)
  if (travelers.length === 0) return
  if (parameters.travelers == null) parameters.travelers = travelers
  if (parameters.leadTraveler == null) {
    parameters.leadTraveler =
      travelers.find((traveler) => traveler.isPrimary === true) ?? travelers[0]
  }
}

function isConnectPackageCandidate(
  parameters: Record<string, unknown>,
  draft: Record<string, unknown>,
  context: { entityModule?: string; sourceKind?: string },
): boolean {
  if (parameters.connectRoute === "packages") return true
  if (context.sourceKind !== "voyant-connect") return false
  const entityModule = context.entityModule ?? stringValue(asRecord(draft.entity)?.module)
  if (entityModule !== "products") return false
  const configure = asRecord(draft.configure)
  return Boolean(
    stringValue(configure?.roomTypeId) ||
      stringValue(configure?.ratePlanId) ||
      stringValue(configure?.board),
  )
}

function mapPackageContact(
  contact: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const email = stringValue(contact?.email)
  const phone = stringValue(contact?.phone)
  if (!email && !phone) return undefined
  return {
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  }
}

function mapPackageTravelers(
  travelersValue: unknown,
  fallbackContact: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> {
  const travelers = Array.isArray(travelersValue) ? travelersValue : []
  const mapped = travelers
    .map((value, index) => mapPackageTraveler(asRecord(value), index))
    .filter((value): value is Record<string, unknown> => value !== undefined)
  if (mapped.length > 0) return mapped

  const firstName = stringValue(fallbackContact?.firstName)
  const lastName = stringValue(fallbackContact?.lastName)
  if (!firstName || !lastName) return []
  return [
    {
      category: "adult",
      firstName,
      lastName,
      ...(stringValue(fallbackContact?.email)
        ? { email: stringValue(fallbackContact?.email) }
        : {}),
      ...(stringValue(fallbackContact?.phone)
        ? { phone: stringValue(fallbackContact?.phone) }
        : {}),
      isPrimary: true,
    },
  ]
}

function mapPackageTraveler(
  traveler: Record<string, unknown> | undefined,
  index: number,
): Record<string, unknown> | undefined {
  const firstName = stringValue(traveler?.firstName)
  const lastName = stringValue(traveler?.lastName)
  if (!firstName || !lastName) return undefined
  const documents = asRecord(traveler?.documents)
  return {
    category: packageTravelerCategory(stringValue(traveler?.band)),
    firstName,
    lastName,
    ...(stringValue(traveler?.dateOfBirth)
      ? { dateOfBirth: stringValue(traveler?.dateOfBirth) }
      : {}),
    ...(packageTravelerSex(stringValue(documents?.sex) ?? stringValue(documents?.gender))
      ? { sex: packageTravelerSex(stringValue(documents?.sex) ?? stringValue(documents?.gender)) }
      : {}),
    ...(stringValue(documents?.title) ? { title: stringValue(documents?.title) } : {}),
    ...(stringValue(documents?.nationality)
      ? { nationality: stringValue(documents?.nationality) }
      : {}),
    ...(stringValue(traveler?.email) ? { email: stringValue(traveler?.email) } : {}),
    ...(stringValue(traveler?.phone) ? { phone: stringValue(traveler?.phone) } : {}),
    isPrimary: traveler?.isPrimary === true || index === 0,
  }
}

function packageTravelerCategory(value: string | null): "adult" | "child" | "infant" | "senior" {
  if (value === "child" || value === "infant" || value === "senior") return value
  return "adult"
}

function packageTravelerSex(value: string | null): "male" | "female" | "unspecified" | undefined {
  if (value === "male" || value === "female" || value === "unspecified") return value
  if (value === "m") return "male"
  if (value === "f") return "female"
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function sumDraftPax(value: unknown): number {
  const pax = asRecord(value)
  if (!pax) return 0
  let total = 0
  for (const count of Object.values(pax)) {
    if (typeof count === "number" && Number.isFinite(count) && count > 0) {
      total += count
    }
  }
  return total
}

function bookingEngineErrorResponse(c: Context, err: unknown): Response {
  if (err instanceof BookingEngineError) {
    const status = statusForCode(err.code)
    return c.json({ error: err.message, code: err.code, context: err.context }, status as never)
  }
  return handleApiError(err, c)
}

function statusForCode(code: string): number {
  switch (code) {
    case NO_ADAPTER_REGISTERED:
    case NO_HANDLER_REGISTERED:
      return 503
    case QUOTE_NOT_FOUND:
    case ORDER_NOT_FOUND:
      return 404
    case QUOTE_EXPIRED:
    case ORDER_ALREADY_CANCELLED:
      return 409
    default:
      return 500
  }
}

function cryptoRandom(): string {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function serializeQuoteResult(result: QuoteEntityResult): QuoteResponseV1 {
  return quoteResponseV1.parse({
    ...result,
    quotedAt: result.quotedAt.toISOString(),
    expiresAt: result.expiresAt.toISOString(),
    pricing: toPricingBreakdownV1(result.pricing),
  })
}

function serializeBatchQuoteResult(
  items: CatalogBookingBatchQuoteTransformInput["results"],
): QuoteBatchResponseV1 {
  return quoteBatchResponseV1.parse({
    results: items.map((item) => ({
      selection: item.selection,
      ...serializeQuoteResult(item.result),
    })),
  })
}

function toPricingBreakdownV1(basis: PricingBasis | undefined): PricingBreakdownV1 | undefined {
  if (!basis) return undefined
  if (basis.breakdown) {
    const breakdown = basis.breakdown as PricingBreakdownV1
    if (breakdown.currency && Array.isArray(breakdown.lines) && Array.isArray(breakdown.taxes)) {
      return breakdown
    }
  }
  const lines: PricingBreakdownV1["lines"] = [
    {
      kind: "base",
      label: "Base",
      quantity: 1,
      unitAmount: basis.base_amount,
      totalAmount: basis.base_amount,
    },
  ]
  if (basis.fees > 0) {
    lines.push({ kind: "fee", label: "Fees", unitAmount: basis.fees, totalAmount: basis.fees })
  }
  if (basis.surcharges > 0) {
    lines.push({
      kind: "supplement",
      label: "Surcharges",
      unitAmount: basis.surcharges,
      totalAmount: basis.surcharges,
    })
  }
  const subtotal = basis.base_amount + basis.fees + basis.surcharges
  return {
    currency: basis.currency,
    lines,
    taxes:
      basis.taxes > 0
        ? [
            {
              code: "tax",
              label: "Tax",
              rate: 0,
              amount: basis.taxes,
              base: basis.base_amount,
            },
          ]
        : [],
    subtotal,
    taxTotal: basis.taxes,
    total: subtotal + basis.taxes,
  }
}
