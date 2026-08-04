import { assertPortConforms } from "@voyant-travel/core/project"
import { describe, expect, it, vi } from "vitest"

import { createMiceVoyantRuntime, miceRuntimePort } from "../../src/index.js"
import { miceVoyantModule } from "../../src/voyant.js"

describe("MICE deployment authority", () => {
  it("declares its package-owned runtime factory and port", () => {
    expect(miceVoyantModule).toMatchObject({
      runtimePorts: [{ id: "mice.runtime" }, { id: "relationships.mice.runtime" }],
      api: [{ runtime: { export: "createMiceVoyantRuntime" } }],
    })
  })

  it("assembles the MICE module from its deployment provider", async () => {
    const provider = { resolveDelegatePersonById: vi.fn(async () => true) }
    await expect(assertPortConforms(miceRuntimePort, provider)).resolves.toBeUndefined()
    await expect(assertPortConforms(miceRuntimePort, {} as never)).rejects.toThrow(
      /resolveDelegatePersonById/,
    )

    const runtime = await createMiceVoyantRuntime({
      unitId: miceVoyantModule.id,
      projectConfig: {},
      getUnitProjectConfig: () => undefined,
      hostOptions: {},
      api: miceVoyantModule.api ?? [],
      graph: {
        providerSelections: {},
        accessCatalog: { resources: [], presets: [] },
        references: [],
        setupSteps: [],
        tools: [],
      },
      runtimePorts: {},
      hasPort: () => true,
      getPort: vi.fn(async () => provider) as never,
      getPorts: vi.fn(async () => []) as never,
    })
    expect(runtime.module).toMatchObject({ name: "mice", requiresTransactionalDb: true })
    expect(runtime.adminRoutes).toBeDefined()
  })
})
