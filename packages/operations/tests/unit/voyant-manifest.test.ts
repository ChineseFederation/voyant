import { describe, expect, it } from "vitest"
import { operationsDashboardVoyantModule, operationsVoyantModule } from "../../src/voyant.js"

describe("operations deployment manifest", () => {
  it("owns the package deployment surfaces", () => {
    expect(operationsVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/operations",
      packageName: "@voyant-travel/operations",
      provides: {
        ports: [{ id: "catalog.extension.operations" }, { id: "operations.expired-holds-job" }],
      },
      // Required as well as provided — the job resolves the port at run time and
      // composition rejects an undeclared request.
      runtimePorts: [{ id: "operations.expired-holds-job" }],
      jobs: [
        {
          id: "operations.release-expired-availability-holds",
          runtime: {
            entry: "@voyant-travel/operations/expired-holds-job",
            export: "runOperationsReleaseExpiredHoldsJob",
          },
        },
      ],
      api: [
        {
          id: "@voyant-travel/operations#api.admin",
          surface: "admin",
          openapi: { document: "operations" },
          runtime: { entry: "@voyant-travel/operations", export: "operationsApiModule" },
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
    expect(readTools).toHaveLength(8)
    expect(actions).toHaveLength(10)
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

    expect(writeTools.map((tool) => tool.name).sort()).toEqual([
      "create_departure",
      "update_departure",
    ])

    for (const tool of writeTools) {
      expect(tool).toMatchObject({ context: ["operations"], risk: "medium" })
      const action = actions.find((candidate) => candidate.from?.tools?.includes(tool.id))
      expect(action).toMatchObject({
        version: "v1",
        kind: "execute",
        requiredScopes: ["operations:write"],
        ledger: "required",
      })
      if (tool.name === "create_departure") {
        expect(action).toMatchObject({
          approval: "never",
          reversible: false,
          targetLifecycle: "created",
          createdTarget: {
            commandTargetType: "departure-create-command",
            resultReferenceType: "departure",
            durability: "handler-command-claim-v1",
            parentAnchor: { targetType: "product", targetIdField: "productId" },
          },
        })
      } else {
        expect(action).toMatchObject({
          approval: "required",
          targetLifecycle: "existing",
          commandTargetField: "id",
          reversible: true,
        })
      }
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
