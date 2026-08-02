import { bookingActionLedgerCapabilityRegistry } from "@voyant-travel/bookings/action-ledger-capabilities"
import {
  CANCEL_BOOKING_HANDLER_POLICY,
  CONFIRM_BOOKING_HANDLER_POLICY,
} from "@voyant-travel/bookings/tools"
import { bookingsVoyantModule } from "@voyant-travel/bookings/voyant"
import { describe, expect, it } from "vitest"
import { lowerVoyantGraphActionsToActionLedgerRegistry } from "../../framework/src/graph-action-ledger.js"
import { createVoyantGraphRuntime } from "../../framework/src/runtime-lowering.js"

describe("standard booking action-ledger authority", () => {
  it("keeps the manifest in parity with the canonical request registry", () => {
    const actions = bookingsVoyantModule.actions ?? []
    expect(actions.map(({ id, capabilityId }) => ({ id, capabilityId }))).toEqual([
      { id: "booking.pii.read", capabilityId: "bookings-pii:read" },
      { id: "booking.status.confirm", capabilityId: "bookings:status:confirm" },
      { id: "booking.status.expire", capabilityId: "bookings:status:expire" },
      { id: "booking.status.cancel", capabilityId: "bookings:status:cancel" },
      { id: "booking.status.start", capabilityId: "bookings:status:start" },
      { id: "booking.status.complete", capabilityId: "bookings:status:complete" },
      { id: "booking.status.override", capabilityId: "bookings:status:override" },
      {
        id: "@voyant-travel/bookings#action.preview-traveler-correction-amendment",
        capabilityId: "bookings:amendments:preview-traveler-correction",
      },
      {
        id: "@voyant-travel/bookings#action.preview-traveler-roster-change-amendment",
        capabilityId: "bookings:amendments:preview-traveler-roster-change",
      },
      {
        id: "@voyant-travel/bookings#action.accept-booking-amendment",
        capabilityId: "bookings:amendments:accept",
      },
      {
        id: "@voyant-travel/bookings#action.apply-booking-amendment",
        capabilityId: "bookings:amendments:apply",
      },
      {
        id: "@voyant-travel/bookings#action.reconcile-booking-amendment",
        capabilityId: "bookings:amendments:reconcile",
      },
    ])
    const accessScopes = (bookingsVoyantModule.access?.resources ?? []).flatMap((resource) =>
      resource.actions.map(
        (action) => `${resource.resource}:${typeof action === "string" ? action : action.action}`,
      ),
    )
    // Unavailable actions keep Tool bindings for first-party convergence, but
    // runtime lowering must not select those Tools. Package-local admin cancel
    // still uses BOOKING_STATUS_CAPABILITIES outside the graph-lowered registry.
    const unavailableToolIds = new Set(
      actions
        .filter((action) => action.availability?.status === "unavailable")
        .flatMap((action) => action.from?.tools ?? []),
    )
    const unavailableCapabilityIds = new Set(
      actions
        .filter((action) => action.availability?.status === "unavailable")
        .map((action) => action.capabilityId)
        .filter((id): id is string => typeof id === "string"),
    )
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:bookings-action-parity",
      accessCatalog: {
        resources: (bookingsVoyantModule.access?.resources ?? []).map((resource) => ({
          id: resource.id,
          unitId: bookingsVoyantModule.id,
          resource: resource.resource,
          label: resource.label ?? resource.resource,
          description: resource.description ?? resource.label ?? resource.resource,
          wildcard: resource.wildcard ?? "allow",
          actions: resource.actions.map((action) =>
            typeof action === "string"
              ? { action, label: action, description: action }
              : {
                  action: action.action,
                  label: action.label ?? action.action,
                  description: action.description ?? action.label ?? action.action,
                  ...(action.wildcard ? { wildcard: action.wildcard } : {}),
                },
          ),
          legacyActions: resource.legacyActions,
        })),
        presets: [],
      },
      entries: {},
      modules: [
        {
          id: bookingsVoyantModule.id,
          kind: "module",
          packageName: bookingsVoyantModule.packageName!,
          order: 0,
          accessScopes,
          actions: actions.map((action) => ({
            ...action,
            unitId: bookingsVoyantModule.id,
            requiredScopes: [...(action.requiredScopes ?? [])],
            from: {
              routes: [...(action.from?.routes ?? [])],
              tools: [...(action.from?.tools ?? [])],
              events: [...(action.from?.events ?? [])],
              webhooks: [...(action.from?.webhooks ?? [])],
            },
          })),
          selectedIds: {
            routes: (bookingsVoyantModule.api ?? []).map(({ id }) => id),
            tools: (bookingsVoyantModule.tools ?? [])
              .map(({ id }) => id)
              .filter((id) => !unavailableToolIds.has(id)),
            events: (bookingsVoyantModule.events ?? []).map(({ id }) => id),
            webhooks: (bookingsVoyantModule.webhooks ?? []).map(({ id }) => id),
          },
          routes: [],
        },
      ],
      plugins: [],
    })

    const lowered = lowerVoyantGraphActionsToActionLedgerRegistry(runtime).definitions
    const canonical = [...bookingActionLedgerCapabilityRegistry.definitions]
      .filter((definition) => !unavailableCapabilityIds.has(definition.id))
      .sort(
        (left, right) =>
          left.id.localeCompare(right.id) || left.version.localeCompare(right.version),
      )
    const requiredInSelectedGraph = new Set(["bookings:status:confirm", "bookings:status:cancel"])
    const selectedGraphCanonical = canonical.map((definition) =>
      requiredInSelectedGraph.has(definition.id)
        ? { ...definition, approvalPolicy: "required" as const }
        : definition,
    )

    expect(lowered).toEqual(selectedGraphCanonical)

    const lifecycleActionExpectations = [
      {
        graphId: "booking.status.confirm",
        capabilityId: "bookings:status:confirm",
        toolId: "@voyant-travel/bookings#tool.confirm-booking",
        toolPolicy: CONFIRM_BOOKING_HANDLER_POLICY,
      },
      {
        graphId: "booking.status.cancel",
        capabilityId: "bookings:status:cancel",
        toolId: "@voyant-travel/bookings#tool.cancel-booking",
        toolPolicy: CANCEL_BOOKING_HANDLER_POLICY,
      },
    ] as const

    for (const expectation of lifecycleActionExpectations) {
      const canonicalDefinition = canonical.find(
        (definition) => definition.id === expectation.capabilityId,
      )
      const graphAction = actions.find((action) => action.id === expectation.graphId)
      const graphTool = bookingsVoyantModule.tools?.find((tool) => tool.id === expectation.toolId)
      const loweredDefinition = lowered.find(
        (definition) => definition.id === expectation.capabilityId,
      )

      expect(canonicalDefinition).toMatchObject({
        id: expectation.capabilityId,
        approvalPolicy: "conditional",
        ledgerPolicy: "required",
      })
      expect(graphAction).toMatchObject({
        id: expectation.graphId,
        approval: "required",
        ledger: "required",
        from: { tools: [expectation.toolId] },
      })
      expect(graphTool).toMatchObject({
        id: expectation.toolId,
        requiredScopes: ["bookings:write"],
      })
      expect(expectation.toolPolicy.actionPolicy).toMatchObject({
        id: expectation.graphId,
        capabilityId: expectation.capabilityId,
        approval: "required",
        ledger: "required",
      })
      expect(loweredDefinition).toMatchObject({
        id: expectation.capabilityId,
        approvalPolicy: "required",
        ledgerPolicy: "required",
      })
      expect(canonicalDefinition?.approvalPolicy).not.toBe("required")
      expect(graphAction?.approval).not.toBe("conditional")
      expect(expectation.toolPolicy.actionPolicy.approval).not.toBe("conditional")
      expect(loweredDefinition?.approvalPolicy).not.toBe("conditional")
    }
  })
})
