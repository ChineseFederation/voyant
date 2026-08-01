import type { BookingsRelationshipsRuntime } from "@voyant-travel/bookings/runtime-port"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  createSelfServiceCreateRuntime,
  FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION,
  type FinanceServiceRuntime,
} from "@voyant-travel/finance"
import { createRouteActionRegistry } from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { PricingBasis } from "../snapshot/schema.js"
import { bookingAllocationsRef, bookingsRef } from "./bookings-ref.js"
import { pricingBreakdownV1 } from "./contracts.js"
import type { OwnedBookingHandlerRegistry, SelfServiceBillingParty } from "./owned-handler.js"
import { engineParametersFromDraft } from "./routes.js"
import {
  BookingSessionCommitRejectedError,
  type BookingSessionModule,
  type BookingSessionRepository,
  type CommitOwnedBookingInput,
  createBookingSessionModule,
  InvalidBookingSessionSelectionError,
} from "./sessions-service.js"

export interface ProductionBookingSessionModuleDeps {
  db: PostgresJsDatabase
  repository: BookingSessionRepository
  resolveOwnedHandlers(): OwnedBookingHandlerRegistry | Promise<OwnedBookingHandlerRegistry>
  relationships?: BookingsRelationshipsRuntime
  financeRuntime?: FinanceServiceRuntime
}

export function createProductionBookingSessionModule(
  deps: ProductionBookingSessionModuleDeps,
): BookingSessionModule {
  return createBookingSessionModule({
    ports: {
      repository: deps.repository,
      normalizeSelection: async ({ selection, target }) =>
        normalizeProductSelection(target, selection),
      composeQuote: async ({ session, tx }) => {
        const handlers = await deps.resolveOwnedHandlers()
        const handler = handlers.resolve(entityModuleForSession(session.target))
        if (!handler) {
          return {
            status: "unavailable",
            reason: "target_not_bookable",
            nextAction: "select_alternative_inventory",
          }
        }
        const result = await handler.computeQuote(
          { db: tx as PostgresJsDatabase, adapterContext: {} as never },
          {
            entityModule: handler.entityModule,
            entityId: entityIdForSession(session.target),
            draft: session.statePayload,
            parameters: engineParametersFromDraft(undefined, session.statePayload, {
              entityModule: handler.entityModule,
              sourceKind: "owned",
            }),
            scope: { locale: "en", audience: "customer", market: "default" },
          },
        )
        if (!result.available || !result.pricing) {
          return unavailableQuoteResult(result.invalidReason)
        }
        return { status: "quoted", pricing: pricingBreakdownFromBasis(result.pricing) }
      },
      placeCapacityHold: async ({ session, holdId, quantity, expiresAt, tx }) => {
        const handlers = await deps.resolveOwnedHandlers()
        const handler = handlers.resolve(entityModuleForSession(session.target))
        if (!handler) return "unavailable"
        if (!handler.placeHold) return "unavailable"
        const parameters = engineParametersFromDraft(undefined, session.statePayload, {
          entityModule: handler.entityModule,
          sourceKind: "owned",
        })
        const expectedQuantity = positiveInteger(parameters.paxCount) ?? 1
        if (expectedQuantity !== quantity) {
          return { status: "quantity_mismatch", expectedQuantity }
        }
        const result = await handler.placeHold(
          { db: tx as PostgresJsDatabase, adapterContext: {} as never },
          {
            entityModule: handler.entityModule,
            entityId: entityIdForSession(session.target),
            draftId: holdId,
            ttlMs: Math.max(1, expiresAt.getTime() - Date.now()),
            parameters,
          },
        )
        return result.status !== "unavailable" && result.holdToken === holdId
          ? "held"
          : "unavailable"
      },
      releaseCapacityHold: async ({ session, hold, tx }) => {
        const handlers = await deps.resolveOwnedHandlers()
        const handler = handlers.resolve(entityModuleForSession(session.target))
        if (!handler?.releaseHold) return
        await handler.releaseHold(
          { db: tx as PostgresJsDatabase, adapterContext: {} as never },
          hold.id,
        )
      },
      commitOwnedBooking: (input) => commitOwnedBooking(deps, input),
    },
  })
}

async function commitOwnedBooking(
  deps: ProductionBookingSessionModuleDeps,
  input: CommitOwnedBookingInput,
) {
  // Buyer resolution may create a Relationships row. Keep that row, the
  // Finance command, and Session/Quote/Hold consumption under one root
  // transaction so a failed Commit leaves no partial commercial identity.
  return deps.db.transaction((tx) =>
    commitOwnedBookingInTransaction(deps, input, tx as PostgresJsDatabase),
  )
}

async function commitOwnedBookingInTransaction(
  deps: ProductionBookingSessionModuleDeps,
  input: CommitOwnedBookingInput,
  tx: PostgresJsDatabase,
) {
  const handlers = await deps.resolveOwnedHandlers()
  const handler = handlers.resolve(entityModuleForSession(input.session.target))
  if (!handler) throw new BookingSessionCommitRejectedError("entity_not_bookable")
  if (!handler.deriveSelfServiceCommand) {
    throw new BookingSessionCommitRejectedError("entity_not_bookable")
  }
  const billing = await resolveBilling(deps, input, tx)
  if (!billing) throw new BookingSessionCommitRejectedError("incomplete_draft")
  const derived = await handler.deriveSelfServiceCommand(
    { db: tx, adapterContext: {} as never },
    {
      entityModule: handler.entityModule,
      entityId: entityIdForSession(input.session.target),
      draft: input.session.statePayload,
      pricing: pricingBasisFromBreakdown(input.quote.pricing),
      billing,
      availabilityHoldToken: input.hold.id,
    },
  )
  if (derived.status !== "ok") throw new BookingSessionCommitRejectedError(derived.reason)

  const routeActions = createRouteActionRegistry()
  routeActions.register(FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION)
  const runtime = createSelfServiceCreateRuntime({
    resolveSource: () => ({
      async resolveBookingSource() {
        return {
          status: "ok" as const,
          command: derived.command as never,
          holdExpiresAt: input.hold.expiresAt,
        }
      },
      async consumeBookingSource(tx: AnyDrizzleDb, sourceInput) {
        const rows = await tx
          .select({ id: bookingAllocationsRef.id })
          .from(bookingAllocationsRef)
          .where(eq(bookingAllocationsRef.bookingId, sourceInput.bookingId))
        await input.consumeSources(
          tx,
          sourceInput.bookingId,
          rows.map((row) => row.id),
        )
      },
    }),
    admit: (actor, idempotencyKey) =>
      routeActions.admit(FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION.actionPolicy.id, {
        actor,
        invocation: { idempotencyKey },
      }),
    runtime: deps.financeRuntime,
    async readBookingSummary(db, bookingId) {
      const [row] = await db
        .select({ bookingNumber: bookingsRef.bookingNumber, status: bookingsRef.status })
        .from(bookingsRef)
        .where(eq(bookingsRef.id, bookingId))
        .limit(1)
      return row ? { bookingNumber: row.bookingNumber, status: row.status } : null
    },
  })
  const result = await runtime.createFromDraft({
    db: tx,
    draftId: input.session.id,
    quoteId: input.quote.id,
    caller: { personId: billing.personId ?? undefined },
    // The public contract scopes Commit idempotency to a Session. Finance's
    // action-ledger scope is principal-wide, so preserve the Session boundary
    // when crossing into that command protocol.
    idempotencyKey: `${input.session.id}:${input.idempotencyKey}`,
    userId: input.access.actorKind === "staff" ? input.access.principalId : undefined,
  })
  if (result.status !== "ok") throw new Error(`booking_session_commit_${result.reason}`)
  const allocations = await tx
    .select({ id: bookingAllocationsRef.id })
    .from(bookingAllocationsRef)
    .where(eq(bookingAllocationsRef.bookingId, result.bookingId))
  return { bookingId: result.bookingId, allocationIds: allocations.map((row) => row.id) }
}

async function resolveBilling(
  deps: ProductionBookingSessionModuleDeps,
  input: CommitOwnedBookingInput,
  tx: PostgresJsDatabase,
): Promise<SelfServiceBillingParty | null> {
  const contact = billingContact(input.session.statePayload)
  if (!contact.contactEmail && !contact.contactPhone) return null
  // Authentication identifies the actor, not the buyer. In particular, a
  // staff user id must never be persisted as the Booking's CRM person id.
  const personId = await deps.relationships?.upsertPersonFromContact(
    tx,
    {
      firstName: contact.contactFirstName,
      lastName: contact.contactLastName,
      email: contact.contactEmail,
      phone: contact.contactPhone,
      preferredLanguage: null,
    },
    { source: "booking-session-v1", sourceRef: input.session.id, requireContactPoint: true },
  )
  return personId ? { ...contact, personId: personId.id, organizationId: null } : null
}

function billingContact(payload: Record<string, unknown>) {
  const billing = asRecord(payload.billing)
  const contact = asRecord(billing?.contact)
  const trim = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)
  return {
    personId: null,
    organizationId: null,
    contactFirstName: trim(contact?.firstName),
    contactLastName: trim(contact?.lastName),
    contactEmail: trim(contact?.email),
    contactPhone: trim(contact?.phone),
  }
}

function entityModuleForSession(target: CommitOwnedBookingInput["session"]["target"]) {
  if (target.kind === "product") return "products"
  return "catalog"
}

function entityIdForSession(target: CommitOwnedBookingInput["session"]["target"]) {
  return target.kind === "product" ? target.productId : target.catalogItemId
}

function pricingBreakdownFromBasis(pricing: PricingBasis) {
  const supplied = pricingBreakdownV1.safeParse(pricing.breakdown)
  if (supplied.success) return supplied.data
  const base = Number(pricing.base_amount ?? 0)
  const taxes = Number(pricing.taxes ?? 0)
  const fees = Number(pricing.fees ?? 0)
  const surcharges = Number(pricing.surcharges ?? 0)
  const total = base + taxes + fees + surcharges
  return {
    currency: pricing.currency ?? "EUR",
    lines: [
      { kind: "base" as const, label: "Base", quantity: 1, unitAmount: base, totalAmount: base },
    ],
    taxes: [],
    subtotal: base,
    taxTotal: taxes,
    total,
  }
}

function unavailableQuoteResult(invalidReason: string | undefined) {
  if (invalidReason === "product_not_found") {
    return {
      status: "unavailable" as const,
      reason: "target_not_found" as const,
      nextAction: "select_alternative_inventory" as const,
    }
  }
  if (invalidReason?.startsWith("product_status_")) {
    return {
      status: "unavailable" as const,
      reason: "target_not_bookable" as const,
      nextAction: "select_alternative_inventory" as const,
    }
  }
  if (!invalidReason || invalidReason === "no_sell_amount_configured") {
    return {
      status: "unavailable" as const,
      reason: "price_unavailable" as const,
      nextAction: "contact_operator" as const,
    }
  }
  return {
    status: "unavailable" as const,
    reason: "selection_unavailable" as const,
    nextAction: "update_selection" as const,
  }
}

function pricingBasisFromBreakdown(
  pricing: CommitOwnedBookingInput["quote"]["pricing"],
): PricingBasis {
  return {
    base_amount: pricing.subtotal,
    taxes: pricing.taxTotal,
    fees: 0,
    surcharges: 0,
    currency: pricing.currency,
    breakdown: pricing,
  }
}

export function normalizeProductSelection(
  target: CommitOwnedBookingInput["session"]["target"],
  selection: Record<string, unknown>,
): Record<string, unknown> {
  if (target.kind !== "product") {
    throw new InvalidBookingSessionSelectionError("unsupported_target")
  }
  rejectForbiddenSelection(selection)
  const source = asRecord(selection) ?? {}
  const configure = asRecord(source.configure)
  const billing = asRecord(source.billing)
  const billingContact = asRecord(billing?.contact)
  const billingAddress = asRecord(billing?.address)
  const accommodation = asRecord(source.accommodation)
  return pruneEmpty({
    configure: pruneEmpty({
      pax: normalizeStringNumberMap(asRecord(configure?.pax)),
      departureSlotId: stringValue(configure?.departureSlotId),
      departureDate: stringValue(configure?.departureDate),
      departureTime: stringValue(configure?.departureTime),
      variantId: stringValue(configure?.variantId),
      optionSelections: arrayValue(configure?.optionSelections)
        ?.map(normalizeOptionSelection)
        .filter((value): value is Record<string, unknown> => value != null),
    }),
    billing: pruneEmpty({
      buyerType:
        billing?.buyerType === "B2B" || billing?.buyerType === "B2C"
          ? billing.buyerType
          : undefined,
      contact: pruneEmpty({
        firstName: stringValue(billingContact?.firstName),
        lastName: stringValue(billingContact?.lastName),
        email: stringValue(billingContact?.email),
        phone: stringValue(billingContact?.phone),
      }),
      address: pruneEmpty({ country: stringValue(billingAddress?.country) }),
    }),
    travelers: arrayValue(source.travelers)
      ?.map(normalizeTraveler)
      .filter((value): value is Record<string, unknown> => value != null),
    accommodation: pruneEmpty({
      travelerAssignments: normalizeStringMap(asRecord(accommodation?.travelerAssignments)),
    }),
    addons: arrayValue(source.addons)
      ?.map(normalizeAddon)
      .filter((value): value is Record<string, unknown> => value != null),
  })
}

function rejectForbiddenSelection(value: unknown, path = "selection"): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      rejectForbiddenSelection(item, `${path}.${index}`)
    }
    return
  }
  if (!value || typeof value !== "object") return
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_SELECTION_KEYS.has(key) || /passport|documentClass|document_class/i.test(key)) {
      throw new InvalidBookingSessionSelectionError("forbidden_field", `${path}.${key}`)
    }
    rejectForbiddenSelection(item, `${path}.${key}`)
  }
}

const FORBIDDEN_SELECTION_KEYS = new Set([
  "entity",
  "source",
  "status",
  "priceOverride",
  "supplierResult",
  "internalNotes",
  "suppressNotifications",
  "documentGeneration",
  "bookingNumber",
  "sellAmountCentsOverride",
  "manualPriceOverride",
  "operatorOnly",
])

function normalizeOptionSelection(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  if (!record) return null
  const quantity = positiveInteger(record.quantity)
  const normalized = pruneEmpty({
    optionId: stringValue(record.optionId),
    optionUnitId: stringValue(record.optionUnitId),
    quantity,
  })
  return normalized.optionId && quantity ? normalized : null
}

function normalizeTraveler(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  if (!record) return null
  const normalized = pruneEmpty({
    rowId: stringValue(record.rowId),
    firstName: stringValue(record.firstName),
    lastName: stringValue(record.lastName),
    email: stringValue(record.email),
    phone: stringValue(record.phone),
    band: stringValue(record.band),
  })
  return normalized.firstName || normalized.lastName ? normalized : null
}

function normalizeAddon(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  if (!record) return null
  const quantity = positiveInteger(record.quantity)
  const normalized = pruneEmpty({ extraId: stringValue(record.extraId), quantity })
  return normalized.extraId && quantity ? normalized : null
}

function normalizeStringNumberMap(record: Record<string, unknown> | undefined) {
  if (!record) return undefined
  return pruneEmpty(
    Object.fromEntries(
      Object.entries(record)
        .map(([key, value]) => [key, positiveInteger(value)] as const)
        .filter(([, value]) => value != null),
    ),
  )
}

function normalizeStringMap(record: Record<string, unknown> | undefined) {
  if (!record) return undefined
  return pruneEmpty(
    Object.fromEntries(
      Object.entries(record)
        .map(([key, value]) => [key, stringValue(value)] as const)
        .filter(([, value]) => value),
    ),
  )
}

function pruneEmpty<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value == null) return false
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === "object") return Object.keys(value).length > 0
      return true
    }),
  ) as T
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined
}
