import { bookingActionLedgerCapabilityRegistry } from "@voyant-travel/bookings/action-ledger-capabilities"
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
    ])
    const accessScopes = (bookingsVoyantModule.access?.resources ?? []).flatMap((resource) =>
      resource.actions.map(
        (action) => `${resource.resource}:${typeof action === "string" ? action : action.action}`,
      ),
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
            tools: (bookingsVoyantModule.tools ?? []).map(({ id }) => id),
            events: (bookingsVoyantModule.events ?? []).map(({ id }) => id),
            webhooks: (bookingsVoyantModule.webhooks ?? []).map(({ id }) => id),
          },
          routes: [],
        },
      ],
      plugins: [],
    })

    const lowered = lowerVoyantGraphActionsToActionLedgerRegistry(runtime).definitions
    const canonical = [...bookingActionLedgerCapabilityRegistry.definitions].sort(
      (left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version),
    )

    expect(lowered).toEqual(canonical)
  })
})
