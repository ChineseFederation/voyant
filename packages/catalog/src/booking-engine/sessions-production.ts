import type { BookingsRelationshipsRuntime } from "@voyant-travel/bookings/runtime-port"
import {
  createSourcedBookingCommitment,
  type SourcedBookingTravelerInput,
} from "@voyant-travel/bookings/service-sourced-commitment"
import {
  DEFAULT_PAX_BANDS,
  DEFAULT_PAYMENT_INTENTS,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
  paxBandBaseCode,
  paxBandsAllowedTotalFrom,
} from "@voyant-travel/catalog-contracts/booking-engine/requirements-defaults"
import {
  BOOKING_SELECTION_PRIVILEGED_KEYS,
  BOOKING_SELECTION_PUBLIC_KEYS,
} from "@voyant-travel/catalog-contracts/booking-engine/selection-contracts"
import { bookingSessionAudienceForActorV1 } from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"
import type { AnalyticsPort } from "@voyant-travel/core/analytics"
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
import type { BookingRequirementsV1 } from "./contracts.js"
import { pricingBreakdownV1 } from "./contracts.js"
import type {
  ComputeQuoteRequest,
  OwnedBookingHandlerRegistry,
  OwnedQuoteScope,
  SelfServiceBillingParty,
} from "./owned-handler.js"
import { engineParametersFromSelection } from "./quote-support.js"
import type { SourceAdapterRegistry } from "./registry.js"
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
  type ComposeBookingRequirementsResult,
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
  /** Host-bound product analytics. Absent means unbound — see `./analytics.ts`. */
  analytics?: AnalyticsPort
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
    ...(deps.analytics ? { analytics: deps.analytics } : {}),
    ports: {
      repository: deps.repository,
      normalizeSelection: async ({ selection, target, access }) =>
        normalizeBookingSelection(target, selection, access),
      composeRequirements: async (input) => {
        const { session } = input
        if (session.target.kind === "trip_snapshot") {
          const handler = await deps.resolveCompositeHandler?.()
          return (
            (handler ? await handler.composeRequirements({ ...input, leaf }) : undefined) ?? {
              status: "unavailable",
              reason: "target_not_bookable",
              nextAction: "contact_operator",
            }
          )
        }
        return leaf.composeRequirements(input)
      },
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
  const composeRequirements: BookingSessionCompositeLeafRuntime["composeRequirements"] = async ({
    session,
    tx,
  }) => {
    // Session creation runs before a Session row exists, so there is no
    // open Session transaction to borrow. Requirements derivation only
    // reads, so falling back to the module's connection is safe.
    const db = (tx as PostgresJsDatabase | undefined) ?? deps.db
    if (session.target.kind === "catalog_item") {
      const sourced = await resolveSourcedTarget(db, session)
      return sourced
        ? { status: "available", requirements: sourcedBookingRequirements() }
        : unavailableRequirementsResult("product_not_found")
    }
    if (session.target.kind === "trip_snapshot") {
      return unavailableRequirementsResult("unsupported_target")
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
    const result = await handler.computeRequirements(
      { db, adapterContext: {} as never },
      ownedComputeRequest(handler.entityModule, session),
    )
    return "requirements" in result
      ? { status: "available", requirements: result.requirements }
      : unavailableRequirementsResult(result.reason)
  }

  return {
    composeRequirements,
    async composeQuote({ session, now, tx }) {
      // The stateless Offer Preview quotes without a Session row, so there is
      // no open Session transaction to borrow. Quoting only reads, so falling
      // back to the module's connection is safe — the same fallback
      // `composeRequirements` already makes for Session creation.
      const db = (tx as PostgresJsDatabase | undefined) ?? deps.db
      if (session.target.kind === "catalog_item") {
        return composeSourcedQuote(deps, session, db)
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
        { db, adapterContext: {} as never },
        ownedComputeRequest(handler.entityModule, session),
      )
      // The handler builds the descriptor unconditionally, precisely so a
      // pricing failure cannot collapse it. Carry it through both exits.
      const requirements = result.requirements
      if (!result.available || !result.pricing) {
        return { ...unavailableQuoteResult(result.invalidReason), requirements }
      }
      // A priced target always has a resolvable descriptor. Ask the same
      // derivation directly rather than dropping a good quote if a handler
      // omitted it from its quote result.
      let quoted = requirements
      if (!quoted) {
        const resolved = await composeRequirements({ session, now, tx })
        if (resolved.status === "available") quoted = resolved.requirements
      }
      if (!quoted) return unavailableQuoteResult(result.invalidReason)
      return {
        status: "quoted",
        requirements: quoted,
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
      const parameters = engineParametersFromSelection(undefined, session.statePayload, {
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
  // The target resolved, so every exit below can still render a wizard.
  const requirements = sourcedBookingRequirements()
  const registry = await deps.resolveSourceRegistry()
  const adapter = registry.resolveByConnection(sourced.sourceConnectionId)
  if (!adapter?.capabilities.supportsLiveResolution || !adapter.liveResolve) {
    return { ...unavailableQuoteResult("no_sell_amount_configured"), requirements }
  }
  const result = await adapter.liveResolve(
    { connection_id: sourced.sourceConnectionId },
    {
      ids: [sourced.entityId],
      source_refs: { [sourced.entityId]: sourced.sourceRef },
      scope: quotingScope(session),
      parameters: sourcedParameters(session.statePayload, sourced),
    },
  )
  const liveValues = result.values[sourced.entityId]
  if (result.failed?.[sourced.entityId] || !liveValues) {
    return { ...unavailableQuoteResult("selection_unavailable"), requirements }
  }
  const pricing = pricingBreakdownFromLiveValues(liveValues)
  return pricing
    ? { status: "quoted" as const, requirements, pricing }
    : { ...unavailableQuoteResult("no_sell_amount_configured"), requirements }
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
    scope: quotingScope(input.session),
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
        subjectType: "booking_session",
        subjectId: input.session.id,
        sessionId: input.session.id,
        scopeKey: input.supplierOperationScope,
        quoteId: input.quote.id,
        ...(input.hold ? { holdId: input.hold.id } : {}),
        idempotencyKey: input.idempotencyKey,
        operationKind: "reserve",
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
    await reopenSessionAfterSupplierFailure(deps, input.session.id, input.now)
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
      contactCountry: billing.contactCountry,
      contactRegion: billing.contactRegion,
      contactCity: billing.contactCity,
      contactAddressLine1: billing.contactAddressLine1,
      contactAddressLine2: billing.contactAddressLine2,
      contactPostalCode: billing.contactPostalCode,
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
      cancellationTermsEvidence: cancellationTermsEvidence(input.quote, "supplier_quote"),
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
  const derivedCommand =
    input.access.actorKind === "staff" && input.access.staffBookingAuthority?.admitted
      ? applyStaffSelection(derived.command, input.session.statePayload)
      : derived.command
  const termsEvidence = cancellationTermsEvidence(input.quote, "booking_quote")
  const command = {
    ...derivedCommand,
    ...(termsEvidence ? { cancellationTermsEvidence: termsEvidence } : {}),
  }

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
  const result = await runtime.createFromSession({
    db: tx,
    sessionId: input.session.id,
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
  const address = asRecord(billing?.address)
  const staffBooking = asRecord(payload.staffBooking)
  const trim = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)
  return {
    personId: trim(staffBooking?.personId),
    organizationId: trim(staffBooking?.organizationId),
    contactFirstName: trim(contact?.firstName),
    contactLastName: trim(contact?.lastName),
    contactEmail: trim(contact?.email),
    contactPhone: trim(contact?.phone),
    contactCountry: trim(address?.country),
    contactRegion: trim(address?.region),
    contactCity: trim(address?.city),
    contactAddressLine1: trim(address?.line1),
    contactAddressLine2: trim(address?.line2),
    contactPostalCode: trim(address?.postal),
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

function cancellationTermsEvidence(
  quote: CommitOwnedBookingInput["quote"] | CommitSourcedBookingInput["quote"],
  source: "booking_quote" | "supplier_quote",
) {
  const policy = quote.pricing.policyEvidence?.cancellation
  if (policy === undefined) return null
  return {
    schemaVersion: 1 as const,
    source,
    sourceId: quote.id,
    capturedAt: quote.quotedAt.toISOString(),
    policy,
  }
}

function ownedComputeRequest(
  entityModule: string,
  session: CommitOwnedBookingInput["session"],
): ComputeQuoteRequest {
  return {
    entityModule,
    entityId: entityIdForSession(session.target),
    draft: session.statePayload,
    parameters: engineParametersFromSelection(undefined, session.statePayload, {
      entityModule,
      sourceKind: "owned",
    }),
    scope: quotingScope(session),
  }
}

/**
 * The scope a Session quotes and reserves in.
 *
 * `locale`, `market` and `currency` come from the Session's own commercial
 * scope, which the caller chose at create. `audience` does NOT: it is derived
 * from who owns the Session, so a public caller cannot request staff-audience
 * pricing or staff-visible content by putting `audience` on the wire. That
 * derivation is why `bookingSessionScopeV1` has no `audience` field.
 */
function quotingScope(session: CommitOwnedBookingInput["session"]): OwnedQuoteScope {
  return {
    locale: session.scope.locale,
    market: session.scope.market,
    audience: bookingSessionAudienceForActorV1(session.actorKind),
    ...(session.scope.currency ? { currency: session.scope.currency } : {}),
  }
}

/**
 * Baseline descriptor for a sourced (`catalog_item`) target. The source
 * adapter contract has no requirements primitive yet, so a sourced row gets
 * the engine defaults: one Configure occupancy sub-step over the canonical
 * pax bands, the standard traveler + billing fields, and the full payment
 * intent set the deployment's capabilities then narrow.
 */
function sourcedBookingRequirements(): BookingRequirementsV1 {
  return {
    ...defaultRequirementsFlags(),
    configureSubSteps: [{ kind: "occupancy", bands: DEFAULT_PAX_BANDS }],
    paxBands: DEFAULT_PAX_BANDS,
    paxBandsAllowedTotal: paxBandsAllowedTotalFrom(DEFAULT_PAX_BANDS),
    travelerFields: defaultTravelerFields(),
    bookingFields: defaultBookingFields(),
    paymentIntents: DEFAULT_PAYMENT_INTENTS,
  }
}

function unavailableRequirementsResult(
  invalidReason: string | undefined,
): ComposeBookingRequirementsResult {
  const { reason, nextAction } = unavailableQuoteResult(invalidReason)
  return { status: "unavailable", reason, nextAction }
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

/**
 * Admit a client selection into the Session's server-owned state.
 *
 * Two gates, both derived from the selection contracts rather than from a
 * list maintained here:
 *
 * 1. Default-deny on the public schema. A top-level key
 *    `bookingSelectionPublicV1` does not declare is rejected, not dropped, so
 *    a field nobody has admitted deliberately cannot ride in.
 * 2. Privileged keys (`BOOKING_SELECTION_PRIVILEGED_KEYS` — the operator-only
 *    and engine-owned schemas plus reserved commit-side vocabulary) are
 *    rejected at any depth, because nesting is exactly how they would
 *    otherwise reach the commit-side command merge.
 *
 * Operator choices are not banned, only re-routed: they arrive under
 * `selection.staffBooking` and are parsed against finance's staff schema
 * after the staff booking authority gate passes.
 *
 * The passport / `documentClass` rejection stays hand-written: it is a PII
 * rule about plaintext travel documents, not a statement about selection
 * shape, and no schema expresses it.
 *
 * Value shape stays lenient below the top level — the wizard PATCHes
 * half-filled steps — so unknown *nested* keys are projected away rather than
 * rejected. The schema is authoritative about which keys exist; the
 * projection below is authoritative about what a value may look like.
 */
export function normalizeBookingSelection(
  _target: CommitOwnedBookingInput["session"]["target"],
  selection: Record<string, unknown>,
  access?: CommitOwnedBookingInput["access"],
): Record<string, unknown> {
  const source = asRecord(selection) ?? {}
  const { staffBooking: rawStaffBooking, ...publicSelection } = source
  rejectNonPublicSelection(publicSelection)
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
      // The whole declared address, not just the country. The tracer
      // (voyant#4039) projected the rest away, so a caller that filled the
      // billing step lost every line of it at the Session edge and the
      // Booking's contact_* columns came back empty. `region` is new
      // (voyant#4290); the other four were declared all along and simply
      // never survived to the commit.
      address: pruneEmpty({
        line1: stringValue(billingAddress?.line1),
        line2: stringValue(billingAddress?.line2),
        city: stringValue(billingAddress?.city),
        region: stringValue(billingAddress?.region),
        postal: stringValue(billingAddress?.postal),
        country: stringValue(billingAddress?.country),
      }),
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
  const parameters = engineParametersFromSelection(undefined, payload, {
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
    // A pax band can be tier-qualified per product ("child:pricing_…");
    // the sourced commitment only carries the canonical category.
    const rawBand = stringValue(traveler?.travelerCategory) ?? stringValue(traveler?.band)
    const rawCategory = rawBand == null ? null : paxBandBaseCode(rawBand)
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

/**
 * Default-deny against the public selection schema, then the recursive
 * privileged / PII sweep. Adding a field to `bookingSelectionPublicV1` is the
 * only way to widen what a Session admits.
 */
function rejectNonPublicSelection(selection: Record<string, unknown>): void {
  for (const key of Object.keys(selection)) {
    if (!BOOKING_SELECTION_PUBLIC_KEYS.has(key)) {
      throw new InvalidBookingSessionSelectionError("forbidden_field", `selection.${key}`)
    }
  }
  rejectPrivilegedSelection(selection)
}

function rejectPrivilegedSelection(value: unknown, path = "selection"): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      rejectPrivilegedSelection(item, `${path}.${index}`)
    }
    return
  }
  if (!value || typeof value !== "object") return
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (
      BOOKING_SELECTION_PRIVILEGED_KEYS.has(key) ||
      /passport|documentClass|document_class/i.test(key)
    ) {
      throw new InvalidBookingSessionSelectionError("forbidden_field", `${path}.${key}`)
    }
    rejectPrivilegedSelection(item, `${path}.${key}`)
  }
}

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
