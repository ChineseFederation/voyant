import type { BookingsRelationshipsRuntime } from "@voyant-travel/bookings/runtime-port"
import {
  createSourcedBookingCommitment,
  type SourcedBookingTravelerInput,
} from "@voyant-travel/bookings/service-sourced-commitment"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  allocateBookingNumber,
  applyBookingSessionStaffSelectionV1,
  createSelfServiceCreateRuntime,
  FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION,
  type FinanceServiceRuntime,
  normalizeBookingSessionStaffSelectionV1,
} from "@voyant-travel/finance"
import { createRouteActionRegistry } from "@voyant-travel/tools"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { catalogSourcedEntriesTable } from "../schema-sourced-entries.js"
import { captureSnapshot } from "../services/snapshot-service.js"
import type { PricingBasis } from "../snapshot/schema.js"
import { bookingAllocationsRef, bookingsRef } from "./bookings-ref.js"
import { pricingBreakdownV1 } from "./contracts.js"
import type { OwnedBookingHandlerRegistry, SelfServiceBillingParty } from "./owned-handler.js"
import type { SourceAdapterRegistry } from "./registry.js"
import { engineParametersFromDraft } from "./routes.js"
import type { ProductionBookingSessionPaymentDeps } from "./sessions-payment-production.js"
import { createProductionBookingSessionPaymentPorts } from "./sessions-payment-production.js"
import {
  BookingSessionCommitRejectedError,
  type BookingSessionCompositeHandler,
  type BookingSessionCompositeLeafRuntime,
  type BookingSessionModule,
  type BookingSessionRepository,
  type CommitOwnedBookingInput,
  type CommitSourcedBookingInput,
  createBookingSessionModule,
  InvalidBookingSessionSelectionError,
} from "./sessions-service.js"
import {
  createSupplierOperationWorkflow,
  safeSupplierRequestPayload,
} from "./supplier-operation-workflow.js"
import {
  createDrizzleSupplierOperationRepository,
  createSupplierOperationRecord,
} from "./supplier-operations.js"

export interface ProductionBookingSessionModuleDeps {
  db: PostgresJsDatabase
  repository: BookingSessionRepository
  resolveOwnedHandlers(): OwnedBookingHandlerRegistry | Promise<OwnedBookingHandlerRegistry>
  resolveSourceRegistry(): SourceAdapterRegistry | Promise<SourceAdapterRegistry>
  resolveCompositeHandler?():
    | BookingSessionCompositeHandler
    | undefined
    | Promise<BookingSessionCompositeHandler | undefined>
  relationships?: BookingsRelationshipsRuntime
  financeRuntime?: FinanceServiceRuntime
  payments?: Omit<ProductionBookingSessionPaymentDeps, "db" | "financeRuntime">
}

export function createProductionBookingSessionModule(
  deps: ProductionBookingSessionModuleDeps,
): BookingSessionModule {
  const payments = deps.payments
    ? createProductionBookingSessionPaymentPorts({
        db: deps.db,
        financeRuntime: deps.financeRuntime,
        ...deps.payments,
      })
    : undefined
  const leaf = createProductionCompositeLeafRuntime(deps)
  return createBookingSessionModule({
    ports: {
      repository: deps.repository,
      normalizeSelection: async ({ selection, target, access }) =>
        normalizeBookingSelection(target, selection, access),
      composeQuote: async (input) => {
        const { session } = input
        if (session.target.kind === "trip_snapshot") {
          const handler = await deps.resolveCompositeHandler?.()
          return (
            (handler ? await handler.composeQuote({ ...input, leaf }) : undefined) ?? {
              status: "unavailable",
              reason: "target_not_bookable",
              nextAction: "contact_operator",
            }
          )
        }
        return leaf.composeQuote(input)
      },
      placeCapacityHold: async (input) => {
        const { session } = input
        if (session.target.kind === "trip_snapshot") {
          const handler = await deps.resolveCompositeHandler?.()
          if (!handler) return "unavailable"
          return handler.placeCapacityHold({ ...input, leaf })
        }
        return leaf.placeCapacityHold(input)
      },
      releaseCapacityHold: async (input) => {
        const { session } = input
        if (session.target.kind === "trip_snapshot") {
          const handler = await deps.resolveCompositeHandler?.()
          await handler?.releaseCapacityHold({ ...input, leaf })
          return
        }
        await leaf.releaseCapacityHold(input)
      },
      commitOwnedBooking: (input) => commitOwnedBooking(deps, input),
      commitSourcedBooking: (input) => commitSourcedBooking(deps, input),
      commitCompositeBooking: async (input) => {
        const handler = await deps.resolveCompositeHandler?.()
        if (!handler) throw new BookingSessionCommitRejectedError("entity_not_bookable")
        return handler.commit({ ...input, leaf, db: deps.db })
      },
      hasActiveSupplierOperation: async ({ sessionId, tx }) => {
        const operation = await createDrizzleSupplierOperationRepository(
          tx as PostgresJsDatabase,
        ).getBlockingBySession(sessionId)
        return Boolean(operation)
      },
      payments,
    },
  })
}

function createProductionCompositeLeafRuntime(
  deps: ProductionBookingSessionModuleDeps,
): BookingSessionCompositeLeafRuntime {
  return {
    async composeQuote({ session, tx }) {
      if (session.target.kind === "catalog_item") {
        return composeSourcedQuote(deps, session, tx as PostgresJsDatabase)
      }
      if (session.target.kind === "trip_snapshot") {
        return unavailableQuoteResult("unsupported_target")
      }
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
      return {
        status: "quoted",
        pricing: pricingBreakdownFromBasis(result.pricing, result.upstreamPayload),
      }
    },
    async placeCapacityHold(input) {
      const { session, holdId, quantity, expiresAt, tx } = input
      if (session.target.kind === "catalog_item") return "held"
      if (session.target.kind === "trip_snapshot") return "unavailable"
      const handlers = await deps.resolveOwnedHandlers()
      const handler = handlers.resolve(entityModuleForSession(session.target))
      if (!handler?.placeHold) return "unavailable"
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
          ttlMs: Math.max(1, expiresAt.getTime() - input.now.getTime()),
          parameters,
        },
      )
      return result.status !== "unavailable" && result.holdToken === holdId ? "held" : "unavailable"
    },
    async releaseCapacityHold({ session, hold, tx }) {
      if (session.target.kind !== "product" && session.target.kind !== "owned_entity") return
      const handlers = await deps.resolveOwnedHandlers()
      const handler = handlers.resolve(entityModuleForSession(session.target))
      if (!handler?.releaseHold) return
      await handler.releaseHold(
        { db: tx as PostgresJsDatabase, adapterContext: {} as never },
        hold.id,
      )
    },
    commitOwned: (input) => commitOwnedBooking(deps, input),
    commitSourced: (input) => commitSourcedBooking(deps, input),
  }
}

async function composeSourcedQuote(
  deps: ProductionBookingSessionModuleDeps,
  session: CommitSourcedBookingInput["session"],
  tx: PostgresJsDatabase,
) {
  const sourced = await resolveSourcedTarget(tx, session)
  if (!sourced) return unavailableQuoteResult("product_not_found")
  const registry = await deps.resolveSourceRegistry()
  const adapter = registry.resolveByConnection(sourced.sourceConnectionId)
  if (!adapter?.capabilities.supportsLiveResolution || !adapter.liveResolve) {
    return unavailableQuoteResult("no_sell_amount_configured")
  }
  const result = await adapter.liveResolve(
    { connection_id: sourced.sourceConnectionId },
    {
      ids: [sourced.entityId],
      source_refs: { [sourced.entityId]: sourced.sourceRef },
      scope: { locale: "en", audience: "customer", market: "default" },
      parameters: sourcedParameters(session.statePayload, sourced),
    },
  )
  const liveValues = result.values[sourced.entityId]
  if (result.failed?.[sourced.entityId] || !liveValues) {
    return unavailableQuoteResult("selection_unavailable")
  }
  const pricing = pricingBreakdownFromLiveValues(liveValues)
  return pricing
    ? { status: "quoted" as const, pricing }
    : unavailableQuoteResult("no_sell_amount_configured")
}

async function commitSourcedBooking(
  deps: ProductionBookingSessionModuleDeps,
  input: CommitSourcedBookingInput,
) {
  const sourced = await resolveSourcedTarget(deps.db, input.session)
  if (!sourced) throw new BookingSessionCommitRejectedError("entity_not_bookable")
  const registry = await deps.resolveSourceRegistry()
  const workflow = createSupplierOperationWorkflow({
    repository: createDrizzleSupplierOperationRepository(deps.db),
    registry,
  })
  const parameters = sourcedParameters(input.session.statePayload, sourced)
  const request = {
    entity_module: sourced.entityModule,
    entity_id: sourced.entityId,
    source_ref: sourced.sourceRef,
    parameters,
    party: supplierParty(input.session.statePayload),
    scope: { locale: "en", audience: "customer", market: "default" },
  }
  const adapter = registry.resolveByConnection(sourced.sourceConnectionId)
  await deps.repository.withSessionTransaction(input.session.id, async (rawTx) => {
    const currentSession = await deps.repository.getSession(input.session.id)
    if (currentSession?.state !== "active" && currentSession?.state !== "supplier_pending") {
      throw new BookingSessionCommitRejectedError("entity_not_bookable")
    }
    const claim = await createDrizzleSupplierOperationRepository(
      rawTx as PostgresJsDatabase,
    ).createOrReplay(
      createSupplierOperationRecord({
        sessionId: input.session.id,
        scopeKey: input.supplierOperationScope,
        quoteId: input.quote.id,
        ...(input.hold ? { holdId: input.hold.id } : {}),
        commitIdempotencyKey: input.idempotencyKey,
        entityModule: sourced.entityModule,
        entityId: sourced.entityId,
        sourceKind: sourced.sourceKind,
        sourceConnectionId: sourced.sourceConnectionId,
        sourceRef: sourced.sourceRef,
        adapterKind: adapter?.kind ?? sourced.sourceKind,
        requestFingerprint: input.requestFingerprint,
        adapterIdempotencyKey: input.supplierOperationScope
          ? `${input.session.id}:${input.supplierOperationScope}:${input.idempotencyKey}:reserve`
          : `${input.session.id}:${input.idempotencyKey}:reserve`,
        requestPayload: safeSupplierRequestPayload(request),
        now: input.now,
      }),
    )
    if (claim.status === "conflict") {
      throw new Error("supplier_operation_idempotency_conflict")
    }
    if (currentSession.state === "active") {
      currentSession.state = "supplier_pending"
      currentSession.updatedAt = input.now
      await deps.repository.saveSession(currentSession)
    }
  })
  const result = await workflow.dispatch({
    sessionId: input.session.id,
    scopeKey: input.supplierOperationScope,
    quoteId: input.quote.id,
    ...(input.hold ? { holdId: input.hold.id } : {}),
    commitIdempotencyKey: input.idempotencyKey,
    requestFingerprint: input.requestFingerprint,
    entityModule: sourced.entityModule,
    entityId: sourced.entityId,
    sourceKind: sourced.sourceKind,
    sourceConnectionId: sourced.sourceConnectionId,
    sourceRef: sourced.sourceRef,
    request,
    adapterContext: { connection_id: sourced.sourceConnectionId },
    now: input.now,
  })
  if (result.kind === "idempotency_conflict") {
    throw new BookingSessionCommitRejectedError("entity_not_bookable")
  }
  if (result.kind === "pending") {
    return {
      kind: "supplier_pending" as const,
      nextAction: "await_supplier_operation" as const,
      supplierOperationId: result.operation.id,
      operatorBackedRiskAccepted: false,
    }
  }
  if (result.kind === "in_doubt") {
    return {
      kind: "supplier_in_doubt" as const,
      nextAction: "reconcile_supplier_operation" as const,
      supplierOperationId: result.operation.id,
      operatorBackedRiskAccepted: false,
    }
  }
  if (result.kind === "failed") {
    await reopenSessionAfterSupplierFailure(deps, result.operation.sessionId, input.now)
    return {
      kind: "supplier_failed" as const,
      nextAction:
        result.operation.state === "manual_review"
          ? ("manual_review" as const)
          : ("select_alternative_inventory" as const),
      supplierOperationId: result.operation.id,
      operatorBackedRiskAccepted: false,
    }
  }

  return deps.db.transaction(async (tx) => {
    const transaction = tx as PostgresJsDatabase
    const operationRepository = createDrizzleSupplierOperationRepository(transaction)
    const operation = await operationRepository.getForUpdate(result.operation.id)
    if (
      !operation ||
      (operation.state !== "succeeded" &&
        !(operation.state === "manually_resolved" && operation.upstreamStatus === "succeeded"))
    ) {
      throw new Error("supplier_operation_not_secured")
    }
    if (operation.bookingId) {
      const allocations = await transaction
        .select({ id: bookingAllocationsRef.id })
        .from(bookingAllocationsRef)
        .where(eq(bookingAllocationsRef.bookingId, operation.bookingId))
      return {
        kind: "committed" as const,
        bookingId: operation.bookingId,
        allocationIds: allocations.map((row) => row.id),
        supplierOperationId: operation.id,
      }
    }
    const billing = await resolveBilling(deps, input, transaction)
    if (!billing) throw new BookingSessionCommitRejectedError("incomplete_draft")
    const bookingNumber = await allocateBookingNumber(transaction, { now: input.now })
    const materialized = await createSourcedBookingCommitment(transaction, {
      bookingNumber,
      personId: billing.personId,
      organizationId: billing.organizationId,
      contactFirstName: billing.contactFirstName,
      contactLastName: billing.contactLastName,
      contactEmail: billing.contactEmail,
      contactPhone: billing.contactPhone,
      sellCurrency: input.quote.pricing.currency,
      sellAmountCents: input.quote.pricing.total,
      title: sourced.title,
      quantity: supplierQuantity(input.session.statePayload),
      serviceDate: supplierServiceDate(result.result.upstream_payload),
      endDate: supplierEndDate(result.result.upstream_payload),
      travelers: sourcedTravelers(input.session.statePayload),
      entityModule: sourced.entityModule,
      entityId: sourced.entityId,
      sourceKind: sourced.sourceKind,
      sourceProvider: sourced.sourceProvider,
      sourceConnectionId: sourced.sourceConnectionId,
      sourceRef: sourced.sourceRef,
      upstreamRef: result.result.upstream_ref,
      storefrontId: input.session.storefrontOrigin?.storefrontId,
      channelId: input.session.storefrontOrigin?.channelId,
      supplierOperationId: operation.id,
      now: input.now,
    })
    await captureSnapshot(transaction, {
      bookingId: materialized.bookingId,
      entityModule: sourced.entityModule,
      entityId: sourced.entityId,
      sourceKind: sourced.sourceKind,
      sourceProvider: sourced.sourceProvider ?? undefined,
      sourceConnectionId: sourced.sourceConnectionId,
      sourceRef: result.result.upstream_ref,
      frozenPayload: {
        projection: sourced.projection,
        selection: safeSourcedSelection(input.session.statePayload),
        supplierEvidence: operation.safeEvidence,
        pricing: input.quote.pricing,
      },
      pricingBasis: pricingBasisFromBreakdown(input.quote.pricing),
      idempotencyKey: operation.adapterIdempotencyKey,
    })
    operation.bookingId = materialized.bookingId
    operation.updatedAt = input.now
    await operationRepository.save(operation)
    await input.consumeSources(
      transaction,
      materialized.bookingId,
      materialized.allocationIds,
      operation.id,
    )
    return {
      kind: "committed" as const,
      bookingId: materialized.bookingId,
      allocationIds: materialized.allocationIds,
      supplierOperationId: operation.id,
    }
  })
}

async function reopenSessionAfterSupplierFailure(
  deps: ProductionBookingSessionModuleDeps,
  sessionId: string,
  at: Date,
): Promise<void> {
  await deps.repository.withSessionTransaction(sessionId, async () => {
    const session = await deps.repository.getSession(sessionId)
    if (session?.state !== "supplier_pending") return
    session.state = "active"
    session.updatedAt = at
    await deps.repository.saveSession(session)
  })
}

async function resolveSourcedTarget(
  db: PostgresJsDatabase,
  session: CommitSourcedBookingInput["session"],
) {
  if (session.target.kind !== "catalog_item") return null
  const rows = await db
    .select()
    .from(catalogSourcedEntriesTable)
    .where(
      and(
        eq(catalogSourcedEntriesTable.entity_id, session.target.catalogItemId),
        eq(catalogSourcedEntriesTable.status, "active"),
      ),
    )
    .limit(2)
  if (rows.length !== 1) return null
  const row = rows[0]
  if (!row?.source_connection_id || !row.source_ref || row.source_kind === "owned") return null
  const title =
    stringValue(row.projection.name) ??
    stringValue(row.projection.title) ??
    `Sourced ${row.entity_module}`
  return {
    entityModule: row.entity_module,
    entityId: row.entity_id,
    sourceKind: row.source_kind,
    sourceProvider: row.source_provider,
    sourceConnectionId: row.source_connection_id,
    sourceRef: row.source_ref,
    projection: row.projection,
    title,
  }
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
  const command =
    input.access.actorKind === "staff" && input.access.staffBookingAuthority?.admitted
      ? applyStaffSelection(derived.command, input.session.statePayload)
      : derived.command

  const routeActions = createRouteActionRegistry()
  routeActions.register(FINANCE_BOOKING_CREATE_SELF_SERVICE_ROUTE_ACTION)
  const runtime = createSelfServiceCreateRuntime({
    resolveSource: () => ({
      async resolveBookingSource() {
        return {
          status: "ok" as const,
          command: command as never,
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
    ...(input.session.storefrontOrigin ? { storefront: input.session.storefrontOrigin } : {}),
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
  input: Pick<CommitOwnedBookingInput, "session" | "access">,
  tx: PostgresJsDatabase,
): Promise<SelfServiceBillingParty | null> {
  const contact = billingContact(input.session.statePayload)
  if (input.access.actorKind === "staff" && input.access.staffBookingAuthority?.admitted) {
    if (contact.personId || contact.organizationId) return contact
  }
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
  const staffBooking = asRecord(payload.staffBooking)
  const trim = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)
  return {
    personId: trim(staffBooking?.personId),
    organizationId: trim(staffBooking?.organizationId),
    contactFirstName: trim(contact?.firstName),
    contactLastName: trim(contact?.lastName),
    contactEmail: trim(contact?.email),
    contactPhone: trim(contact?.phone),
  }
}

function entityModuleForSession(target: CommitOwnedBookingInput["session"]["target"]) {
  if (target.kind === "product") return "products"
  if (target.kind === "owned_entity") return target.entityModule
  if (target.kind === "trip_snapshot") return "trips"
  return "catalog"
}

function entityIdForSession(target: CommitOwnedBookingInput["session"]["target"]) {
  if (target.kind === "product") return target.productId
  if (target.kind === "owned_entity") return target.entityId
  if (target.kind === "trip_snapshot") return target.tripSnapshotId
  return target.catalogItemId
}

function pricingBreakdownFromBasis(pricing: PricingBasis, policySource?: Record<string, unknown>) {
  const policyEvidence = policyEvidenceFromValues(policySource)
  const supplied = pricingBreakdownV1.safeParse(pricing.breakdown)
  if (supplied.success) {
    return policyEvidence ? { ...supplied.data, policyEvidence } : supplied.data
  }
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
    ...(policyEvidence ? { policyEvidence } : {}),
  }
}

function pricingBreakdownFromLiveValues(values: Record<string, unknown>) {
  const priceCents = numberValue(values.priceCents) ?? numberValue(values.price)
  const currency = stringValue(values.currency)
  if (priceCents == null || !currency) return null
  const taxes = numberValue(values.taxesCents) ?? 0
  const fees = numberValue(values.feesCents) ?? 0
  const surcharges = numberValue(values.surchargesCents) ?? 0
  const total = priceCents + taxes + fees + surcharges
  const policyEvidence = policyEvidenceFromValues(values)
  return {
    currency,
    lines: [
      {
        kind: "base" as const,
        label: "Base",
        quantity: 1,
        unitAmount: priceCents,
        totalAmount: priceCents,
      },
      ...(fees > 0
        ? [
            {
              kind: "fee" as const,
              label: "Fees",
              quantity: 1,
              unitAmount: fees,
              totalAmount: fees,
            },
          ]
        : []),
      ...(surcharges > 0
        ? [
            {
              kind: "fee" as const,
              label: "Surcharges",
              quantity: 1,
              unitAmount: surcharges,
              totalAmount: surcharges,
            },
          ]
        : []),
    ],
    taxes:
      taxes > 0 ? [{ code: "TAX", label: "Taxes", rate: 0, amount: taxes, base: priceCents }] : [],
    subtotal: priceCents + fees + surcharges,
    taxTotal: taxes,
    total,
    ...(policyEvidence ? { policyEvidence } : {}),
  }
}

function policyEvidenceFromValues(values?: Record<string, unknown>) {
  if (!values) return undefined
  const cancellation =
    values.cancellationSnapshot ??
    values.cancellation_snapshot ??
    values.cancellationPolicy ??
    values.cancellation_policy
  const bookingTerms = values.bookingTerms ?? values.booking_terms ?? values.terms
  if (cancellation === undefined && bookingTerms === undefined) return undefined
  return {
    ...(cancellation !== undefined ? { cancellation } : {}),
    ...(bookingTerms !== undefined ? { bookingTerms } : {}),
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

export function normalizeBookingSelection(
  _target: CommitOwnedBookingInput["session"]["target"],
  selection: Record<string, unknown>,
  access?: CommitOwnedBookingInput["access"],
): Record<string, unknown> {
  const source = asRecord(selection) ?? {}
  const { staffBooking: rawStaffBooking, ...customerSelection } = source
  rejectForbiddenSelection(customerSelection)
  if (
    rawStaffBooking !== undefined &&
    (access?.actorKind !== "staff" || !access.staffBookingAuthority?.admitted)
  ) {
    throw new InvalidBookingSessionSelectionError("forbidden_field", "selection.staffBooking")
  }
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
      sailingId: stringValue(configure?.sailingId),
      cabinCategoryId: stringValue(configure?.cabinCategoryId),
      cabinCategoryRef: normalizeSourceRef(configure?.cabinCategoryRef),
      occupancy: positiveInteger(configure?.occupancy),
      passengerComposition: normalizeStringNumberMap(asRecord(configure?.passengerComposition)),
      fareCode: stringValue(configure?.fareCode),
      fareVariant:
        configure?.fareVariant === "cruise_only" || configure?.fareVariant === "air_inclusive"
          ? configure.fareVariant
          : undefined,
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
    ...(rawStaffBooking !== undefined
      ? { staffBooking: normalizeBookingSessionStaffSelectionV1(rawStaffBooking) }
      : {}),
  })
}

export const normalizeProductSelection = normalizeBookingSelection

function sourcedParameters(
  payload: Record<string, unknown>,
  source: { entityModule: string; sourceKind: string; sourceProvider: string | null },
): Record<string, unknown> {
  const parameters = engineParametersFromDraft(undefined, payload, {
    entityModule: source.entityModule,
    sourceKind: source.sourceKind,
    sourceProvider: source.sourceProvider ?? undefined,
  })
  delete parameters.draft
  delete parameters.contact
  delete parameters.passengers
  return parameters
}

function safeSourcedSelection(payload: Record<string, unknown>): Record<string, unknown> {
  return pruneEmpty({
    configure: asRecord(payload.configure),
    accommodation: asRecord(payload.accommodation),
    addons: arrayValue(payload.addons),
  })
}

function supplierParty(payload: Record<string, unknown>) {
  const billing = asRecord(payload.billing)
  const contact = asRecord(billing?.contact)
  return {
    contact: pruneEmpty({
      firstName: stringValue(contact?.firstName),
      lastName: stringValue(contact?.lastName),
      email: stringValue(contact?.email),
      phone: stringValue(contact?.phone),
    }),
    passengers: sourcedTravelers(payload).map((traveler) => ({
      firstName: traveler.firstName,
      lastName: traveler.lastName,
      email: traveler.email,
      phone: traveler.phone,
      travelerCategory: traveler.category,
      isPrimary: traveler.isPrimary,
    })),
  }
}

function sourcedTravelers(payload: Record<string, unknown>): SourcedBookingTravelerInput[] {
  const travelers = arrayValue(payload.travelers) ?? []
  return travelers.flatMap((value, index) => {
    const traveler = asRecord(value)
    const firstName = stringValue(traveler?.firstName)
    const lastName = stringValue(traveler?.lastName)
    if (!firstName || !lastName) return []
    const rawCategory = stringValue(traveler?.travelerCategory) ?? stringValue(traveler?.band)
    const category =
      rawCategory === "adult" ||
      rawCategory === "child" ||
      rawCategory === "infant" ||
      rawCategory === "senior" ||
      rawCategory === "other"
        ? rawCategory
        : null
    return [
      {
        firstName,
        lastName,
        email: stringValue(traveler?.email) ?? null,
        phone: stringValue(traveler?.phone) ?? null,
        category,
        isPrimary: traveler?.isPrimary === true || index === 0,
      },
    ]
  })
}

function supplierQuantity(payload: Record<string, unknown>): number {
  const configure = asRecord(payload.configure)
  return positiveInteger(configure?.occupancy) ?? (sourcedTravelers(payload).length || 1)
}

function supplierServiceDate(payload: Record<string, unknown> | undefined): string | null {
  const evidence = asRecord(payload?.upstreamPayload) ?? payload
  const sailing = asRecord(evidence?.sailing)
  const value = stringValue(sailing?.departureDate)
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function supplierEndDate(payload: Record<string, unknown> | undefined): string | null {
  const evidence = asRecord(payload?.upstreamPayload) ?? payload
  const sailing = asRecord(evidence?.sailing)
  const value = stringValue(sailing?.returnDate)
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function normalizeSourceRef(value: unknown): Record<string, unknown> | undefined {
  const sourceRef = asRecord(value)
  if (!sourceRef) return undefined
  const externalId = stringValue(sourceRef.externalId)
  if (!externalId) return undefined
  return pruneEmpty({ externalId, connectionId: stringValue(sourceRef.connectionId) })
}

function applyStaffSelection(
  baseCommand: Record<string, unknown>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const staffBooking = asRecord(payload.staffBooking)
  return staffBooking ? applyBookingSessionStaffSelectionV1(baseCommand, staffBooking) : baseCommand
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
    travelerCategory: stringValue(record.travelerCategory),
    isPrimary: record.isPrimary === true ? true : undefined,
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

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string" || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
