import { describe, expect, it } from "vitest"

import { setupVoyantModule } from "../../src/voyant.js"

describe("setup package manifest", () => {
  it("owns API, access, schema, migrations, events, and admin composition", () => {
    expect(setupVoyantModule.api).toHaveLength(1)
    expect(setupVoyantModule.schema).toHaveLength(1)
    expect(setupVoyantModule.migrations).toHaveLength(1)
    expect(setupVoyantModule.access?.resources[0]?.resource).toBe("setup")
    expect(setupVoyantModule.api?.[0]?.authorization).toBe("route")
    expect(setupVoyantModule.events).toEqual([
      expect.objectContaining({
        eventType: "setup.lifecycle.changed",
        version: "1.0.0",
        visibility: "internal",
        audit: { sourceModule: "setup", category: "internal" },
        payloadSchema: expect.objectContaining({
          required: ["change", "stepId"],
          additionalProperties: false,
        }),
      }),
    ])
    expect(setupVoyantModule.admin?.routes).toBeUndefined()
    expect(setupVoyantModule.admin?.runtime?.export).toBe("createSelectedSetupAdminExtension")
    expect(setupVoyantModule.tools?.map(({ id, risk }) => ({ id, risk }))).toEqual([
      { id: "@voyant-travel/setup#tool.get-setup-state", risk: "low" },
      { id: "@voyant-travel/setup#tool.initialize-setup", risk: "medium" },
      { id: "@voyant-travel/setup#tool.complete-setup-step", risk: "medium" },
      { id: "@voyant-travel/setup#tool.skip-setup-step", risk: "medium" },
      { id: "@voyant-travel/setup#tool.dismiss-setup", risk: "medium" },
    ])
    expect(setupVoyantModule.actions?.map((action) => action.from.tools)).toEqual([
      ["@voyant-travel/setup#tool.get-setup-state"],
      ["@voyant-travel/setup#tool.initialize-setup"],
      ["@voyant-travel/setup#tool.complete-setup-step"],
      ["@voyant-travel/setup#tool.skip-setup-step"],
      ["@voyant-travel/setup#tool.dismiss-setup"],
    ])
    for (const id of ["complete-setup-step", "skip-setup-step"]) {
      expect(
        setupVoyantModule.actions?.find(
          ({ id: actionId }) => actionId === `@voyant-travel/setup#action.${id}`,
        ),
      ).toMatchObject({ commandTargetField: "stepId" })
    }
    expect(
      setupVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/setup#action.initialize-setup",
      ),
    ).toMatchObject({
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
    })
  })
})
