/**
 * Trips agent tools on the framework tool contract (`@voyant-travel/tools`).
 *
 * These replace the bespoke `mcp-*.ts` surface: each tool is a headless
 * `defineTool` returning **typed pure data** (no MCP envelopes). The trips
 * service is injected on the context by intersection (`TripsToolContext`), so
 * this module stays deployment-agnostic — the operator binds the services to its
 * request `db` and mounts the registry through `@voyant-travel/mcp`.
 */
import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
  requireService,
  type ToolContext,
  ToolError,
  type ToolHandlerActionPolicyContext,
  type Visibility,
} from "@voyant-travel/tools"
import { z } from "zod"

import type { TripComponent } from "./schema.js"
import {
  reviseTripResultSchema,
  selectTripCandidateResultSchema,
  sourceTripCandidatesAcceptedResultSchema,
  tripActionAcceptedResultSchema,
  tripActionOperationResultSchema,
  tripRequirementSourcingOperationResultSchema,
  tripRequirementToolSchema,
} from "./tool-output-schemas.js"
import {
  addRequirementSchema,
  createTripComponentBodySchema,
  type createTripComponentSchema,
  createTripEnvelopeSchema,
  getRequirementSourcingOperationSchema,
  priceTripSchema,
  reserveTripSchema,
  selectCandidateSchema,
  sourceRequirementCandidatesSchema,
} from "./validation.js"

const OWNER = "@voyant-travel/trips"
const VERSION = "v1"
const SOURCE_REQUIREMENT_CANDIDATES_VERSION = "v2"
const DURABLE_TRIP_ACTION_VERSION = "v2"
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const REQUIREMENT_WRITE_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  confirmationRequired: false,
  sideEffects: ["data-write"],
} as const
const PRICE_WRITE_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  confirmationRequired: true,
  sideEffects: ["data-write"],
} as const
const CANDIDATE_WRITE_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  confirmationRequired: false,
  sideEffects: ["data-write"],
} as const
const CANDIDATE_SELECTION_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  confirmationRequired: true,
  sideEffects: ["data-write"],
} as const
export const CREATE_TRIP_HANDLER_POLICY = {
  capabilityId: `${OWNER}#tool.create-trip`,
  capabilityVersion: VERSION,
  canonicalName: "create_trip",
  actionPolicy: {
    id: `${OWNER}#action.create-trip`,
    capabilityId: `${OWNER}#action.create-trip`,
    version: VERSION,
    kind: "execute",
    targetType: "trip",
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: "trip-create-command",
      resultReferenceType: "trip",
      durability: "handler-command-claim-v1",
    },
    risk: "medium",
    ledger: "required",
    approval: "never",
    reversible: false,
  },
} as const satisfies HandlerActionPolicyExpectation

export const SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY = {
  capabilityId: `${OWNER}#tool.source-requirement-candidates`,
  capabilityVersion: SOURCE_REQUIREMENT_CANDIDATES_VERSION,
  canonicalName: "source_trip_requirement_candidates",
  actionPolicy: {
    id: `${OWNER}#action.source-requirement-candidates`,
    capabilityId: `${OWNER}#action.source-requirement-candidates`,
    version: SOURCE_REQUIREMENT_CANDIDATES_VERSION,
    kind: "execute",
    targetType: "trip-requirement",
    commandTargetField: "requirementId",
    targetLifecycle: "existing",
    existingTarget: {
      durability: "handler-command-result-v1",
    },
    risk: "medium",
    ledger: "required",
    approval: "never",
    reversible: true,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

export const PRICE_TRIP_HANDLER_POLICY = {
  capabilityId: `${OWNER}#tool.price-trip`,
  capabilityVersion: DURABLE_TRIP_ACTION_VERSION,
  canonicalName: "price_trip",
  actionPolicy: {
    id: `${OWNER}#action.price-trip`,
    capabilityId: `${OWNER}#action.price-trip`,
    version: DURABLE_TRIP_ACTION_VERSION,
    kind: "execute",
    targetType: "trip",
    commandTargetField: "envelopeId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "high",
    ledger: "required",
    approval: "required",
    reversible: true,
  },
} as const satisfies HandlerActionPolicyExpectation

export const RESERVE_TRIP_HANDLER_POLICY = {
  capabilityId: `${OWNER}#tool.reserve-trip`,
  capabilityVersion: DURABLE_TRIP_ACTION_VERSION,
  canonicalName: "reserve_trip",
  actionPolicy: {
    id: `${OWNER}#action.reserve-trip`,
    capabilityId: `${OWNER}#action.reserve-trip`,
    version: DURABLE_TRIP_ACTION_VERSION,
    kind: "execute",
    targetType: "trip",
    commandTargetField: "envelopeId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "critical",
    ledger: "required",
    approval: "required",
    reversible: false,
  },
} as const satisfies HandlerActionPolicyExpectation

/** The trips service surface a deployment binds into the tool context. */
export interface TripsToolServices {
  createTrip(
    input: CreateTripArgs,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<{ envelopeId: string }>
  addComponent(input: z.infer<typeof createTripComponentSchema>): Promise<TripComponent>
  removeComponent?(componentId: string): Promise<TripComponent | null>
  acceptPriceTrip(
    input: z.infer<typeof priceTripSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  acceptReserveTrip(
    input: Omit<z.infer<typeof reserveTripSchema>, "idempotencyKey">,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  getTripActionOperation(input: {
    operationId: string
    envelopeId: string
  }): Promise<unknown | null>
  addRequirement(input: z.infer<typeof addRequirementSchema>): Promise<unknown>
  acceptRequirementCandidateSourcing(
    input: z.infer<typeof sourceRequirementCandidatesSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  getRequirementSourcingOperation(
    input: z.infer<typeof getRequirementSourcingOperationSchema>,
  ): Promise<unknown | null>
  selectCandidate(input: z.infer<typeof selectCandidateSchema>): Promise<unknown>
}

/** Tool context with the trips service injected. */
export type TripsToolContext = ToolContext & { trips?: TripsToolServices }

function trips(ctx: TripsToolContext): TripsToolServices {
  return requireService(ctx.trips, "trips")
}

function assertToolAudience(ctx: TripsToolContext, audience: Visibility): void {
  if (ctx.actor === "staff" || audience === ctx.audience) return
  throw new ToolError(
    `Actor "${ctx.actor}" is not authorized to query audience "${audience}". Non-staff tools may only use their grant audience.`,
    "AUTHORIZATION_DENIED",
    { actor: ctx.actor, grantAudience: ctx.audience, requestedAudience: audience },
  )
}

const createTripArgs = createTripEnvelopeSchema.extend({
  components: z.array(createTripComponentBodySchema).default([]),
})
export type CreateTripArgs = z.infer<typeof createTripArgs>

const createTripReferenceSchema = z.object({ envelopeId: z.string() })
export type CreateTripResult = z.output<typeof createTripReferenceSchema>

export const createTripTool = defineTool<CreateTripArgs, CreateTripResult, TripsToolContext>({
  capabilityId: `${OWNER}#tool.create-trip`,
  capabilityVersion: VERSION,
  name: "create_trip",
  description:
    "Create a deterministic trip envelope and optional components for a composed itinerary. " +
    "Use this before pricing or reserving a cross-vertical trip.",
  inputSchema: createTripArgs,
  outputSchema: createTripReferenceSchema,
  requiredScopes: ["trips:write"],
  tier: "write",
  riskPolicy: { destructive: false, reversible: true, dryRunSupported: false },
  actionPolicyEnforcement: "handler",
  annotations: { idempotentHint: true },
  async handler(args, ctx) {
    const admitted = admitHandlerActionPolicy(ctx, CREATE_TRIP_HANDLER_POLICY)
    return createTripReferenceSchema.parse(await trips(ctx).createTrip(args, admitted))
  },
})

const reviseTripArgs = z.object({
  envelopeId: z.string().min(1),
  addComponents: z.array(createTripComponentBodySchema).default([]),
  removeComponentIds: z.array(z.string().min(1)).default([]),
})
export type ReviseTripArgs = z.infer<typeof reviseTripArgs>

export type ReviseTripResult = z.output<typeof reviseTripResultSchema>

export const reviseTripTool = defineTool<ReviseTripArgs, ReviseTripResult, TripsToolContext>({
  name: "revise_trip",
  description:
    "Revise a deterministic trip envelope by adding components or removing uncommitted components. " +
    "This does not mutate committed bookings directly.",
  inputSchema: reviseTripArgs,
  outputSchema: reviseTripResultSchema,
  requiredScopes: ["trips:write"],
  tier: "write",
  riskPolicy: { destructive: false, reversible: true, dryRunSupported: false },
  async handler(args, ctx) {
    const composer = trips(ctx)
    const added: TripComponent[] = []
    const removed: TripComponent[] = []

    for (const component of args.addComponents) {
      added.push(await composer.addComponent({ ...component, envelopeId: args.envelopeId }))
    }

    if (args.removeComponentIds.length > 0 && !composer.removeComponent) {
      throw new ToolError("Trips removeComponent service is not configured.", "MISSING_SERVICE", {
        service: "trips.removeComponent",
      })
    }

    for (const componentId of args.removeComponentIds) {
      const result = await composer.removeComponent?.(componentId)
      if (result) removed.push(result)
    }

    return parseJsonResult(reviseTripResultSchema, {
      envelopeId: args.envelopeId,
      added,
      removed,
    })
  },
})

export type PriceTripArgs = z.infer<typeof priceTripSchema>
export type PriceTripResult = z.output<typeof tripActionAcceptedResultSchema>

export const priceTripTool = defineTool<PriceTripArgs, PriceTripResult, TripsToolContext>({
  capabilityId: `${OWNER}#tool.price-trip`,
  capabilityVersion: DURABLE_TRIP_ACTION_VERSION,
  name: "price_trip",
  description:
    "Accept durable pricing for a deterministic trip through the exact selected provider. " +
    "Returns an operation id for get_trip_action_operation; provider dispatch is asynchronous.",
  inputSchema: priceTripSchema,
  outputSchema: tripActionAcceptedResultSchema,
  requiredScopes: ["trips:write"],
  tier: "write",
  riskPolicy: PRICE_WRITE_RISK,
  actionPolicyEnforcement: "handler",
  annotations: { idempotentHint: true },
  async handler(args, ctx) {
    assertToolAudience(ctx, args.scope.audience)
    const admitted = admitHandlerActionPolicy(ctx, PRICE_TRIP_HANDLER_POLICY)
    return parseJsonResult(
      tripActionAcceptedResultSchema,
      await trips(ctx).acceptPriceTrip(args, admitted),
    )
  },
})

const reserveTripCommandSchema = reserveTripSchema.omit({ idempotencyKey: true })
export type ReserveTripArgs = z.infer<typeof reserveTripCommandSchema>
export type ReserveTripResult = z.output<typeof tripActionAcceptedResultSchema>

export const reserveTripTool = defineTool<ReserveTripArgs, ReserveTripResult, TripsToolContext>({
  capabilityId: `${OWNER}#tool.reserve-trip`,
  capabilityVersion: DURABLE_TRIP_ACTION_VERSION,
  name: "reserve_trip",
  description:
    "Accept durable reservation of a priced trip through the exact selected provider. " +
    "Returns an operation id for get_trip_action_operation; provider dispatch is asynchronous.",
  inputSchema: reserveTripCommandSchema,
  outputSchema: tripActionAcceptedResultSchema,
  requiredScopes: ["trips:write"],
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["external-booking", "payment"],
  },
  actionPolicyEnforcement: "handler",
  annotations: { idempotentHint: true },
  async handler(args, ctx) {
    if (args.refreshScope) assertToolAudience(ctx, args.refreshScope.audience)
    const admitted = admitHandlerActionPolicy(ctx, RESERVE_TRIP_HANDLER_POLICY)
    return parseJsonResult(
      tripActionAcceptedResultSchema,
      await trips(ctx).acceptReserveTrip(args, admitted),
    )
  },
})

export const getTripActionOperationTool = defineTool({
  capabilityId: `${OWNER}#tool.get-trip-action-operation`,
  capabilityVersion: DURABLE_TRIP_ACTION_VERSION,
  name: "get_trip_action_operation",
  description:
    "Read the immutable status and terminal provider outcome of an admitted Trip pricing or reservation operation.",
  inputSchema: z.object({
    operationId: z.string().min(1),
    envelopeId: z.string().min(1),
  }),
  outputSchema: tripActionOperationResultSchema.nullable(),
  requiredScopes: ["trips:read"],
  audience: STAFF_AUDIENCE,
  tier: "read",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: true,
    confirmationRequired: false,
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async handler(input, ctx: TripsToolContext) {
    return parseJsonResult(
      tripActionOperationResultSchema.nullable(),
      await trips(ctx).getTripActionOperation(input),
    )
  },
})

export const addTripRequirementTool = defineTool({
  capabilityId: `${OWNER}#tool.add-requirement`,
  capabilityVersion: VERSION,
  name: "add_trip_requirement",
  description:
    "Add an unresolved customer need to a mutable trip envelope so it can be sourced into provider-neutral candidates.",
  inputSchema: addRequirementSchema,
  outputSchema: tripRequirementToolSchema,
  requiredScopes: ["trips:write"],
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: REQUIREMENT_WRITE_RISK,
  async handler(input, ctx: TripsToolContext) {
    return parseJsonResult(tripRequirementToolSchema, await trips(ctx).addRequirement(input))
  },
})

export const sourceTripRequirementCandidatesTool = defineTool({
  capabilityId: `${OWNER}#tool.source-requirement-candidates`,
  capabilityVersion: SOURCE_REQUIREMENT_CANDIDATES_VERSION,
  name: "source_trip_requirement_candidates",
  description:
    "Accept durable provider-neutral candidate sourcing for one unresolved trip requirement. " +
    "The fixed Trips worker replaces ranked candidates only after a successful fan-out.",
  inputSchema: sourceRequirementCandidatesSchema,
  outputSchema: sourceTripCandidatesAcceptedResultSchema,
  requiredScopes: ["trips:write"],
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: CANDIDATE_WRITE_RISK,
  actionPolicyEnforcement: "handler",
  annotations: { idempotentHint: true },
  async handler(input, ctx: TripsToolContext) {
    assertToolAudience(ctx, input.scope.audience)
    const admitted = admitHandlerActionPolicy(ctx, SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY)
    return sourceTripCandidatesAcceptedResultSchema.parse(
      await trips(ctx).acceptRequirementCandidateSourcing(input, admitted),
    )
  },
})

export const getTripRequirementSourcingOperationTool = defineTool({
  capabilityId: `${OWNER}#tool.get-requirement-sourcing-operation`,
  capabilityVersion: SOURCE_REQUIREMENT_CANDIDATES_VERSION,
  name: "get_trip_requirement_sourcing_operation",
  description:
    "Read one durable trip-requirement sourcing operation by operation and requirement id, " +
    "including retry, completion, or terminal failure without hiding stale candidates.",
  inputSchema: getRequirementSourcingOperationSchema,
  outputSchema: tripRequirementSourcingOperationResultSchema,
  requiredScopes: ["trips:read"],
  audience: STAFF_AUDIENCE,
  tier: "read",
  riskPolicy: { destructive: false, reversible: true, dryRunSupported: false },
  annotations: { readOnlyHint: true, idempotentHint: true },
  async handler(input, ctx: TripsToolContext) {
    const result = await trips(ctx).getRequirementSourcingOperation(input)
    if (!result) {
      throw new ToolError("Trip requirement sourcing operation was not found.", "NOT_FOUND", input)
    }
    return parseJsonResult(tripRequirementSourcingOperationResultSchema, result)
  },
})

export const selectTripCandidateTool = defineTool({
  capabilityId: `${OWNER}#tool.select-candidate`,
  capabilityVersion: VERSION,
  name: "select_trip_candidate",
  description:
    "Select a still-valid ranked candidate for a trip requirement and pin it as a draft trip component.",
  inputSchema: selectCandidateSchema,
  outputSchema: selectTripCandidateResultSchema,
  requiredScopes: ["trips:write"],
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: CANDIDATE_SELECTION_RISK,
  async handler(input, ctx: TripsToolContext) {
    return parseJsonResult(selectTripCandidateResultSchema, await trips(ctx).selectCandidate(input))
  },
})

/** All trips agent tools, ready to register on a `ToolRegistry`. */
export const tripsTools = [
  createTripTool,
  reviseTripTool,
  priceTripTool,
  reserveTripTool,
  getTripActionOperationTool,
  addTripRequirementTool,
  sourceTripRequirementCandidatesTool,
  getTripRequirementSourcingOperationTool,
  selectTripCandidateTool,
] as const

function parseJsonResult<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(toJsonValue(value))
}

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toJsonValue(nested)] as const)
      .filter(([, nested]) => nested !== undefined),
  )
}
