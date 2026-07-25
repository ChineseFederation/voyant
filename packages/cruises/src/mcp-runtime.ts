import {
  type ActionLedgerRequestContextValues,
  type ExecuteAdmittedCreatedTargetCommandInput,
  type ExecuteCreatedTargetCommandHandlers,
  type ExecuteCreatedTargetCommandResult,
  executeAdmittedCreatedTargetCommand,
  mapActionLedgerRequestContext,
} from "@voyant-travel/action-ledger"
import type { EventBus } from "@voyant-travel/core"
import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import { defineToolContextContribution, ToolError } from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import type { CruiseAdapter, ExternalSailing, ExternalShip, SourceRef } from "./adapters/index.js"
import { resolveCruiseAdapter } from "./adapters/registry.js"
import {
  CRUISE_CREATED_TARGET_POLICY,
  CRUISE_SHIP_CREATED_TARGET_POLICY,
} from "./created-target-policy.js"
import { makeExternalSourceKey, parseUnifiedKey, sourceRefFromExternalKeyRef } from "./lib/key.js"
import {
  passengerCompositionMatches,
  passengerCountFromComposition,
  sourceRefFromPayload,
  sourceRefMatches,
} from "./routes-booking-payloads.js"
import { cruisesService } from "./service.js"
import { cruisesBookingService } from "./service-bookings.js"
import { composeQuote, pricingService } from "./service-pricing.js"
import { cruisesSearchService } from "./service-search.js"
import type { CruisesToolServices } from "./tools.js"
import type { InsertCruise } from "./validation-core.js"

export * from "./tools.js"

type CruisesToolRequestEnv = {
  Variables: ActionLedgerRequestContextValues & { eventBus?: EventBus }
}

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["cruises"],
  contribute({ request, context }) {
    const c = request as Context<CruisesToolRequestEnv>
    const db = context.db as PostgresJsDatabase
    const eventBus = c.get("eventBus")
    const userId = c.get("userId") ?? undefined
    const requestContext = cruisesActionLedgerContext(c)
    const publicOnly = context.actor !== "staff"
    const execute: CruisesToolServices["execute"] = async (operation, input, admitted) => {
      const args = input as Record<string, unknown>
      switch (operation) {
        case "searchCruises":
          return searchCruises(db, args, publicOnly)
        case "getCruise":
          return getCruise(db, String(args.slug), publicOnly)
        case "getSailing":
          return getSailing(db, String(args.key), publicOnly)
        case "getShip":
          return getShip(db, String(args.key), publicOnly)
        case "quoteSailing":
          return quoteSailing(db, args, publicOnly)
        case "createCruise": {
          if (!admitted) {
            throw new ToolError(
              "Created cruise action policy is required.",
              "ACTION_POLICY_REQUIRED",
            )
          }
          const { idempotencyKey: legacyIdempotencyKey, ...commandInput } = args
          const result = await executeCruiseCreate(
            db,
            requestContext,
            typeof legacyIdempotencyKey === "string" ? legacyIdempotencyKey : undefined,
            commandInput as InsertCruise,
            admitted,
          )
          return { status: "created" as const, cruise: result.value, replayed: result.replayed }
        }
        case "updateCruise": {
          const { id, ...data } = args
          return cruisesService.updateCruise(db, String(id), data as never, { eventBus })
        }
        case "upsertSailing":
          return cruisesService.upsertSailing(db, args as never)
        case "updateSailing": {
          const { id, ...data } = args
          return cruisesService.updateSailing(db, String(id), data as never)
        }
        case "createShip": {
          if (!admitted) {
            throw new ToolError(
              "Created cruise ship action policy is required.",
              "ACTION_POLICY_REQUIRED",
            )
          }
          const { idempotencyKey: legacyIdempotencyKey, ...commandInput } = args
          const result = await executeCruiseShipCreate(
            db,
            requestContext,
            typeof legacyIdempotencyKey === "string" ? legacyIdempotencyKey : undefined,
            commandInput,
            admitted,
            async (tx) => {
              const row = await cruisesService.createShip(tx, commandInput as never)
              return { id: row.id }
            },
          )
          return { status: "created" as const, ship: result.value, replayed: result.replayed }
        }
        case "updateShip": {
          const { id, ...data } = args
          return cruisesService.updateShip(db, String(id), data as never)
        }
        case "createBooking":
          return createBooking(db, args, userId)
      }
    }
    return { cruises: { execute } }
  },
})

type CruiseShipCreatedCommandExecutor = (
  input: ExecuteAdmittedCreatedTargetCommandInput<string>,
  handlers: ExecuteCreatedTargetCommandHandlers<{ id: string }, string>,
) => Promise<ExecuteCreatedTargetCommandResult<{ id: string }, string>>

type CruiseCreatedCommandExecutor = CruiseShipCreatedCommandExecutor

export async function executeCruiseCreate(
  db: PostgresJsDatabase,
  context: ActionLedgerRequestContextValues,
  legacyIdempotencyKey: string | undefined,
  commandInput: InsertCruise,
  admitted: import("@voyant-travel/tools").ToolHandlerActionPolicyContext,
  testHooks?: {
    /** Test-only failure/concurrency seam inside the handler-owned transaction. */
    afterRequiredProjection?: (tx: PostgresJsDatabase, cruiseId: string) => Promise<void>
  },
  executor: CruiseCreatedCommandExecutor = executeAdmittedCreatedTargetCommand,
) {
  const principal = mapActionLedgerRequestContext(context)
  if (principal.principalId === "unknown_request") {
    throw new TypeError("Cruise created-target commands require a concrete principal")
  }
  admittedCreatedCommandIdempotencyKey(admitted, legacyIdempotencyKey)
  const policy = CRUISE_CREATED_TARGET_POLICY
  return executor(
    {
      db,
      context,
      admitted,
      idempotencyKey: legacyIdempotencyKey,
      commandTargetType: policy.commandTargetType,
      canonicalTargetType: policy.canonicalTargetType,
      resultReferenceType: policy.resultReferenceType,
      commandInput,
      evaluatedRisk: policy.evaluatedRisk,
    },
    {
      async create(tx) {
        const transaction = tx as PostgresJsDatabase
        const row = await cruisesService.createCruise(transaction, commandInput, {
          projection: "required",
        })
        await testHooks?.afterRequiredProjection?.(transaction, row.id)
        await insertOutboxEvents(tx, [
          {
            name: "cruise.created",
            data: { id: row.id },
            metadata: {
              eventId: cruiseCreatedEventId(row.id),
              category: "domain",
              source: "service",
            },
          },
        ])
        return { value: { id: row.id }, targetId: row.id }
      },
      async replay(_tx, result) {
        return { id: result.reference.id }
      },
    },
  )
}

export async function executeCruiseShipCreate(
  db: PostgresJsDatabase,
  context: ActionLedgerRequestContextValues,
  legacyIdempotencyKey: string | undefined,
  commandInput: unknown,
  admitted: import("@voyant-travel/tools").ToolHandlerActionPolicyContext,
  create: (tx: PostgresJsDatabase) => Promise<{ id: string }>,
  executor: CruiseShipCreatedCommandExecutor = executeAdmittedCreatedTargetCommand,
) {
  const principal = mapActionLedgerRequestContext(context)
  if (principal.principalId === "unknown_request") {
    throw new TypeError("Cruise ship created-target commands require a concrete principal")
  }
  admittedCreatedCommandIdempotencyKey(admitted, legacyIdempotencyKey)
  const policy = CRUISE_SHIP_CREATED_TARGET_POLICY
  return executor(
    {
      db,
      context,
      admitted,
      idempotencyKey: legacyIdempotencyKey,
      commandTargetType: policy.commandTargetType,
      canonicalTargetType: policy.canonicalTargetType,
      resultReferenceType: policy.resultReferenceType,
      commandInput,
      evaluatedRisk: policy.evaluatedRisk,
    },
    {
      async create(tx) {
        const value = await create(tx as PostgresJsDatabase)
        return { value, targetId: value.id }
      },
      async replay(_tx, result) {
        return { id: result.reference.id }
      },
    },
  )
}

export function cruiseCreatedEventId(cruiseId: string): string {
  return `evt_cruises_cruise_created_${cruiseId}`
}

function admittedCreatedCommandIdempotencyKey(
  admitted: import("@voyant-travel/tools").ToolHandlerActionPolicyContext,
  legacyIdempotencyKey: string | undefined,
): string {
  const idempotencyKey = admitted.invocation.idempotencyKey?.trim()
  if (!idempotencyKey) {
    throw new ToolError(
      "Created-target command idempotency must come from the admitted Tool invocation.",
      "ACTION_POLICY_REQUIRED",
      { capabilityId: admitted.capabilityId },
    )
  }
  if (legacyIdempotencyKey !== undefined && legacyIdempotencyKey !== idempotencyKey) {
    throw new ToolError(
      "The legacy top-level idempotency key does not match the admitted Tool invocation.",
      "INVALID_INPUT",
      { capabilityId: admitted.capabilityId },
    )
  }
  return idempotencyKey
}

function cruisesActionLedgerContext(
  c: Context<CruisesToolRequestEnv>,
): ActionLedgerRequestContextValues {
  return {
    userId: c.get("userId") ?? null,
    agentId: c.get("agentId") ?? null,
    workflowPrincipalId: c.get("workflowPrincipalId") ?? null,
    principalSubtype: c.get("principalSubtype") ?? null,
    sessionId: c.get("sessionId") ?? null,
    apiTokenId: c.get("apiTokenId") ?? c.get("apiKeyId") ?? null,
    callerType: c.get("callerType") ?? null,
    actor: c.get("actor") ?? null,
    isInternalRequest: c.get("isInternalRequest") ?? false,
    organizationId: c.get("organizationId") ?? null,
    workflowRunId: c.get("workflowRunId") ?? null,
    workflowStepId: c.get("workflowStepId") ?? null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
  }
}

async function searchCruises(
  db: PostgresJsDatabase,
  query: Record<string, unknown>,
  publicOnly: boolean,
) {
  const result = await cruisesSearchService.query(db, query as never)
  const visible = await Promise.all(
    result.data.map(async (row) => {
      if (row.source === "local") {
        if (!publicOnly) return row
        const cruise = row.localCruiseId
          ? await cruisesService.getCruiseById(db, row.localCruiseId)
          : null
        return cruise?.status === "live" ? row : null
      }
      if (!row.sourceProvider || !row.sourceRef) return null
      const adapter = resolveCruiseAdapter(row.sourceProvider)
      if (!adapter) return null
      if (!publicOnly) return row
      const cruise = await adapter.fetchCruise(validSourceRef(row.sourceRef)).catch(() => null)
      return cruise && (!cruise.status || cruise.status === "live") ? row : null
    }),
  )
  const data = visible.filter((row) => row !== null)
  return { ...result, data, total: data.length }
}

async function getCruise(db: PostgresJsDatabase, slug: string, publicOnly: boolean) {
  const indexEntry = await cruisesSearchService.getBySlug(db, slug)
  if (!indexEntry) return null

  if (indexEntry.source === "local" && indexEntry.localCruiseId) {
    const cruise = await cruisesService.getCruiseById(db, indexEntry.localCruiseId, {
      withSailings: true,
      withDays: true,
    })
    if (!cruise || (publicOnly && cruise.status !== "live")) return null
    return {
      summary: normalizeIndexSummary(indexEntry),
      status: cruise.status,
      description: cruise.description,
      shortDescription: cruise.shortDescription,
      highlights: cruise.highlights ?? [],
      sailings: (cruise.sailings ?? []).map(normalizeLocalSailing),
    }
  }

  if (indexEntry.source === "external" && indexEntry.sourceProvider && indexEntry.sourceRef) {
    const ref = validSourceRef(indexEntry.sourceRef)
    const adapter = requiredAdapter(indexEntry.sourceProvider)
    const [cruise, sailings] = await Promise.all([
      adapter.fetchCruise(ref),
      adapter.listSailingsForCruise(ref),
    ])
    if (!cruise || (publicOnly && cruise.status && cruise.status !== "live")) return null
    return {
      summary: normalizeIndexSummary(indexEntry),
      status: cruise.status ?? "live",
      description: cruise.description ?? null,
      shortDescription: cruise.shortDescription ?? null,
      highlights: cruise.highlights ?? [],
      sailings: sailings.map((sailing) => normalizeExternalSailing(adapter, sailing)),
    }
  }

  throw new ToolError("Cruise search projection entry is invalid", "INVALID_INPUT")
}

async function getSailing(db: PostgresJsDatabase, key: string, publicOnly: boolean) {
  const parsed = parseUnifiedKey(key)
  if (parsed.kind === "invalid") throw new ToolError("Invalid cruise sailing key", "INVALID_INPUT")
  if (parsed.kind === "external") {
    const adapter = requiredAdapter(parsed.provider)
    const sailing = await adapter.fetchSailing(sourceRefFromExternalKeyRef(parsed.ref))
    if (!sailing) return null
    if (publicOnly) {
      const cruise = await adapter.fetchCruise(sailing.cruiseRef)
      if (!cruise || (cruise.status && cruise.status !== "live")) return null
    }
    return normalizeExternalSailing(adapter, sailing)
  }
  const sailing = await cruisesService.getSailingById(db, parsed.id)
  if (!sailing) return null
  if (publicOnly) {
    const cruise = await cruisesService.getCruiseById(db, sailing.cruiseId)
    if (cruise?.status !== "live") return null
  }
  return normalizeLocalSailing(sailing)
}

async function getShip(db: PostgresJsDatabase, key: string, publicOnly: boolean) {
  const parsed = parseUnifiedKey(key)
  if (parsed.kind === "invalid") throw new ToolError("Invalid cruise ship key", "INVALID_INPUT")
  if (parsed.kind === "external") {
    const adapter = requiredAdapter(parsed.provider)
    const ship = await adapter.fetchShip(sourceRefFromExternalKeyRef(parsed.ref))
    return ship ? normalizeExternalShip(adapter, ship) : null
  }
  const ship = await cruisesService.getShipById(db, parsed.id)
  return ship && (!publicOnly || ship.isActive) ? normalizeLocalShip(ship) : null
}

async function quoteSailing(
  db: PostgresJsDatabase,
  args: Record<string, unknown>,
  publicOnly: boolean,
) {
  const parsed = parseUnifiedKey(String(args.key))
  if (parsed.kind === "invalid") throw new ToolError("Invalid cruise sailing key", "INVALID_INPUT")
  const composition = args.passengerComposition as
    | { adults: number; children?: number; infants?: number; seniors?: number }
    | null
    | undefined
  const guestCount = Number(args.guestCount ?? passengerCountFromComposition(composition))
  if (!Number.isInteger(guestCount) || guestCount < 1) {
    throw new ToolError(
      "Provide guestCount or passengerComposition for cruise quotes",
      "INVALID_INPUT",
    )
  }

  if (parsed.kind === "local") {
    if (publicOnly) {
      const sailing = await cruisesService.getSailingById(db, parsed.id)
      const cruise = sailing ? await cruisesService.getCruiseById(db, sailing.cruiseId) : null
      if (!sailing || !cruise || cruise.status !== "live") {
        throw new ToolError("Cruise sailing not found", "NOT_FOUND")
      }
    }
    return pricingService.assembleQuote(db, {
      sailingId: parsed.id,
      cabinCategoryId: String(args.cabinCategoryId),
      occupancy: Number(args.occupancy),
      guestCount,
      fareCode: (args.fareCode as string | null | undefined) ?? null,
      fareVariant: (args.fareVariant as "cruise_only" | "air_inclusive" | null | undefined) ?? null,
    })
  }

  const adapter = requiredAdapter(parsed.provider)
  const sailingRef = sourceRefFromExternalKeyRef(parsed.ref)
  if (publicOnly) {
    const sailing = await adapter.fetchSailing(sailingRef)
    const cruise = sailing ? await adapter.fetchCruise(sailing.cruiseRef) : null
    if (!sailing || !cruise || (cruise.status && cruise.status !== "live")) {
      throw new ToolError("Cruise sailing not found", "NOT_FOUND")
    }
  }
  const prices = await adapter.fetchSailingPricing(sailingRef)
  const cabinCategoryRef = sourceRefFromPayload(
    args.cabinCategoryRef as Record<string, unknown> | null | undefined,
    String(args.cabinCategoryId),
  )
  const matching = prices.find(
    (price) =>
      sourceRefMatches(price.cabinCategoryRef, cabinCategoryRef) &&
      price.occupancy === Number(args.occupancy) &&
      passengerCompositionMatches(price.passengerComposition, composition) &&
      (!args.fareCode || price.fareCode === args.fareCode) &&
      (!args.fareVariant || price.fareVariant === args.fareVariant),
  )
  if (!matching) throw new ToolError("No matching cruise price is available", "NOT_FOUND")
  return composeQuote({
    price: {
      pricePerPerson: matching.pricePerPerson,
      originalPricePerPerson: matching.originalPricePerPerson ?? null,
      secondGuestPricePerPerson: matching.secondGuestPricePerPerson ?? null,
      singlePricePerPerson: matching.singlePricePerPerson ?? null,
      singleSupplementPercent: matching.singleSupplementPercent ?? null,
      currency: matching.currency,
      fareCode: matching.fareCode ?? null,
      fareCodeName: matching.fareCodeName ?? null,
      fareVariant: matching.fareVariant ?? "cruise_only",
      earlyBookingDeadline: matching.earlyBookingDeadline ?? null,
      earlyBookingBonusDescription: matching.earlyBookingBonusDescription ?? null,
    },
    components: (matching.components ?? []).map((component) => ({
      kind: component.kind,
      label: component.label ?? null,
      amount: component.amount,
      currency: component.currency,
      direction: component.direction,
      perPerson: component.perPerson,
    })),
    occupancy: Number(args.occupancy),
    guestCount,
    bookingTerms: matching.bookingTerms ?? null,
  })
}

async function createBooking(
  db: PostgresJsDatabase,
  args: Record<string, unknown>,
  userId?: string,
) {
  const parsed = parseUnifiedKey(String(args.key))
  if (parsed.kind === "invalid") throw new ToolError("Invalid cruise sailing key", "INVALID_INPUT")
  const {
    key: _key,
    cabinCategoryRef: rawCabinCategoryRef,
    passengerComposition,
    ...payload
  } = args
  const result =
    parsed.kind === "external"
      ? await cruisesBookingService.createExternalCruiseBooking(
          db,
          {
            ...payload,
            adapter: requiredAdapter(parsed.provider),
            sailingRef: sourceRefFromExternalKeyRef(parsed.ref),
            cabinCategoryRef: sourceRefFromPayload(
              rawCabinCategoryRef as Record<string, unknown> | null | undefined,
              String(args.cabinCategoryId),
            ),
            passengerComposition,
          } as never,
          userId,
        )
      : await cruisesBookingService.createCruiseBooking(
          db,
          { ...payload, sailingId: parsed.id } as never,
          userId,
        )
  return {
    bookingId: result.bookingId,
    bookingNumber: result.bookingNumber,
    sourceProvider: "sourceProvider" in result ? result.sourceProvider : null,
    connectorBookingRef: result.cruiseDetails.connectorBookingRef ?? null,
    quote: result.quote,
  }
}

function requiredAdapter(name: string): CruiseAdapter {
  const adapter = resolveCruiseAdapter(name)
  if (!adapter) {
    throw new ToolError(`Selected cruise provider '${name}' is unavailable`, "MISSING_SERVICE", {
      service: name,
    })
  }
  return adapter
}

function validSourceRef(value: unknown): SourceRef {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as { externalId?: unknown }).externalId !== "string"
  ) {
    throw new ToolError("Cruise source reference is invalid", "INVALID_INPUT")
  }
  return value as SourceRef
}

function normalizeIndexSummary(
  row: NonNullable<Awaited<ReturnType<typeof cruisesSearchService.getBySlug>>>,
) {
  return {
    source: row.source,
    sourceProvider: row.sourceProvider,
    sourceRef: row.sourceRef,
    key:
      row.source === "external" && row.sourceProvider && row.sourceRef
        ? makeExternalSourceKey(row.sourceProvider, validSourceRef(row.sourceRef))
        : (row.localCruiseId ?? row.id),
    name: row.name,
    slug: row.slug,
    cruiseType: row.cruiseType,
    lineName: row.lineName,
    shipName: row.shipName || null,
    nights: row.nights,
    embarkPortName: row.embarkPortName,
    disembarkPortName: row.disembarkPortName,
    regions: row.regions ?? [],
    themes: row.themes ?? [],
    earliestDeparture: row.earliestDeparture,
    latestDeparture: row.latestDeparture,
    lowestPriceCents: row.lowestPriceCents,
    lowestPriceCurrency: row.lowestPriceCurrency,
    heroImageUrl: row.heroImageUrl,
  }
}

function normalizeLocalSailing(
  sailing: NonNullable<Awaited<ReturnType<typeof cruisesService.getSailingById>>>,
) {
  return {
    source: "local" as const,
    sourceProvider: null,
    sourceRef: null,
    key: sailing.id,
    cruiseKey: sailing.cruiseId,
    shipKey: sailing.shipId,
    departureDate: sailing.departureDate,
    returnDate: sailing.returnDate,
    embarkPortName: null,
    disembarkPortName: null,
    direction: sailing.direction,
    isCharter: sailing.isCharter,
    salesStatus: sailing.salesStatus,
    lowestPriceCents: null,
    currency: null,
  }
}

function normalizeExternalSailing(adapter: CruiseAdapter, sailing: ExternalSailing) {
  return {
    source: "external" as const,
    sourceProvider: adapter.name,
    sourceRef: sailing.sourceRef,
    key: makeExternalSourceKey(adapter.name, sailing.sourceRef),
    cruiseKey: makeExternalSourceKey(adapter.name, sailing.cruiseRef),
    shipKey: makeExternalSourceKey(adapter.name, sailing.shipRef),
    departureDate: sailing.departureDate,
    returnDate: sailing.returnDate,
    embarkPortName: sailing.embarkPortName ?? null,
    disembarkPortName: sailing.disembarkPortName ?? null,
    direction: sailing.direction ?? null,
    isCharter: sailing.isCharter ?? false,
    salesStatus: sailing.salesStatus ?? "open",
    lowestPriceCents: sailing.lowestPriceCents ?? null,
    currency: sailing.currency ?? null,
  }
}

function normalizeLocalShip(
  ship: NonNullable<Awaited<ReturnType<typeof cruisesService.getShipById>>>,
) {
  return {
    source: "local" as const,
    sourceProvider: null,
    sourceRef: null,
    key: ship.id,
    name: ship.name,
    slug: ship.slug,
    shipType: ship.shipType,
    capacityGuests: ship.capacityGuests,
    capacityCrew: ship.capacityCrew,
    cabinCount: ship.cabinCount,
    deckCount: ship.deckCount,
    description: ship.description,
    gallery: ship.gallery ?? [],
    amenities: ship.amenities ?? {},
  }
}

function normalizeExternalShip(adapter: CruiseAdapter, ship: ExternalShip) {
  return {
    source: "external" as const,
    sourceProvider: adapter.name,
    sourceRef: ship.sourceRef,
    key: makeExternalSourceKey(adapter.name, ship.sourceRef),
    name: ship.name,
    slug: ship.slug,
    shipType: ship.shipType,
    capacityGuests: ship.capacityGuests ?? null,
    capacityCrew: ship.capacityCrew ?? null,
    cabinCount: ship.cabinCount ?? null,
    deckCount: ship.deckCount ?? null,
    description: ship.description ?? null,
    gallery: ship.gallery ?? [],
    amenities: ship.amenities ?? {},
  }
}
