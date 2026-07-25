/** Bind the catalog booking Tool contract to the selected booking runtime. */

import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { Context } from "hono"
import {
  type CatalogBookingProvenance,
  type CatalogBookingRouteModuleOptions,
  engineParametersFromDraft,
  getOrderById,
  listOrders,
  OWNED_SOURCE_KIND,
  quoteEntity,
  serializeQuoteResult,
} from "./booking-engine/index.js"
import type { CatalogBookingToolServices } from "./booking-tools.js"
import { readSourcedEntry } from "./services/sourced-entry-service.js"

export function createCatalogBookingToolServices(
  options: CatalogBookingRouteModuleOptions,
  c: Context,
): CatalogBookingToolServices {
  const booking = options.booking
  const db = booking.resolveDb(c)
  return {
    async quote(body) {
      const provenance = await resolveProvenance(c, booking, db, body)
      const correlationId = resolveCorrelationId(c, booking)
      const result = await quoteEntity(
        db,
        {
          registry: booking.resolveSourceRegistry(c),
          ownedHandlers: booking.resolveOwnedHandlers?.(c),
          contentEnricher: booking.contentEnricher,
          onEnricherError: booking.onContentEnricherError,
          evaluatePromotions: booking.resolveEvaluatePromotions?.({ c, db }),
        },
        {
          entityModule: body.entityModule,
          entityId: body.entityId,
          ...provenance,
          scope: {
            locale: body.scope?.locale ?? "en-GB",
            audience: body.scope?.audience ?? "staff",
            market: body.scope?.market ?? "default",
            currency: body.scope?.currency,
          },
          parameters: engineParametersFromDraft(body.parameters, body.draft, {
            entityModule: body.entityModule,
            sourceKind: provenance.sourceKind,
            sourceProvider: provenance.sourceProvider,
          }),
          ttlMs: body.ttlMs,
          adapterContext: resolveAdapterContext(
            c,
            booking,
            db,
            "quote",
            provenance,
            correlationId,
            {
              entityModule: body.entityModule,
              entityId: body.entityId,
            },
          ),
        },
      )
      const transformed =
        (await booking.transformQuoteResult?.({ c, db, request: body, provenance, result })) ??
        result
      return serializeQuoteResult(transformed)
    },
    async listOrders(query) {
      const result = await listOrders(db, query)
      return { rows: result.rows.map(serializeOrder) }
    },
    async getOrder(id) {
      const row = await getOrderById(db, id)
      return row ? serializeOrder(row) : null
    },
  }
}

async function resolveProvenance(
  c: Context,
  options: CatalogBookingRouteModuleOptions["booking"],
  db: AnyDrizzleDb,
  body: Parameters<CatalogBookingToolServices["quote"]>[0],
): Promise<CatalogBookingProvenance> {
  if (body.sourceKind) {
    return {
      sourceKind: body.sourceKind,
      sourceProvider: body.sourceProvider,
      sourceConnectionId: body.sourceConnectionId,
      sourceRef: body.sourceRef,
    }
  }
  if (options.resolveEntityProvenance) {
    return options.resolveEntityProvenance({
      c,
      db,
      entityModule: body.entityModule,
      entityId: body.entityId,
    })
  }
  const row = await readSourcedEntry(db, body.entityModule, body.entityId)
  return row
    ? {
        sourceKind: row.source_kind,
        sourceProvider: row.source_provider ?? undefined,
        sourceConnectionId: row.source_connection_id ?? undefined,
        sourceRef: row.source_ref ?? undefined,
      }
    : { sourceKind: OWNED_SOURCE_KIND }
}

function resolveCorrelationId(
  c: Context,
  options: CatalogBookingRouteModuleOptions["booking"],
): string {
  return options.resolveCorrelationId?.(c) ?? c.req.header("x-request-id") ?? crypto.randomUUID()
}

function resolveAdapterContext(
  c: Context,
  options: CatalogBookingRouteModuleOptions["booking"],
  db: AnyDrizzleDb,
  operation: "quote",
  provenance: CatalogBookingProvenance,
  correlationId: string,
  entity?: { entityModule: string; entityId: string },
) {
  return (
    options.resolveAdapterContext?.({
      c,
      db,
      operation,
      ...entity,
      sourceKind: provenance.sourceKind,
      sourceConnectionId: provenance.sourceConnectionId,
      correlationId,
    }) ?? {
      connection_id: provenance.sourceConnectionId ?? provenance.sourceKind,
      correlation_id: correlationId,
    }
  )
}

function serializeOrder(row: Awaited<ReturnType<typeof getOrderById>> & object) {
  return { ...row, captured_at: row.captured_at.toISOString() }
}
