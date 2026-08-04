import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import {
  attachDepartureFleetResourceTool,
  CREATE_DEPARTURE_HANDLER_POLICY,
  createDepartureTool,
  detachDepartureFleetResourceTool,
  getOperatorDashboardSummaryTool,
  type OperationsToolServices,
  operationsTools,
  rebuildBookingActionsTool,
  resolveOperatorDashboardWindow,
  setDepartureTravelerAssignmentsTool,
  updateDepartureTool,
} from "../src/tools.js"

function contextWith(overrides: Partial<OperationsToolServices>): ToolContext & {
  operations: OperationsToolServices
} {
  const unavailable = async () => {
    throw new Error("Unexpected Operations tool service call")
  }
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "default",
    resolverScope: {
      locale: "en-GB",
      audience: "staff",
      market: "default",
      actor: "staff",
    },
    operations: {
      createDeparture: unavailable,
      updateDeparture: unavailable,
      attachDepartureFleetResource: unavailable,
      detachDepartureFleetResource: unavailable,
      listDepartureFleetResources: unavailable,
      setDepartureTravelerAssignments: unavailable,
      rebuildBookingActions: unavailable,
      getAvailabilityOverview: unavailable,
      getAvailabilityAggregates: unavailable,
      listAvailabilityRules: unavailable,
      getAvailabilityRule: unavailable,
      listAvailabilityStartTimes: unavailable,
      listDepartures: unavailable,
      getDeparture: unavailable,
      listAvailabilityCloseouts: unavailable,
      ...overrides,
    },
  }
}

function registry() {
  const registry = createToolRegistry()
  registry.registerAll(operationsTools)
  return registry
}

describe("Operations tools", () => {
  it("creates a lossless departure through the admitted idempotent command surface", async () => {
    const writeRegistry = createToolRegistry()
    writeRegistry.register(createDepartureTool, {
      actionPolicy: CREATE_DEPARTURE_HANDLER_POLICY.actionPolicy,
    })
    const createdAt = new Date("2026-07-28T12:00:00.000Z")
    const result = await writeRegistry.dispatch(
      "create_departure",
      {
        productId: "prod_1",
        dateLocal: "2026-10-12",
        startsAt: "2026-10-12T06:30:00.000Z",
        endsAt: "2026-10-14T15:00:00.000Z",
        timezone: "Europe/Bucharest",
        status: "open",
        unlimited: false,
        initialPax: 20,
        remainingPax: 17,
        nights: 2,
        days: 3,
        notes: "Meet at the station",
        idempotencyKey: "bucharest-2026-10-12-v1",
      },
      {
        ...contextWith({
          async createDeparture(input) {
            expect(input.idempotencyKey).toBe("bucharest-2026-10-12-v1")
            return {
              replayed: false,
              departure: {
                id: "avsl_1",
                productId: input.productId,
                itineraryId: null,
                optionId: null,
                facilityId: null,
                availabilityRuleId: null,
                startTimeId: null,
                dateLocal: input.dateLocal,
                startsAt: new Date(input.startsAt),
                endsAt: new Date(input.endsAt as string),
                timezone: input.timezone,
                status: input.status,
                unlimited: input.unlimited,
                initialPax: input.initialPax,
                remainingPax: input.remainingPax,
                initialPickups: null,
                remainingPickups: null,
                remainingResources: null,
                pastCutoff: false,
                tooEarly: false,
                nights: input.nights,
                days: input.days,
                notes: input.notes,
                createdAt,
                updatedAt: createdAt,
                endDateLocal: "2026-10-14",
              },
            }
          },
        }),
        handlerActionPolicy: {
          capabilityId: CREATE_DEPARTURE_HANDLER_POLICY.capabilityId,
          capabilityVersion: CREATE_DEPARTURE_HANDLER_POLICY.capabilityVersion,
          canonicalName: CREATE_DEPARTURE_HANDLER_POLICY.canonicalName,
          actionPolicy: {
            ...CREATE_DEPARTURE_HANDLER_POLICY.actionPolicy,
            enforcement: "handler",
            invocation: {
              controlField: "_voyant",
              requiredFields: [],
              optionalFields: [],
              fingerprintAlgorithm: "action-ledger-command-v1",
            },
          },
          invocation: { idempotencyKey: "bucharest-2026-10-12-v1" },
        } as never,
      },
    )
    expect(result).toMatchObject({
      replayed: false,
      departure: {
        startsAt: "2026-10-12T06:30:00.000Z",
        endsAt: "2026-10-14T15:00:00.000Z",
        timezone: "Europe/Bucharest",
        initialPax: 20,
        remainingPax: 17,
        nights: 2,
        days: 3,
        status: "open",
        notes: "Meet at the station",
      },
    })
  })

  it("accepts a full read-modify-write snapshot and forwards compatibility fields", async () => {
    const writeRegistry = createToolRegistry()
    writeRegistry.register(updateDepartureTool)
    const snapshot = {
      id: "avsl_1",
      productId: "prod_1",
      itineraryId: null,
      optionId: null,
      facilityId: null,
      availabilityRuleId: null,
      startTimeId: null,
      dateLocal: "2026-10-12",
      startsAt: "2026-10-12T06:30:00.000Z",
      endsAt: "2026-10-14T15:00:00.000Z",
      timezone: "Europe/Bucharest",
      status: "open" as const,
      unlimited: false,
      initialPax: 20,
      remainingPax: 17,
      initialPickups: 4,
      remainingPickups: 3,
      remainingResources: 2,
      pastCutoff: false,
      tooEarly: false,
      nights: 2,
      days: 3,
      notes: "Meet at the station",
      createdAt: "2026-07-28T12:00:00.000Z",
      updatedAt: "2026-07-28T12:00:00.000Z",
      endDateLocal: "2026-10-14",
    }
    let forwarded: unknown
    const result = await writeRegistry.dispatch(
      "update_departure",
      { ...snapshot, notes: "Meet at the station - platform 2" },
      contextWith({
        async updateDeparture(_id, patch) {
          forwarded = patch
          return {
            ...snapshot,
            ...patch,
            startsAt: new Date(snapshot.startsAt),
            endsAt: new Date(snapshot.endsAt),
            createdAt: new Date(snapshot.createdAt),
            updatedAt: new Date(snapshot.updatedAt),
          }
        },
      }),
    )

    expect(forwarded).toMatchObject({
      productId: "prod_1",
      remainingPax: 17,
      remainingPickups: 3,
      remainingResources: 2,
      pastCutoff: false,
      tooEarly: false,
      notes: "Meet at the station - platform 2",
    })
    expect(forwarded).not.toHaveProperty("createdAt")
    expect(forwarded).toHaveProperty("updatedAt", "2026-07-28T12:00:00.000Z")
    expect(forwarded).not.toHaveProperty("endDateLocal")
    expect(result).toMatchObject({
      departure: {
        id: "avsl_1",
        productId: "prod_1",
        remainingPax: 17,
        notes: "Meet at the station - platform 2",
      },
    })
  })

  it("attaches a fleet resource with the departure lifted out of the flat argument object", async () => {
    const writeRegistry = createToolRegistry()
    writeRegistry.register(attachDepartureFleetResourceTool)
    let forwarded: unknown
    let forwardedDepartureId: string | undefined
    const result = await writeRegistry.dispatch(
      "attach_departure_fleet_resource",
      { departureId: "avsl_1", resourceId: "res_coach_1", capacity: 48 },
      contextWith({
        async attachDepartureFleetResource(departureId, input) {
          forwardedDepartureId = departureId
          forwarded = input
          return {
            resource: {
              id: "alrs_1",
              slotId: departureId,
              kind: "vehicle",
              refType: "resource",
              refId: "res_coach_1",
              label: "Coach 1 (C1)",
              capacity: 48,
              flags: { resourceAssignmentId: "resa_1" },
              parentId: null,
              sortOrder: 0,
              createdAt: new Date("2026-07-28T12:00:00.000Z"),
              updatedAt: new Date("2026-07-28T12:00:00.000Z"),
            },
            assignmentId: "resa_1",
            created: true,
          }
        },
      }),
    )

    expect(forwardedDepartureId).toBe("avsl_1")
    expect(forwarded).toMatchObject({ resourceId: "res_coach_1", capacity: 48 })
    expect(forwarded).not.toHaveProperty("departureId")
    expect(result).toMatchObject({
      resource: { id: "alrs_1", refId: "res_coach_1", capacity: 48 },
      assignmentId: "resa_1",
      created: true,
    })
  })

  it("detaches a fleet resource by its fleet id, taking cascade as a real boolean", async () => {
    const writeRegistry = createToolRegistry()
    writeRegistry.register(detachDepartureFleetResourceTool)
    let forwarded: unknown
    const result = await writeRegistry.dispatch(
      "detach_departure_fleet_resource",
      { departureId: "avsl_1", fleetResourceId: "res_coach_1", cascade: true },
      contextWith({
        async detachDepartureFleetResource(_departureId, _fleetResourceId, options) {
          forwarded = options
          return { removedResourceIds: ["alrs_seat_1", "alrs_1"], assignmentId: "resa_1" }
        },
      }),
    )

    expect(forwarded).toEqual({ cascade: true })
    expect(result).toEqual({
      removedResourceIds: ["alrs_seat_1", "alrs_1"],
      assignmentId: "resa_1",
    })
  })

  it("refuses a vehicle batch that would place travelers on the parent resource", async () => {
    const writeRegistry = createToolRegistry()
    writeRegistry.register(setDepartureTravelerAssignmentsTool)
    let called = false
    await expect(
      writeRegistry.dispatch(
        "set_departure_traveler_assignments",
        {
          departureId: "avsl_1",
          kind: "vehicle",
          assignments: [{ travelerId: "bkpt_1", resourceId: "alrs_1" }],
        },
        contextWith({
          async setDepartureTravelerAssignments() {
            called = true
            return {}
          },
        }),
      ),
    ).rejects.toThrow(/vehicle seats/)
    expect(called).toBe(false)
  })

  it("places a whole set of travelers in one call", async () => {
    const writeRegistry = createToolRegistry()
    writeRegistry.register(setDepartureTravelerAssignmentsTool)
    let forwarded: unknown
    const result = await writeRegistry.dispatch(
      "set_departure_traveler_assignments",
      {
        departureId: "avsl_1",
        kind: "room",
        assignments: [
          { travelerId: "bkpt_1", resourceId: "alrs_room_1", expectedResourceId: null },
          { travelerId: "bkpt_2", resourceId: null },
        ],
      },
      contextWith({
        async setDepartureTravelerAssignments(_departureId, input) {
          forwarded = input
          return {
            kind: input.kind,
            assigned: 1,
            unassigned: 1,
            unchanged: 0,
            travelerIds: ["bkpt_1", "bkpt_2"],
          }
        },
      }),
    )

    expect(forwarded).not.toHaveProperty("departureId")
    expect(result).toEqual({
      kind: "room",
      assigned: 1,
      unassigned: 1,
      unchanged: 0,
      travelerIds: ["bkpt_1", "bkpt_2"],
    })
  })

  it("rebuilds Booking actions through the authoritative projection service", async () => {
    const writeRegistry = createToolRegistry()
    writeRegistry.register(rebuildBookingActionsTool)
    const summary = {
      mode: "rebuild" as const,
      providers: 3,
      projected: 8,
      unchanged: 5,
      invalidated: 1,
    }

    await expect(
      writeRegistry.dispatch(
        "rebuild_booking_actions",
        {},
        contextWith({ rebuildBookingActions: async () => summary }),
      ),
    ).resolves.toEqual(summary)
  })

  it("accepts the compatibility productId field but surfaces a rejected ownership move", async () => {
    const writeRegistry = createToolRegistry()
    writeRegistry.register(updateDepartureTool)
    let called = false
    await expect(
      writeRegistry.dispatch(
        "update_departure",
        { id: "avsl_1", productId: "prod_other" },
        contextWith({
          async updateDeparture() {
            called = true
            throw new Error("Availability slot product ownership is immutable")
          },
        }),
      ),
    ).rejects.toThrow("product ownership is immutable")
    expect(called).toBe(true)
  })

  it("registers stable staff-only read capabilities with serializable outputs", () => {
    const manifest = registry().list()
    expect(manifest.map((tool) => tool.name).sort()).toEqual([
      "get_availability_aggregates",
      "get_availability_overview",
      "get_availability_rule",
      "get_departure",
      "list_availability_closeouts",
      "list_availability_rules",
      "list_availability_start_times",
      "list_departure_fleet_resources",
      "list_departures",
    ])
    for (const tool of manifest) {
      expect(tool.capabilityId).toBe(
        `@voyant-travel/operations#tool.${tool.name.replaceAll("_", "-")}`,
      )
      expect(tool.owner).toBe("@voyant-travel/operations")
      expect(tool.capabilityVersion).toBe("v1")
      expect(tool.requiredScopes).toEqual(["operations:read"])
      expect(tool.audience).toEqual({ source: "grant", allowed: ["staff"] })
      expect(tool.tier).toBe("read")
      expect(tool.deploymentRisk).toBe("low")
      expect(tool.outputSchema).toMatchObject({ type: "object" })
      expect(tool.outputSchema).not.toHaveProperty("x-voyant-schema-quality")
    }
    for (const tool of manifest) {
      expect(tool.aliases ?? []).toEqual([])
    }
  })

  it("dispatches the availability overview through the domain service", async () => {
    let forwarded: unknown
    const result = await registry().dispatch(
      "get_availability_overview",
      { productId: "prod_1", attentionLimit: 3 },
      contextWith({
        async getAvailabilityOverview(query) {
          forwarded = query
          return {
            openSlotsCount: 4,
            constrainedSlotsCount: 0,
            activeRulesCount: 2,
            activePickupPointsCount: 1,
            productsWithoutUpcomingDeparturesCount: 0,
            productsWithoutUpcomingDepartures: [],
            constrainedSlots: [],
          }
        },
      }),
    )
    expect(forwarded).toEqual({ productId: "prod_1", attentionLimit: 3 })
    expect(result).toMatchObject({ openSlotsCount: 4, activeRulesCount: 2 })
  })

  it("normalizes legacy departure filters and emits JSON-safe typed rows", async () => {
    let forwarded: unknown
    const createdAt = new Date("2026-08-01T08:00:00.000Z")
    const result = await registry().dispatch<{ data: Array<Record<string, unknown>> }>(
      "list_departures",
      {
        productId: "prod_1",
        date: "2026-09-10",
        startsAtFrom: "2026-09-01T00:00:00+03:00",
        startsAtUntil: "2026-10-01T00:00:00+03:00",
      },
      contextWith({
        async listDepartures(query) {
          forwarded = query
          return {
            data: [
              {
                id: "avsl_1",
                productId: "prod_1",
                itineraryId: null,
                optionId: null,
                facilityId: null,
                availabilityRuleId: null,
                startTimeId: null,
                dateLocal: "2026-09-10",
                startsAt: new Date("2026-09-10T06:00:00.000Z"),
                endsAt: null,
                timezone: "Europe/Bucharest",
                status: "open",
                unlimited: false,
                initialPax: 20,
                remainingPax: 12,
                initialPickups: null,
                remainingPickups: null,
                remainingResources: null,
                pastCutoff: false,
                tooEarly: false,
                nights: null,
                days: null,
                notes: null,
                createdAt,
                updatedAt: createdAt,
                endDateLocal: null,
                productName: "Danube Day Trip",
              },
            ],
            total: 1,
            limit: query.limit,
            offset: query.offset,
          }
        },
      }),
    )

    expect(forwarded).toMatchObject({
      productId: "prod_1",
      dateLocal: "2026-09-10",
      startsAtFrom: "2026-08-31T21:00:00.000Z",
      startsAtUntil: "2026-09-30T21:00:00.000Z",
      limit: 50,
      offset: 0,
    })
    expect(forwarded).not.toHaveProperty("date")
    expect(result.data[0]).toMatchObject({
      startsAt: "2026-09-10T06:00:00.000Z",
      createdAt: createdAt.toISOString(),
      productName: "Danube Day Trip",
    })
  })

  it("returns null for missing departures and rules", async () => {
    const ctx = contextWith({
      async getDeparture() {
        return null
      },
      async getAvailabilityRule() {
        return null
      },
    })
    await expect(registry().dispatch("get_departure", { id: "missing" }, ctx)).resolves.toEqual({
      departure: null,
    })
    await expect(
      registry().dispatch("get_availability_rule", { id: "missing" }, ctx),
    ).resolves.toEqual({ rule: null })
  })

  it("reads the framework-only availability dashboard projection", async () => {
    const result = await registry().dispatch(
      "get_availability_aggregates",
      { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
      contextWith({
        async getAvailabilityAggregates() {
          return {
            total: 3,
            countsByStatus: [
              { status: "open", count: 2 },
              { status: "closed", count: 1 },
              { status: "sold_out", count: 0 },
              { status: "cancelled", count: 0 },
            ],
            upcomingSlots: 2,
            upcomingPax: 31,
            monthlyDepartures: [{ yearMonth: "2026-09", count: 3 }],
          }
        },
      }),
    )
    expect(result).toMatchObject({ total: 3, upcomingSlots: 2, upcomingPax: 31 })
  })
})

describe("Operations dashboard Tool", () => {
  it("publishes a structural, staff-only composed read", () => {
    const registry = createToolRegistry()
    registry.register(getOperatorDashboardSummaryTool)
    expect(registry.list()[0]).toMatchObject({
      capabilityId: "@voyant-travel/operations#dashboard#tool.get-operator-dashboard-summary",
      owner: "@voyant-travel/operations#dashboard",
      name: "get_operator_dashboard_summary",
      aliases: [],
      audience: { source: "grant", allowed: ["staff"] },
      requiredScopes: [
        "operations:read",
        "bookings:read",
        "finance:read",
        "products:read",
        "suppliers:read",
      ],
      tier: "read",
    })
    expect(registry.list()[0]?.outputSchema).not.toHaveProperty("x-voyant-schema-quality")
  })

  it("composes domain-owned aggregates and derives bounded KPIs and alerts", async () => {
    const calls: Array<{ service: string; query: unknown }> = []
    const registry = createToolRegistry()
    registry.register(getOperatorDashboardSummaryTool)
    const result = await registry.dispatch<{
      kpis: Record<string, unknown>
      alerts: unknown[]
    }>(
      "get_operator_dashboard_summary",
      { range: "this-month" },
      {
        ...contextWith({
          async getAvailabilityAggregates(query) {
            calls.push({ service: "operations", query })
            return {
              total: 4,
              countsByStatus: [
                { status: "open", count: 3 },
                { status: "closed", count: 1 },
                { status: "sold_out", count: 0 },
                { status: "cancelled", count: 0 },
              ],
              upcomingSlots: 3,
              upcomingPax: 42,
              monthlyDepartures: [{ yearMonth: "2026-07", count: 4 }],
            }
          },
        }),
        bookings: {
          async getBookingAggregates(query: unknown) {
            calls.push({ service: "bookings", query })
            return {
              total: 7,
              totalPax: 18,
              countsByStatus: [
                { status: "confirmed", count: 2 },
                { status: "in_progress", count: 1 },
                { status: "cancelled", count: 1 },
              ],
              monthlyCounts: [{ yearMonth: "2026-07", count: 7 }],
              monthlyRevenue: [{ yearMonth: "2026-07", currency: "EUR", sellAmountCents: 250_000 }],
              upcomingDepartures: { count: 1, items: [] },
            }
          },
        },
        inventory: {
          async getProductAggregates(query: unknown) {
            calls.push({ service: "inventory", query })
            return {
              total: 9,
              countsByStatus: [
                { status: "draft", count: 2 },
                { status: "active", count: 7 },
                { status: "archived", count: 0 },
              ],
              active: 7,
              publicActive: 6,
              monthlyCreatedCounts: [{ yearMonth: "2026-07", count: 2 }],
            }
          },
        },
        distribution: {
          async getSupplierAggregates(query: unknown) {
            calls.push({ service: "distribution", query })
            return {
              total: 5,
              countsByStatus: [{ status: "active", count: 4 }],
              countsByType: [{ type: "hotel", count: 3 }],
              active: 4,
            }
          },
        },
        finance: {
          async getFinanceAggregates(query: unknown) {
            calls.push({ service: "finance", query })
            return {
              total: 3,
              countsByStatus: [{ status: "issued", count: 2 }],
              counts: {
                invoices: { issued: 2, paid: 1, void: 0, overdue: 1 },
                proformas: { issued: 0, converted: 0, void: 0 },
                paymentSessions: { pending: 0, paid: 1, failed: 0 },
              },
              totals: [
                {
                  currency: "EUR",
                  invoiced: 210_000,
                  collected: 150_000,
                  outstanding: 60_000,
                  refunded: 0,
                },
              ],
              monthlyRevenue: [
                { yearMonth: "2026-06", currency: "EUR", totalCents: 90_000 },
                { yearMonth: "2026-07", currency: "EUR", totalCents: 120_000 },
              ],
              monthlyInvoiceCounts: [{ yearMonth: "2026-07", count: 2 }],
              outstanding: [{ currency: "EUR", balanceDueCents: 60_000, count: 1 }],
              overdue: [{ currency: "EUR", balanceDueCents: 20_000, count: 1 }],
              outstandingTopN: [],
            }
          },
        },
      },
    )

    expect(calls.map(({ service }) => service).sort()).toEqual([
      "bookings",
      "distribution",
      "finance",
      "inventory",
      "operations",
    ])
    expect(calls.find(({ service }) => service === "finance")?.query).toMatchObject({
      range: "custom",
      outstandingTopLimit: 5,
    })
    expect(result.kpis).toMatchObject({
      bookings: { total: 7, active: 3, travelers: 18 },
      products: { total: 9, active: 7, publicActive: 6 },
      suppliers: { total: 5, active: 4 },
      availability: { upcomingDepartures: 3, upcomingPax: 42 },
      revenue: [{ currency: "EUR", amountCents: 210_000 }],
      outstanding: [{ currency: "EUR", amountCents: 60_000, count: 1 }],
    })
    expect(result.alerts).toEqual([
      {
        kind: "overdue-invoices",
        severity: "critical",
        count: 1,
        currency: "EUR",
        amountCents: 20_000,
      },
    ])
  })

  it("resolves hosted date ranges in UTC", () => {
    const now = new Date("2026-07-15T12:30:00.000Z")
    expect(resolveOperatorDashboardWindow("today", now).from).toBe("2026-07-15T00:00:00.000Z")
    expect(resolveOperatorDashboardWindow("this-week", now).from).toBe("2026-07-13T00:00:00.000Z")
    expect(resolveOperatorDashboardWindow("this-month", now).from).toBe("2026-07-01T00:00:00.000Z")
    expect(resolveOperatorDashboardWindow("last-30-days", now).from).toBe(
      "2026-06-15T12:30:00.000Z",
    )
  })
})
