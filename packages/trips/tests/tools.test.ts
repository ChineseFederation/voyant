import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import type { TripComponent } from "../src/schema.js"
import {
  CREATE_TRIP_HANDLER_POLICY,
  createTripTool,
  getTripTool,
  listTripsTool,
  PRICE_TRIP_HANDLER_POLICY,
  priceTripTool,
  RESERVE_TRIP_HANDLER_POLICY,
  reserveTripTool,
  SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY,
  sourceTripRequirementCandidatesTool,
  type TripsToolServices,
  tripsTools,
} from "../src/tools.js"

function ctxWith(
  services?: Partial<TripsToolServices>,
  overrides: Partial<ToolContext> = {},
): ToolContext & { trips?: TripsToolServices } {
  const actor = overrides.actor ?? "staff"
  const audience = overrides.audience ?? actor
  return {
    db: {},
    actor,
    audience,
    tenantId: "default",
    resolverScope: {
      locale: "en-GB",
      audience,
      market: "default",
      actor,
      ...overrides.resolverScope,
    },
    ...overrides,
    trips: services as TripsToolServices | undefined,
  }
}

function makeRegistry() {
  const registry = createToolRegistry()
  for (const tool of tripsTools) {
    if (tool === createTripTool) {
      registry.register(tool, { actionPolicy: CREATE_TRIP_HANDLER_POLICY.actionPolicy })
    } else if (tool === priceTripTool) {
      registry.register(tool, { actionPolicy: PRICE_TRIP_HANDLER_POLICY.actionPolicy })
    } else if (tool === reserveTripTool) {
      registry.register(tool, { actionPolicy: RESERVE_TRIP_HANDLER_POLICY.actionPolicy })
    } else if (tool === sourceTripRequirementCandidatesTool) {
      registry.register(tool, {
        actionPolicy: SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY.actionPolicy,
      })
    } else {
      registry.register(tool)
    }
  }
  return registry
}

function priceHandlerActionPolicy(idempotencyKey: string) {
  return {
    ...PRICE_TRIP_HANDLER_POLICY,
    actionPolicy: {
      ...PRICE_TRIP_HANDLER_POLICY.actionPolicy,
      enforcement: "handler" as const,
      invocation: {
        controlField: "_voyant" as const,
        requiredFields: ["idempotencyKey", "approvalId", "idempotencyFingerprint"],
        optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
        fingerprintAlgorithm: "action-ledger-command-v1" as const,
      },
    },
    invocation: {
      idempotencyKey,
      approvalId: "appr_1",
      idempotencyFingerprint: "sha256:test",
    },
  } satisfies NonNullable<ToolContext["handlerActionPolicy"]>
}

function reserveHandlerActionPolicy(idempotencyKey: string) {
  return {
    ...RESERVE_TRIP_HANDLER_POLICY,
    actionPolicy: {
      ...RESERVE_TRIP_HANDLER_POLICY.actionPolicy,
      enforcement: "handler" as const,
      invocation: {
        controlField: "_voyant" as const,
        requiredFields: ["idempotencyKey", "approvalId", "idempotencyFingerprint"],
        optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
        fingerprintAlgorithm: "action-ledger-command-v1" as const,
      },
    },
    invocation: {
      idempotencyKey,
      approvalId: "appr_1",
      idempotencyFingerprint: "sha256:test",
    },
  } satisfies NonNullable<ToolContext["handlerActionPolicy"]>
}

describe("trips tools", () => {
  it("registers trip composition and candidate workflow tools with exact posture", () => {
    const registry = makeRegistry()
    const manifest = registry.list()
    expect(manifest.map((t) => t.name).sort()).toEqual([
      "add_trip_requirement",
      "create_trip",
      "get_trip",
      "get_trip_action_operation",
      "get_trip_requirement_sourcing_operation",
      "list_trips",
      "price_trip",
      "reserve_trip",
      "revise_trip",
      "select_trip_candidate",
      "source_trip_requirement_candidates",
    ])
    const reserve = manifest.find((t) => t.name === "reserve_trip")
    expect(reserve?.tier).toBe("destructive")
    expect(reserve?.requiredScopes).toEqual(["trips:write"])
    expect(reserve?.riskPolicy.destructive).toBe(true)
    const price = manifest.find((t) => t.name === "price_trip")
    expect(price).toMatchObject({
      tier: "write",
      requiredScopes: ["trips:write"],
      deploymentRisk: "medium",
    })
    expect(price?.riskPolicy).toMatchObject({
      confirmationRequired: true,
      sideEffects: ["data-write"],
    })
    expect(manifest.some((tool) => tool.name.startsWith("reshop_"))).toBe(false)
    expect(
      manifest.find((tool) => tool.name === "get_trip_requirement_sourcing_operation"),
    ).toMatchObject({
      tier: "read",
      requiredScopes: ["trips:read"],
      annotations: { readOnlyHint: true, idempotentHint: true },
    })
  })

  it("creates a deterministic trip and adds components, returning pure data", async () => {
    const calls: string[] = []
    const registry = makeRegistry()
    const result = await registry.dispatch<{ envelope: { id: string }; components: unknown[] }>(
      "create_trip",
      {
        title: "AI trip",
        components: [
          {
            kind: "manual_placeholder",
            metadata: { manualService: { name: "Transfer" }, template: "manual" },
          },
        ],
      },
      ctxWith(
        {
          async createTrip() {
            calls.push("createTrip")
            return { envelopeId: "trip_123" }
          },
          async addComponent(input) {
            const metadata = input.metadata as { manualService?: { name?: string } }
            calls.push(`addComponent:${metadata.manualService?.name}`)
            const now = new Date("2026-05-18T00:00:00.000Z")
            return {
              id: "trcp_123",
              envelopeId: input.envelopeId,
              sequence: input.sequence,
              kind: input.kind,
              status: "draft",
              title: metadata.manualService?.name ?? null,
              description: input.description ?? null,
              entityModule: null,
              entityId: null,
              sourceKind: null,
              sourceConnectionId: null,
              sourceRef: null,
              bookingDraftId: null,
              catalogQuoteId: null,
              bookingId: null,
              bookingGroupId: null,
              orderId: null,
              paymentSessionId: null,
              providerRef: null,
              supplierRef: null,
              componentCurrency: null,
              componentSubtotalAmountCents: null,
              componentTaxAmountCents: null,
              componentTotalAmountCents: null,
              pricingSnapshot: input.estimatedPricing ?? null,
              taxLines: [],
              cancellationSnapshot: null,
              holdToken: null,
              holdExpiresAt: null,
              priceExpiresAt: null,
              warningCodes: [],
              metadata: input.metadata,
              createdAt: now,
              updatedAt: now,
            } satisfies TripComponent
          },
        },
        {
          handlerActionPolicy: {
            capabilityId: CREATE_TRIP_HANDLER_POLICY.capabilityId,
            capabilityVersion: CREATE_TRIP_HANDLER_POLICY.capabilityVersion,
            canonicalName: CREATE_TRIP_HANDLER_POLICY.canonicalName,
            actionPolicy: {
              ...CREATE_TRIP_HANDLER_POLICY.actionPolicy,
              enforcement: "handler",
              invocation: {
                controlField: "_voyant",
                requiredFields: ["idempotencyKey"],
                optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
                fingerprintAlgorithm: "action-ledger-command-v1",
              },
            },
            invocation: { idempotencyKey: "trip-create-1" },
          } as ToolContext["handlerActionPolicy"],
        },
      ),
    )

    expect(calls).toEqual(["createTrip"])
    expect(result).toEqual({ envelopeId: "trip_123" })
  })

  it("throws MISSING_SERVICE when the trips service is not wired", async () => {
    const registry = makeRegistry()
    await expect(
      registry.dispatch(
        "price_trip",
        {
          envelopeId: "trip_123",
          scope: { locale: "en-GB", audience: "staff", market: "default", currency: "EUR" },
        },
        ctxWith(undefined, {
          handlerActionPolicy: priceHandlerActionPolicy("price-1"),
        }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_SERVICE" })
  })

  it("rejects non-staff price requests for a different audience", async () => {
    const registry = makeRegistry()
    await expect(
      registry.dispatch(
        "price_trip",
        {
          envelopeId: "trip_123",
          scope: { locale: "en-GB", audience: "staff", market: "default", currency: "EUR" },
        },
        ctxWith(
          {
            async createTrip() {
              return { envelopeId: "trip_123" }
            },
            async addComponent() {
              throw new Error("not used")
            },
          },
          {
            actor: "customer",
            audience: "customer",
            handlerActionPolicy: priceHandlerActionPolicy("price-customer-1"),
          },
        ),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
  })

  it("rejects non-staff reserve refresh scopes for a different audience", async () => {
    const registry = makeRegistry()
    await expect(
      registry.dispatch(
        "reserve_trip",
        {
          envelopeId: "trip_123",
          refreshScope: { locale: "en-GB", audience: "staff", market: "default" },
        },
        ctxWith(
          {
            async createTrip() {
              return { envelopeId: "trip_123" }
            },
            async addComponent() {
              throw new Error("not used")
            },
          },
          {
            actor: "customer",
            audience: "customer",
            handlerActionPolicy: reserveHandlerActionPolicy("reserve-customer-1"),
          },
        ),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
  })

  it("exposes tool handlers directly for unit reuse", () => {
    expect(createTripTool.name).toBe("create_trip")
    expect(priceTripTool.tier).toBe("write")
  })

  it("accepts durable requirement sourcing through the handler-owned service", async () => {
    let forwarded: unknown
    const result = await makeRegistry().dispatch(
      "source_trip_requirement_candidates",
      {
        requirementId: "trrq_1",
        scope: { locale: "en-GB", audience: "staff", market: "RO" },
        limit: 10,
      },
      ctxWith(
        {
          async acceptRequirementCandidateSourcing(input) {
            forwarded = input
            return {
              status: "accepted",
              operationId: "act_1",
              requirementId: input.requirementId,
              statusTool: "get_trip_requirement_sourcing_operation",
            }
          },
        },
        {
          handlerActionPolicy: {
            capabilityId: SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY.capabilityId,
            capabilityVersion: SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY.capabilityVersion,
            canonicalName: SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY.canonicalName,
            actionPolicy: {
              ...SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY.actionPolicy,
              enforcement: "handler",
              invocation: {
                controlField: "_voyant",
                requiredFields: ["idempotencyKey"],
                optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
                fingerprintAlgorithm: "action-ledger-command-v1",
              },
            },
            invocation: { idempotencyKey: "source-1" },
          } as ToolContext["handlerActionPolicy"],
        },
      ),
    )
    expect(forwarded).toMatchObject({ requirementId: "trrq_1", limit: 10 })
    expect(result).toEqual({
      status: "accepted",
      operationId: "act_1",
      requirementId: "trrq_1",
      statusTool: "get_trip_requirement_sourcing_operation",
    })
  })

  it("reads an immutable sourcing result and explicit terminal outcome", async () => {
    const result = await makeRegistry().dispatch(
      "get_trip_requirement_sourcing_operation",
      { operationId: "act_1", requirementId: "trrq_1" },
      ctxWith({
        async getRequirementSourcingOperation() {
          const now = new Date("2026-07-24T10:00:00.000Z")
          return {
            operationId: "act_1",
            requirementId: "trrq_1",
            status: "dead_letter",
            result: {
              status: "accepted",
              operationId: "act_1",
              requirementId: "trrq_1",
              statusTool: "get_trip_requirement_sourcing_operation",
            },
            outcome: { status: "dead_letter", error: "providers unavailable" },
            error: "providers unavailable",
            attempts: 8,
            maxAttempts: 8,
            nextAttemptAt: now,
            completedAt: now,
            createdAt: now,
            updatedAt: now,
          }
        },
      }),
    )
    expect(result).toMatchObject({
      operationId: "act_1",
      requirementId: "trrq_1",
      status: "dead_letter",
      result: {
        status: "accepted",
        operationId: "act_1",
        requirementId: "trrq_1",
      },
      outcome: { status: "dead_letter", error: "providers unavailable" },
      error: "providers unavailable",
    })
    expect(result).not.toHaveProperty("requestSnapshot")
    expect(result).not.toHaveProperty("leaseVersion")
  })

  it("rejects candidate sourcing across a non-staff grant audience", async () => {
    const handlerActionPolicy = {
      capabilityId: SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY.capabilityId,
      capabilityVersion: SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY.capabilityVersion,
      canonicalName: SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY.canonicalName,
      actionPolicy: {
        ...SOURCE_REQUIREMENT_CANDIDATES_HANDLER_POLICY.actionPolicy,
        enforcement: "handler" as const,
        invocation: {
          controlField: "_voyant" as const,
          requiredFields: ["idempotencyKey"],
          optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
          fingerprintAlgorithm: "action-ledger-command-v1" as const,
        },
      },
      invocation: { idempotencyKey: "source-customer-1" },
    } satisfies NonNullable<ToolContext["handlerActionPolicy"]>

    await expect(
      makeRegistry().dispatch(
        "source_trip_requirement_candidates",
        {
          requirementId: "trrq_1",
          scope: { locale: "en-GB", audience: "staff", market: "RO" },
        },
        ctxWith(
          {
            async acceptRequirementCandidateSourcing() {
              return {
                status: "accepted",
                operationId: "act_1",
                requirementId: "trrq_1",
                statusTool: "get_trip_requirement_sourcing_operation",
              }
            },
          },
          { actor: "customer", audience: "customer", handlerActionPolicy },
        ),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
  })
})

describe("trips read tools", () => {
  const AGGREGATE = {
    envelope: {
      id: "trip_01kyh3rr1kf688cvc3r2d9k584",
      status: "draft",
      title: "Coastal Day Cruise — Marchetti",
      description: null,
      travelerParty: {},
      constraints: {},
      aggregateCurrency: "EUR",
      aggregateSubtotalAmountCents: 80000,
      aggregateTaxAmountCents: 0,
      aggregateTotalAmountCents: 80000,
      aggregatePricingSnapshot: null,
      currentPriceExpiresAt: null,
      bookingGroupId: null,
      orderId: null,
      paymentSessionId: null,
      reserveIdempotencyKey: null,
      reserveStartedAt: null,
      reservedAt: null,
      checkoutIdempotencyKey: null,
      checkoutStartedAt: null,
      createdBy: null,
      updatedBy: null,
      createdAt: "2026-07-27T10:00:00.000Z",
      updatedAt: "2026-07-27T10:00:00.000Z",
    },
    components: [],
  }

  it("lists trips through the injected service", async () => {
    let seen: unknown
    const result = await makeRegistry().dispatch<{
      total: number
      data: { envelope: { id: string } }[]
    }>(
      "list_trips",
      { status: "draft" },
      ctxWith({
        listTrips: async (input) => {
          seen = input
          return { data: [AGGREGATE], total: 1, limit: 50, offset: 0 }
        },
      }),
    )
    expect(result.total).toBe(1)
    expect(result.data[0]?.envelope.id).toBe("trip_01kyh3rr1kf688cvc3r2d9k584")
    // Paging and ordering defaults reach the service without the model
    // having to supply them.
    expect(seen).toMatchObject({
      status: "draft",
      limit: 50,
      offset: 0,
      sortBy: "updatedAt",
      sortDir: "desc",
    })
  })

  it("reads one trip by envelope id", async () => {
    const result = await makeRegistry().dispatch<{
      envelope: { title: string | null }
    } | null>(
      "get_trip",
      { envelopeId: "trip_01kyh3rr1kf688cvc3r2d9k584" },
      ctxWith({ getTrip: async () => AGGREGATE }),
    )
    expect(result?.envelope.title).toBe("Coastal Day Cruise — Marchetti")
  })

  it("returns null for a trip that does not exist", async () => {
    const result = await makeRegistry().dispatch(
      "get_trip",
      { envelopeId: "trip_missing" },
      ctxWith({ getTrip: async () => null }),
    )
    expect(result).toBeNull()
  })

  // The gap this closes: every trip write tool takes an envelope id, and until
  // now nothing could produce one outside the conversation that created it.
  it("exposes both readers on the registry so a trip can be found", () => {
    const names = tripsTools.map((t) => t.name)
    expect(names).toContain("list_trips")
    expect(names).toContain("get_trip")
  })

  // A trip envelope's travelerParty carries traveler names, dates of birth,
  // emails and phones plus the billing party's contact details, so these are
  // PII-bearing reads, not ordinary ones.
  it("declares the readers as sensitive and non-destructive", () => {
    for (const tool of [listTripsTool, getTripTool]) {
      expect(tool.tier).toBe("sensitive")
      expect(tool.riskPolicy.destructive).toBe(false)
      expect(tool.requiredScopes).toEqual(["trips:read"])
    }
  })

  // The service applies the flight filter on `=== true`, so accepting `false`
  // would silently return every trip.
  it("accepts hasFlight only as a presence flag", async () => {
    const registry = makeRegistry()
    const ctx = ctxWith({
      listTrips: async () => ({ data: [], total: 0, limit: 50, offset: 0 }),
    })
    await expect(registry.dispatch("list_trips", { hasFlight: true }, ctx)).resolves.toBeDefined()
    await expect(registry.dispatch("list_trips", { hasFlight: false }, ctx)).rejects.toThrow()
  })

  // `parseDateMs` drops an unparseable bound, so a loose string would return
  // trips outside the requested period with no sign the filter was ignored.
  it("rejects a creation-date filter the service could not parse", async () => {
    const registry = makeRegistry()
    const ctx = ctxWith({
      listTrips: async () => ({ data: [], total: 0, limit: 50, offset: 0 }),
    })
    await expect(
      registry.dispatch("list_trips", { createdFrom: "yesterday" }, ctx),
    ).rejects.toThrow()
    await expect(
      registry.dispatch("list_trips", { createdFrom: "2026-07-27" }, ctx),
    ).resolves.toBeDefined()
    await expect(
      registry.dispatch("list_trips", { createdTo: "2026-07-27T10:00:00Z" }, ctx),
    ).resolves.toBeDefined()
  })
})
