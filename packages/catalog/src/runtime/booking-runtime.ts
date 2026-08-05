import type { BookingsRelationshipsRuntime } from "@voyant-travel/bookings/runtime-port"
import {
  type CatalogBookingRouteModuleOptions,
  createProductionBookingSessionModule,
  createSupplierOperationOperatorService,
} from "@voyant-travel/catalog/booking-engine"
import { createDrizzleBookingSessionRepository } from "@voyant-travel/catalog/booking-engine/sessions-drizzle"
import type { AnalyticsPort } from "@voyant-travel/core/analytics"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { FinanceServiceRuntime, PaymentAdapter } from "@voyant-travel/finance"
import type { FinanceOperatorSettingsRuntime } from "@voyant-travel/finance/runtime-port"
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

export function createOperatorCatalogBookingRouteModuleOptions(options: {
  resolveBookingsRelationshipsRuntime?: () => Promise<BookingsRelationshipsRuntime | null>
  resolveFinanceServiceRuntime?: (context: Context) => FinanceServiceRuntime
  settings: FinanceOperatorSettingsRuntime
  resolvePaymentAdapter?: () => PaymentAdapter | null | Promise<PaymentAdapter | null>
  /** Host-bound product analytics. Unbound is the default and emits nothing. */
  analytics?: AnalyticsPort
}): CatalogBookingRouteModuleOptions {
  const { distribution, inventory, operations } = catalogRuntimeExtensions()
  return {
    resolveDb: getCatalogBookingDb,
    bookingSessions: {
      resolveModule(c, dbOverride) {
        const db = (dbOverride ?? getCatalogBookingDb(c)) as PostgresJsDatabase
        return createProductionBookingSessionModule({
          db,
          ...(options.analytics ? { analytics: options.analytics } : {}),
          repository: createDrizzleBookingSessionRepository(db),
          resolveOwnedHandlers: () => getOwnedBookingHandlerRegistryFromContext(c),
          resolveSourceRegistry: () => getBookingEngineRegistryFromContext(c),
          resolveCompositeHandler: () =>
            requireCatalogRuntimeServices().getCompositeBookingSessionHandler?.(),
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
      resolveSupplierOperations(c) {
        return createSupplierOperationOperatorService({
          db: getCatalogBookingDb(c) as PostgresJsDatabase,
          resolveRegistry: () => getBookingEngineRegistryFromContext(c),
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
