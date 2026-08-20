import type { BookingsRelationshipsRuntime } from "@voyant-travel/bookings/runtime-port"
import {
  type CatalogBookingRouteModuleOptions,
  createProductionBookingSessionModule,
  createSupplierOperationOperatorService,
  type ProductionBookingSessionModuleDeps,
} from "@voyant-travel/catalog/booking-engine"
import { createDrizzleBookingSessionRepository } from "@voyant-travel/catalog/booking-engine/sessions-drizzle"
import type { AnalyticsPort } from "@voyant-travel/core/analytics"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { FinanceServiceRuntime, PaymentAdapter } from "@voyant-travel/finance"
import type { FinanceOperatorSettingsRuntime } from "@voyant-travel/finance/runtime-port"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { resolveBookingSessionStaffAuthorities } from "../booking-engine/sessions-staff-authority.js"
import type { PersonalBuyerPersonRuntime } from "../personal-buyer-person-runtime-port.js"
import { requireCatalogRuntimeServices } from "../runtime-contracts.js"
import {
  getBookingEngineRegistryFromContext,
  getOwnedBookingHandlerRegistryFromContext,
} from "./booking-engine-runtime.js"
import { catalogRuntimeExtensions } from "./host.js"

function getCatalogBookingDb(c: Context): AnyDrizzleDb {
  return (c.var as { db: AnyDrizzleDb }).db
}

export interface BookingSessionServiceRuntimeOptions<ContextValue = Context> {
  resolveBookingsRelationshipsRuntime?: () => Promise<BookingsRelationshipsRuntime | null>
  resolvePersonalBuyerPersonRuntime?: () => Promise<PersonalBuyerPersonRuntime | null>
  resolveFinanceServiceRuntime?: (context: ContextValue) => FinanceServiceRuntime
}

/** Bind the cross-module runtimes required by every production Booking Session. */
export function createBookingSessionServiceRuntimes<ContextValue>(
  options: BookingSessionServiceRuntimeOptions<ContextValue>,
  context: ContextValue,
): Pick<
  ProductionBookingSessionModuleDeps,
  "relationships" | "personalBuyerPerson" | "financeRuntime"
> {
  return {
    // Runtime ports may still be promises (or not yet contributed) when
    // Catalog contributes its ports, so keep Relationships lazy until a
    // Session actually needs it. A resolver that still finds no optional port
    // answers null through this facade, preserving the typed incomplete_draft.
    ...(options.resolveBookingsRelationshipsRuntime
      ? {
          relationships: {
            async loadPersonTravelSnapshot(...args) {
              const runtime = await options.resolveBookingsRelationshipsRuntime?.()
              return runtime?.loadPersonTravelSnapshot(...args) ?? null
            },
            async createPersonWithoutContactMatch(...args) {
              const runtime = await options.resolveBookingsRelationshipsRuntime?.()
              if (!runtime) throw new Error("Relationships runtime is not available")
              return runtime.createPersonWithoutContactMatch(...args)
            },
            async upsertPersonFromContact(...args) {
              const runtime = await options.resolveBookingsRelationshipsRuntime?.()
              return runtime?.upsertPersonFromContact(...args) ?? null
            },
            async getPersonById(...args) {
              const runtime = await options.resolveBookingsRelationshipsRuntime?.()
              return runtime?.getPersonById(...args) ?? null
            },
            async getOrganizationById(...args) {
              const runtime = await options.resolveBookingsRelationshipsRuntime?.()
              return runtime?.getOrganizationById(...args) ?? null
            },
          },
        }
      : {}),
    ...(options.resolvePersonalBuyerPersonRuntime
      ? {
          personalBuyerPerson: {
            async ensurePersonalBuyerPerson(...args) {
              const runtime = await options.resolvePersonalBuyerPersonRuntime?.()
              return runtime?.ensurePersonalBuyerPerson(...args) ?? null
            },
          },
        }
      : {}),
    financeRuntime: options.resolveFinanceServiceRuntime?.(context) ?? {},
  }
}

export function createOperatorCatalogBookingRouteModuleOptions(options: {
  resolveBookingsRelationshipsRuntime?: () => Promise<BookingsRelationshipsRuntime | null>
  resolveFinanceServiceRuntime?: (context: Context) => FinanceServiceRuntime
  settings: FinanceOperatorSettingsRuntime
  resolvePaymentAdapter?: () => PaymentAdapter | null | Promise<PaymentAdapter | null>
  /** Host-bound product analytics. Unbound is the default and emits nothing. */
  analytics?: AnalyticsPort
}): CatalogBookingRouteModuleOptions {
  const { commerce, distribution, inventory, operations } = catalogRuntimeExtensions()
  return {
    resolveDb: getCatalogBookingDb,
    bookingSessions: {
      resolveModule(c, dbOverride) {
        const db = (dbOverride ?? getCatalogBookingDb(c)) as PostgresJsDatabase
        return createProductionBookingSessionModule({
          db,
          ...(options.analytics ? { analytics: options.analytics } : {}),
          resolvePromotionEvaluator: (sessionDb) => commerce.createPromotionEvaluator?.(sessionDb),
          ...(commerce.resolveAncillaryOffers
            ? { resolveAncillaryOffers: commerce.resolveAncillaryOffers }
            : {}),
          repository: createDrizzleBookingSessionRepository(db),
          resolveOwnedHandlers: () => getOwnedBookingHandlerRegistryFromContext(c),
          resolveSourceRegistry: () => getBookingEngineRegistryFromContext(c),
          resolveCompositeHandler: () =>
            requireCatalogRuntimeServices().getCompositeBookingSessionHandler?.(),
          ...createBookingSessionServiceRuntimes(options, c),
          payments: {
            inventory,
            distribution,
            settings: options.settings,
            // Accommodations, cruise cabins and sourced entries resolve their
            // policy through this cascade; without it they collect nothing
            // (voyant#4745).
            ...(commerce.entityPaymentPolicy ? { entityPolicy: commerce.entityPaymentPolicy } : {}),
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
          buyerAccountId?: string
          buyerAccountKind?: "personal" | "business"
          relationshipPersonId?: string
          authOrganizationId?: string
          relationshipOrganizationId?: string
          buyerMembershipId?: string
          buyerMembershipRole?: string
        }
        const capability = c.req.header("Voyant-Booking-Session-Capability")?.trim()
        if (actorKind === "anonymous" && vars.actor === "customer" && vars.realm === "customer") {
          return {
            actorKind: "customer" as const,
            ...(vars.userId ? { principalId: vars.userId } : {}),
            ...(vars.organizationId ? { organizationId: vars.organizationId } : {}),
            ...(vars.buyerAccountId ? { buyerAccountId: vars.buyerAccountId } : {}),
            ...(vars.buyerAccountKind ? { buyerAccountKind: vars.buyerAccountKind } : {}),
            ...(vars.relationshipPersonId
              ? { relationshipPersonId: vars.relationshipPersonId }
              : {}),
            ...(vars.authOrganizationId ? { authOrganizationId: vars.authOrganizationId } : {}),
            ...(vars.relationshipOrganizationId
              ? { relationshipOrganizationId: vars.relationshipOrganizationId }
              : {}),
            ...(vars.buyerMembershipId ? { membershipId: vars.buyerMembershipId } : {}),
            ...(vars.buyerMembershipRole ? { membershipRole: vars.buyerMembershipRole } : {}),
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
