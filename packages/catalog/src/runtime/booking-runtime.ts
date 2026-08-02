import type { BookingsRelationshipsRuntime } from "@voyant-travel/bookings/runtime-port"
import {
  type CatalogBookingRouteModuleOptions,
  type CatalogBookingRoutesOptions,
  catalogQuotesTable,
  createProductionBookingSessionModule,
  OWNED_SOURCE_KIND,
  type QuoteEntityResult,
} from "@voyant-travel/catalog/booking-engine"
import { createDrizzleBookingSessionRepository } from "@voyant-travel/catalog/booking-engine/sessions-drizzle"
import {
  applyCatalogTaxToQuoteResult,
  resolveCatalogHoldTtlMs,
} from "@voyant-travel/catalog/runtime-support"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { FinanceServiceRuntime, PaymentAdapter } from "@voyant-travel/finance"
import {
  computeBookingItemTaxLine,
  resolveBookingSellTaxRate,
} from "@voyant-travel/finance/booking-tax"
import type { FinanceOperatorSettingsRuntime } from "@voyant-travel/finance/runtime-port"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { resolveBookingSessionStaffAuthorities } from "../booking-engine/sessions-staff-authority.js"
import { requireCatalogRuntimeServices } from "../runtime-contracts.js"
import {
  getBookingEngineRegistryFromContext,
  getOwnedBookingHandlerRegistryFromContext,
} from "./booking-engine-runtime.js"
import { catalogRuntimeExtensions } from "./host.js"

function getCatalogBookingDb(c: Context): AnyDrizzleDb {
  return (c.var as { db: AnyDrizzleDb }).db
}

function createOperatorCatalogBookingRoutesOptions(): CatalogBookingRoutesOptions {
  const { commerce, inventory } = catalogRuntimeExtensions()
  return {
    resolveDb: getCatalogBookingDb,
    resolveSourceRegistry: getBookingEngineRegistryFromContext,
    resolveOwnedHandlers: getOwnedBookingHandlerRegistryFromContext,
    resolveHoldTtlMs: ({ db, entityModule, entityId }) =>
      resolveHoldTtlMs(db, entityModule, entityId),
    // Promotions hook wires the per-request db into the evaluator. When
    // the customer-supplied promotion code fails validation, quoteEntity
    // surfaces a code_* invalidReason and tax recompute below sees no
    // discount on base_amount.
    resolveEvaluatePromotions: commerce.createPromotionEvaluator,
    transformQuoteResult: async ({ c, db, result, request, provenance }) => {
      const taxed = await requireCatalogRuntimeServices().applyTaxToQuoteResult(
        db,
        result,
        request.entityModule,
        request.entityId,
        provenance.sourceKind,
      )
      return inventory.enrichProductQuoteShape({
        db,
        result: taxed,
        entityModule: request.entityModule,
        entityId: request.entityId,
        locale: request.scope?.locale ?? "en-GB",
        audience: request.scope?.audience,
        market: request.scope?.market ?? "default",
        currency: request.scope?.currency,
        registry: getBookingEngineRegistryFromContext(c),
        adapterContext: {
          connection_id: provenance.sourceConnectionId ?? provenance.sourceKind,
        },
      })
    },
  }
}

export function createOperatorCatalogBookingRouteModuleOptions(options: {
  resolveBookingsRelationshipsRuntime?: () => Promise<BookingsRelationshipsRuntime | null>
  resolveFinanceServiceRuntime?: (context: Context) => FinanceServiceRuntime
  settings: FinanceOperatorSettingsRuntime
  resolvePaymentAdapter?: () => PaymentAdapter | null | Promise<PaymentAdapter | null>
}): CatalogBookingRouteModuleOptions {
  const { distribution, inventory, operations } = catalogRuntimeExtensions()
  return {
    booking: createOperatorCatalogBookingRoutesOptions(),
    bookingSessions: {
      resolveModule(c) {
        const db = getCatalogBookingDb(c) as PostgresJsDatabase
        return createProductionBookingSessionModule({
          db,
          repository: createDrizzleBookingSessionRepository(db),
          resolveOwnedHandlers: () => getOwnedBookingHandlerRegistryFromContext(c),
          relationships: {
            async loadPersonTravelSnapshot(...args) {
              const runtime = await requireRelationshipsRuntime(options)
              return runtime.loadPersonTravelSnapshot(...args)
            },
            async upsertPersonFromContact(...args) {
              const runtime = await requireRelationshipsRuntime(options)
              return runtime.upsertPersonFromContact(...args)
            },
            async getPersonById(...args) {
              const runtime = await requireRelationshipsRuntime(options)
              return runtime.getPersonById(...args)
            },
            async getOrganizationById(...args) {
              const runtime = await requireRelationshipsRuntime(options)
              return runtime.getOrganizationById(...args)
            },
          },
          financeRuntime: options.resolveFinanceServiceRuntime?.(c),
          payments: {
            inventory,
            distribution,
            settings: options.settings,
            resolvePaymentAdapter: options.resolvePaymentAdapter,
            paymentAdapterContext: { env: c.env as Readonly<Record<string, unknown>> },
          },
        })
      },
      resolveAccess(c, actorKind) {
        const vars = c.var as {
          userId?: string
          organizationId?: string
          actor?: string
          realm?: string
          scopes?: string[]
        }
        const capability = c.req.header("Voyant-Booking-Session-Capability")?.trim()
        if (actorKind === "anonymous" && vars.actor === "customer" && vars.realm === "customer") {
          return {
            actorKind: "customer" as const,
            ...(vars.userId ? { principalId: vars.userId } : {}),
            ...(vars.organizationId ? { organizationId: vars.organizationId } : {}),
            ...(capability ? { capability } : {}),
          }
        }
        if (actorKind === "staff") {
          const requiredScope = bookingSessionStaffScope(c)
          const scopes = vars.scopes ?? c.get("scopes") ?? []
          return {
            actorKind: "staff" as const,
            ...(vars.userId ? { principalId: vars.userId } : {}),
            ...(vars.organizationId ? { organizationId: vars.organizationId } : {}),
            ...resolveBookingSessionStaffAuthorities(scopes, requiredScope),
          }
        }
        return {
          actorKind: "anonymous" as const,
          ...(vars.userId ? { principalId: vars.userId } : {}),
          ...(vars.organizationId ? { organizationId: vars.organizationId } : {}),
          ...(capability ? { capability } : {}),
        }
      },
    },
    resolveRegistry: getBookingEngineRegistryFromContext,
    getProductContent: inventory.getProductContent,
    listAvailabilitySlots: operations.listAvailabilitySlots,
    getOwnedProductById: inventory.getOwnedProductById,
  }
}

function bookingSessionStaffScope(c: Context): string {
  if (c.req.path.includes("/booking-sessions/maintenance/")) {
    return "catalog:booking-session-retention"
  }
  return c.req.method === "GET" ? "catalog:booking-session-read" : "catalog:booking-session-write"
}

async function requireRelationshipsRuntime(options: {
  resolveBookingsRelationshipsRuntime?: () => Promise<BookingsRelationshipsRuntime | null>
}): Promise<BookingsRelationshipsRuntime> {
  const runtime = await options.resolveBookingsRelationshipsRuntime?.()
  if (!runtime) {
    throw new Error("booking_session_relationships_runtime_required")
  }
  return runtime
}

async function resolveHoldTtlMs(
  db: AnyDrizzleDb,
  entityModule: string,
  entityId: string,
): Promise<number> {
  const { distribution, inventory } = catalogRuntimeExtensions()
  return resolveCatalogHoldTtlMs({
    entityModule,
    entityId,
    loadProduct: (id) => inventory.loadProductReservationPolicy(db, id),
    loadSupplier: (id) => distribution.loadSupplierReservationTimeout(db, id),
  })
}

export async function applyOperatorTaxToQuoteResult(
  db: AnyDrizzleDb,
  result: QuoteEntityResult,
  entityModule: string,
  entityId: string,
  sourceKind: string,
  resolveBookingTaxSettings: FinanceOperatorSettingsRuntime["resolveBookingTaxSettings"],
): Promise<QuoteEntityResult> {
  return applyCatalogTaxToQuoteResult({
    result,
    entityModule,
    entityId,
    sourceKind,
    ownedSourceKind: OWNED_SOURCE_KIND,
    resolveTaxLine: async ({ productId, taxableCents, currency }) => {
      const taxRate = await resolveBookingSellTaxRate(
        db as PostgresJsDatabase,
        { productId, facts: { hasAccommodation: false, accommodationCountries: [] } },
        { resolveBookingTaxSettings },
      )
      return computeBookingItemTaxLine(taxRate, taxableCents, currency)
    },
    persistPricing: async (quoteId, pricing) => {
      await (db as PostgresJsDatabase)
        .update(catalogQuotesTable)
        .set({
          pricing_base_amount: String(pricing.base_amount),
          pricing_taxes: String(pricing.taxes),
          pricing_fees: String(pricing.fees),
          pricing_surcharges: String(pricing.surcharges),
          pricing_currency: pricing.currency,
          pricing_breakdown: pricing.breakdown,
        })
        .where(eq(catalogQuotesTable.id, quoteId))
    },
  })
}
