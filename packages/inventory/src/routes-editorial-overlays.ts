import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { CATALOG_EVENTS, emitCatalogEvent } from "@voyant-travel/catalog"
import type { SourceAdapterRegistry } from "@voyant-travel/catalog/booking-engine"
import { OVERLAY_DEFAULT_SCOPE } from "@voyant-travel/catalog/overlay/schema"
import type { EventBus } from "@voyant-travel/core"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { isApiHttpError, openApiValidationHook, requireUserId } from "@voyant-travel/hono"
import type { Context } from "hono"

import {
  clearProductEditorialOverlay,
  listProductEditorialOverlayHistory,
  OverlayVersionConflictError,
  OwnedProductNotOverlayableError,
  readProductEditorialOverlayState,
  writeProductEditorialOverlay,
} from "./service-editorial-overlays.js"

const audienceSchema = z.enum(["staff", "customer", "partner", "supplier", "default"])
const nonemptyString = z.string().trim().min(1)
const localizedLocaleSchema = nonemptyString.refine((value) => value !== OVERLAY_DEFAULT_SCOPE, {
  message: "locale must be a real locale, not the default scope sentinel",
})

const targetSchema = z.object({
  nodeKind: z.enum(["root", "itinerary-day"]).optional(),
  nodeKey: nonemptyString.optional(),
  fieldPath: nonemptyString,
})

const scopeQuerySchema = z.object({
  locale: localizedLocaleSchema.default("en-GB"),
  audience: audienceSchema.default("customer"),
  market: nonemptyString.default(OVERLAY_DEFAULT_SCOPE),
})

const targetQuerySchema = scopeQuerySchema.extend({
  nodeKind: z.enum(["root", "itinerary-day"]).optional(),
  nodeKey: z.string().optional(),
  fieldPath: z.string(),
  expectedVersion: z.coerce.number().int().optional(),
})

const writeOverlayBodySchema = targetSchema.extend({
  locale: localizedLocaleSchema.default("en-GB"),
  audience: audienceSchema.default("customer"),
  market: nonemptyString.default(OVERLAY_DEFAULT_SCOPE),
  value: z.unknown(),
  expectedVersion: z.number().int().nullable().optional(),
  editorialNote: z.string().optional(),
})

const errorSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
  currentVersion: z.number().int().nullable().optional(),
})

const readEditorialOverlayRoute = createRoute({
  method: "get",
  path: "/{id}/editorial-overlays",
  request: { params: z.object({ id: z.string() }), query: scopeQuerySchema },
  responses: {
    200: {
      description: "Provider source, active overlays, and effective product content",
      content: { "application/json": { schema: z.object({ data: z.unknown() }) } },
    },
    404: {
      description: "Product not found, or owned and therefore not overlayable",
      content: { "application/json": { schema: errorSchema } },
    },
  },
})

const writeEditorialOverlayRoute = createRoute({
  method: "put",
  path: "/{id}/editorial-overlays",
  request: {
    params: z.object({ id: z.string() }),
    body: {
      required: true,
      content: { "application/json": { schema: writeOverlayBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Editorial overlay written",
      content: { "application/json": { schema: z.object({ data: z.unknown() }) } },
    },
    400: {
      description: "Invalid overlay target or value",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Owned product — editorial overlays are sourced-only",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "Overlay version conflict",
      content: { "application/json": { schema: errorSchema } },
    },
  },
})

const clearEditorialOverlayRoute = createRoute({
  method: "delete",
  path: "/{id}/editorial-overlays",
  request: { params: z.object({ id: z.string() }), query: targetQuerySchema },
  responses: {
    200: {
      description: "Editorial overlay cleared",
      content: { "application/json": { schema: z.object({ data: z.unknown() }) } },
    },
    404: {
      description: "Owned product — editorial overlays are sourced-only",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "Overlay version conflict",
      content: { "application/json": { schema: errorSchema } },
    },
  },
})

const overlayHistoryRoute = createRoute({
  method: "get",
  path: "/{id}/editorial-overlays/history",
  request: { params: z.object({ id: z.string() }), query: targetQuerySchema.partial() },
  responses: {
    200: {
      description: "Editorial overlay audit history",
      content: { "application/json": { schema: z.object({ data: z.array(z.unknown()) }) } },
    },
    404: {
      description: "Owned product — editorial overlays are sourced-only",
      content: { "application/json": { schema: errorSchema } },
    },
  },
})

export interface ProductEditorialOverlayRoutesEnv {
  Variables: {
    db: AnyDrizzleDb
    eventBus?: EventBus
    userId?: string
  }
}

export interface CreateProductEditorialOverlayRoutesOptions {
  resolveRegistry: (c: Context) => SourceAdapterRegistry
}

export function createProductEditorialOverlayRoutes(
  options: CreateProductEditorialOverlayRoutesOptions,
): OpenAPIHono<ProductEditorialOverlayRoutesEnv> {
  return new OpenAPIHono<ProductEditorialOverlayRoutesEnv>({ defaultHook: openApiValidationHook })
    .openapi(readEditorialOverlayRoute, async (c) => {
      const query = c.req.valid("query")
      try {
        const data = await readProductEditorialOverlayState(
          c.var.db,
          c.req.valid("param").id,
          {
            preferredLocales: [query.locale],
            audience: query.audience === OVERLAY_DEFAULT_SCOPE ? "customer" : query.audience,
            market: query.market,
            acceptMachineTranslated: false,
          },
          { registry: options.resolveRegistry(c) },
        )
        if (!data) {
          return c.json({ error: "not_found", detail: "Product not found" }, 404)
        }
        return c.json({ data }, 200)
      } catch (err) {
        if (err instanceof OwnedProductNotOverlayableError) {
          return c.json({ error: "not_overlayable", detail: err.message }, 404)
        }
        throw err
      }
    })
    .openapi(writeEditorialOverlayRoute, async (c) => {
      const body = c.req.valid("json")
      try {
        const userId = requireUserId(c)
        const row = await writeProductEditorialOverlay(
          c.var.db,
          c.req.valid("param").id,
          {
            node_kind: body.nodeKind,
            node_key: body.nodeKey,
            field_path: body.fieldPath,
            scope: {
              locale: body.locale,
              audience: body.audience,
              market: body.market,
            },
            value: body.value,
            expected_version: body.expectedVersion,
            editorial_note: body.editorialNote,
            origin: { kind: "admin-ui", user_id: userId },
          },
          { registry: options.resolveRegistry(c) },
        )
        await emitProductOverlayChanged(c.var.eventBus, c.req.valid("param").id, {
          nodeKind: row.node_kind ?? body.nodeKind ?? "root",
          nodeKey: row.node_key ?? body.nodeKey ?? "root",
          fieldPath: row.field_path ?? body.fieldPath,
          locale: row.locale ?? body.locale,
          audience: row.audience ?? body.audience,
          market: row.market ?? body.market,
        })
        return c.json({ data: row }, 200)
      } catch (err) {
        if (err instanceof OwnedProductNotOverlayableError) {
          return c.json({ error: "not_overlayable", detail: err.message }, 404)
        }
        if (err instanceof OverlayVersionConflictError) {
          return c.json(
            {
              error: "version_conflict",
              detail: err.message,
              currentVersion: err.currentVersion,
            },
            409,
          )
        }
        if (isApiHttpError(err)) {
          throw err
        }
        return c.json({ error: "invalid_editorial_overlay", detail: errorMessage(err) }, 400)
      }
    })
    .openapi(clearEditorialOverlayRoute, async (c) => {
      const query = c.req.valid("query")
      try {
        requireUserId(c)
        const row = await clearProductEditorialOverlay(c.var.db, c.req.valid("param").id, {
          node_kind: query.nodeKind,
          node_key: query.nodeKey,
          field_path: query.fieldPath,
          scope: {
            locale: query.locale,
            audience: query.audience,
            market: query.market,
          },
          expected_version: query.expectedVersion,
        })
        if (row) {
          await emitProductOverlayChanged(c.var.eventBus, c.req.valid("param").id, {
            nodeKind: row.node_kind ?? query.nodeKind ?? "root",
            nodeKey: row.node_key ?? query.nodeKey ?? "root",
            fieldPath: row.field_path ?? query.fieldPath,
            locale: row.locale ?? query.locale,
            audience: row.audience ?? query.audience,
            market: row.market ?? query.market,
          })
        }
        return c.json({ data: { cleared: row != null, overlay: row } }, 200)
      } catch (err) {
        if (err instanceof OwnedProductNotOverlayableError) {
          return c.json({ error: "not_overlayable", detail: err.message }, 404)
        }
        if (err instanceof OverlayVersionConflictError) {
          return c.json(
            {
              error: "version_conflict",
              detail: err.message,
              currentVersion: err.currentVersion,
            },
            409,
          )
        }
        throw err
      }
    })
    .openapi(overlayHistoryRoute, async (c) => {
      const query = c.req.valid("query")
      try {
        const rows = await listProductEditorialOverlayHistory(c.var.db, c.req.valid("param").id, {
          node_kind: query.nodeKind,
          node_key: query.nodeKey,
          field_path: query.fieldPath,
          locale: query.locale,
          audience: query.audience,
          market: query.market,
        })
        return c.json({ data: rows }, 200)
      } catch (err) {
        if (err instanceof OwnedProductNotOverlayableError) {
          return c.json({ error: "not_overlayable", detail: err.message }, 404)
        }
        throw err
      }
    })
}

async function emitProductOverlayChanged(
  eventBus: EventBus | undefined,
  productId: string,
  target: {
    nodeKind: string
    nodeKey: string
    fieldPath: string
    locale: string
    audience: string
    market: string
  },
): Promise<void> {
  if (!eventBus) return
  await emitCatalogEvent(eventBus, CATALOG_EVENTS.ENTITY_OVERLAY_CHANGED, {
    entity_module: "products",
    entity_id: productId,
    node_kind: target.nodeKind,
    node_key: target.nodeKey,
    field_path: target.fieldPath,
    locale: target.locale,
    audience: target.audience,
    market: target.market,
    occurred_at: new Date().toISOString(),
  })
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
