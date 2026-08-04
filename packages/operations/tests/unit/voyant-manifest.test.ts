import { describe, expect, it } from "vitest"
import { operationsDashboardVoyantModule, operationsVoyantModule } from "../../src/voyant.js"

describe("operations deployment manifest", () => {
  it("owns the package deployment surfaces", () => {
    expect(operationsVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/operations",
      packageName: "@voyant-travel/operations",
      provides: {
        ports: [
          { id: "catalog.extension.operations" },
          { id: "operations.expired-holds-job" },
          { id: "bookings.booking-action-projection.runtime" },
        ],
      },
      // Required as well as provided — the job resolves the port at run time and
      // composition rejects an undeclared request.
      runtimePorts: [
        { id: "operations.expired-holds-job" },
        { id: "bookings.booking-action-projection.runtime" },
        {
          id: "bookings.booking-action-source.runtime",
          optional: true,
          cardinality: "many",
        },
        // Optional: a deployment without Finance still operates departures, it
        // just shows no money on them.
        { id: "finance.departure-profitability.runtime", optional: true },
      ],
      jobs: [
        {
          id: "operations.release-expired-availability-holds",
          // Wake-driven: expiry is known at write time, so the cron is only the
          // backstop for a wake lost to a restart (#4067).
          wakeup: true,
          schedule: { cron: "*/15 * * * *", overlap: "skip" },
          scheduling: {
            profiles: {
              economical: { cron: "40 */6 * * *", overlap: "skip" },
              "scale-to-zero": { cron: "40 */6 * * *", overlap: "skip" },
            },
          },
          runtime: {
            entry: "@voyant-travel/operations/expired-holds-job",
            export: "runOperationsReleaseExpiredHoldsJob",
          },
        },
        {
          id: "operations.project-booking-actions",
          runtime: {
            entry: "@voyant-travel/operations/booking-actions-job",
            export: "runBookingActionIncrementalProjectionJob",
          },
        },
        {
          id: "operations.rebuild-booking-actions",
          runtime: {
            entry: "@voyant-travel/operations/booking-actions-job",
            export: "runBookingActionProjectionRebuildJob",
          },
        },
      ],
      api: [
        {
          id: "@voyant-travel/operations#api.admin",
          surface: "admin",
          openapi: { document: "operations" },
          runtime: { entry: "@voyant-travel/operations", export: "createOperationsVoyantRuntime" },
        },
      ],
      schema: [{ id: "@voyant-travel/operations#schema" }],
      migrations: [{ id: "@voyant-travel/operations#migrations" }],
      links: [
        { id: "@voyant-travel/operations#linkable.departure" },
        { id: "@voyant-travel/operations#linkable.facility" },
        { id: "@voyant-travel/operations#linkable.functionSpace" },
        { id: "@voyant-travel/operations#linkable.property" },
        { id: "@voyant-travel/operations#linkable.spaceBlock" },
      ],
    })
  })

  it("authorizes the actual operations mount and every route method", () => {
    expect(operationsVoyantModule.access?.resources).toEqual([
      expect.objectContaining({
        resource: "operations",
        label: "Operations",
        description: expect.any(String),
        actions: [
          expect.objectContaining({
            action: "read",
            label: expect.any(String),
            description: expect.any(String),
          }),
          expect.objectContaining({
            action: "write",
            label: expect.any(String),
            description: expect.any(String),
          }),
          expect.objectContaining({
            action: "delete",
            label: expect.any(String),
            description: expect.any(String),
            sensitive: true,
          }),
        ],
      }),
    ])
  })

  it("scopes selected Operations navigation, routes, and contributions", () => {
    expect(
      operationsVoyantModule.admin?.routes?.every(
        (route) => route.requiredScopes?.join() === "operations:read",
      ),
    ).toBe(true)
    expect(operationsVoyantModule.admin?.contributions?.[0]?.requiredScopes).toEqual([
      "operations:read",
    ])
    expect(operationsVoyantModule.admin?.nav).toEqual([
      expect.objectContaining({
        routeId: "@voyant-travel/operations#admin.route.availability-index",
        label: { namespace: "operator.admin.navigation", key: "nav.availability" },
      }),
      expect.objectContaining({
        routeId: "@voyant-travel/operations#admin.route.resources-index",
        label: { namespace: "operator.admin.navigation", key: "nav.resources" },
      }),
    ])
  })

  it("declares the emitted availability slot payload", () => {
    expect(operationsVoyantModule.events?.[0]?.payloadSchema).toEqual({
      type: "object",
      properties: {
        slotId: { type: "string" },
        productId: { type: "string" },
        optionId: { type: ["string", "null"] },
        startsAt: { type: "string", format: "date-time" },
        remainingPax: { type: ["number", "null"] },
        unlimited: { type: "boolean" },
        source: {
          type: "string",
          enum: [
            "booking",
            "cancel",
            "expire",
            "modify",
            "manual",
            "refresh",
            "created",
            "deleted",
          ],
        },
      },
      required: [
        "slotId",
        "productId",
        "optionId",
        "startsAt",
        "remainingPax",
        "unlimited",
        "source",
      ],
      additionalProperties: false,
    })
  })

  it("binds every read-only Operations tool to a read action", () => {
    const tools = operationsVoyantModule.tools ?? []
    const actions = operationsVoyantModule.actions ?? []
    const readTools = tools.filter((tool) => tool.requiredScopes?.includes("operations:read"))
    expect(readTools).toHaveLength(9)
    expect(actions).toHaveLength(18)
    for (const tool of readTools) {
      expect(tool).toMatchObject({
        requiredScopes: ["operations:read"],
        context: ["operations"],
        risk: "low",
      })
      const action = actions.find((candidate) => candidate.from?.tools?.includes(tool.id))
      expect(action).toMatchObject({
        version: "v1",
        kind: "read",
        requiredScopes: ["operations:read"],
        risk: "low",
        ledger: "optional",
      })
    }
  })

  it("binds the departure write tools to ledgered execute actions", () => {
    // The package declared `operations:write` long before anything used it, so
    // an operator could read availability through Max but never create a
    // departure — a composed product stayed unsellable.
    const tools = operationsVoyantModule.tools ?? []
    const actions = operationsVoyantModule.actions ?? []
    const writeTools = tools.filter((tool) => tool.requiredScopes?.includes("operations:write"))

    // Keyed by Tool name so a new write Tool has to declare its own posture
    // here rather than falling through to whatever the last branch asserted.
    const expectedActions: Record<string, Record<string, unknown>> = {
      create_departure: {
        approval: "never",
        reversible: false,
        targetLifecycle: "created",
        createdTarget: {
          commandTargetType: "departure-create-command",
          resultReferenceType: "departure",
          durability: "handler-command-claim-v1",
          parentAnchor: { targetType: "product", targetIdField: "productId" },
        },
      },
      update_departure: {
        approval: "required",
        targetLifecycle: "existing",
        commandTargetField: "id",
        reversible: true,
      },
      attach_departure_fleet_resource: {
        approval: "required",
        targetType: "departure",
        targetLifecycle: "existing",
        commandTargetField: "departureId",
        risk: "medium",
        reversible: true,
      },
      // Detaching removes the departure's container and the traveler placements
      // that pointed at it, so it is the one departure-planning write declared
      // irreversible and high risk.
      detach_departure_fleet_resource: {
        approval: "required",
        action: "delete",
        targetType: "departure",
        targetLifecycle: "existing",
        commandTargetField: "departureId",
        risk: "high",
        reversible: false,
      },
      set_departure_traveler_assignments: {
        approval: "required",
        targetType: "departure",
        targetLifecycle: "existing",
        commandTargetField: "departureId",
        risk: "medium",
        reversible: true,
      },
      // Drawing rooms from a block takes the supplier's nightly hold, which the
      // release compensates — so materialising is reversible as inventory.
      materialize_departure_room_block: {
        approval: "required",
        action: "write",
        targetType: "departure",
        targetLifecycle: "existing",
        commandTargetField: "departureId",
        risk: "medium",
        reversible: true,
      },
      // Releasing empties every traveler placed in one of the block's rooms, so
      // it joins detaching a fleet resource as an irreversible, high-risk delete.
      release_departure_room_block: {
        approval: "required",
        action: "delete",
        targetType: "departure",
        targetLifecycle: "existing",
        commandTargetField: "departureId",
        risk: "high",
        reversible: false,
      },
      set_departure_traveler_rooming_preferences: {
        approval: "required",
        action: "write",
        targetType: "departure",
        targetLifecycle: "existing",
        commandTargetField: "departureId",
        risk: "medium",
        reversible: true,
      },
      rebuild_booking_actions: {
        id: "@voyant-travel/operations#action.rebuild-booking-actions",
        approval: "required",
        targetType: "booking-action-projection",
        targetLifecycle: "existing",
        reversible: false,
      },
    }

    expect(writeTools.map((tool) => tool.name).sort()).toEqual(Object.keys(expectedActions).sort())

    for (const tool of writeTools) {
      expect(tool).toMatchObject({ context: ["operations"] })
      // The two writes that delete rows and empty traveler placements with them.
      const destructive = new Set([
        "detach_departure_fleet_resource",
        "release_departure_room_block",
      ])
      expect(tool.risk).toBe(destructive.has(tool.name ?? "") ? "high" : "medium")
      const action = actions.find((candidate) => candidate.from?.tools?.includes(tool.id))
      expect(action).toMatchObject({
        version: "v1",
        kind: "execute",
        requiredScopes: ["operations:write"],
        ledger: "required",
      })
      expect(action).toMatchObject(expectedActions[tool.name] ?? {})
    }
  })

  it("owns the separately selectable cross-module dashboard projection", () => {
    expect(operationsDashboardVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/operations#dashboard",
      packageName: "@voyant-travel/operations",
      requires: {
        capabilities: [
          "operations.data-owner",
          "bookings.data-owner",
          "finance.data-owner",
          "inventory.data-owner",
          "distribution.data-owner",
        ],
      },
      tools: [
        {
          id: "@voyant-travel/operations#dashboard#tool.get-operator-dashboard-summary",
          name: "get_operator_dashboard_summary",
          requiredScopes: [
            "operations:read",
            "bookings:read",
            "finance:read",
            "products:read",
            "suppliers:read",
          ],
          context: ["operations", "bookings", "finance", "inventory", "distribution"],
          risk: "low",
        },
      ],
      actions: [
        {
          kind: "read",
          resource: "operations",
          action: "read",
          ledger: "optional",
          allowedActorTypes: ["staff"],
        },
      ],
    })
  })
})
