import type { ToolContext } from "@voyant-travel/tools"
import { describe, expect, it, vi } from "vitest"

import {
  completeSetupStepTool,
  getSetupStateTool,
  initializeSetupTool,
  type SetupToolContext,
  skipSetupStepTool,
} from "../../src/tools.js"

const baseContext: ToolContext = {
  db: {},
  actor: "staff",
  audience: "staff",
  tenantId: "tenant",
  resolverScope: { locale: "en", audience: "staff", market: "default", actor: "staff" },
}

describe("setup Tools", () => {
  it("declares structural graph-aware contracts, audience, and risk", () => {
    expect(
      getSetupStateTool.outputSchema.safeParse({
        state: null,
        selectedSteps: [{ id: "profile", skippable: true }],
        canManage: true,
      }).success,
    ).toBe(true)
    expect(getSetupStateTool.aliases ?? []).toEqual([])
    expect(getSetupStateTool.audience?.allowed).toEqual(["staff"])
    expect(initializeSetupTool.tier).toBe("write")
    expect(completeSetupStepTool.riskPolicy.reversible).toBe(false)
    expect(skipSetupStepTool.riskPolicy.sideEffects).toEqual(["data-write"])
  })

  it("delegates setup lifecycle operations to the injected service", async () => {
    const step = {
      stepId: "profile",
      firstSeenAt: "2026-07-15T08:00:00.000Z",
      completedAt: null,
      skippedAt: null,
    }
    const initialized = {
      startedAt: "2026-07-15T08:00:00.000Z",
      firstRunOpenedAt: null,
      steps: [step],
      prefill: { profile: { name: "Example" } },
      shouldRedirect: false,
    }
    const services = {
      get: vi.fn().mockResolvedValue({
        state: null,
        selectedSteps: [{ id: "profile", skippable: true }],
        canManage: true,
      }),
      initialize: vi.fn().mockResolvedValue(initialized),
      complete: vi.fn().mockResolvedValue({ ...step, completedAt: step.firstSeenAt }),
      skip: vi.fn().mockResolvedValue({ ...step, skippedAt: step.firstSeenAt }),
    }
    const context: SetupToolContext = { ...baseContext, setup: services }

    await getSetupStateTool.handler({}, context)
    await initializeSetupTool.handler({ stepIds: ["profile"], fresh: false }, context)
    await completeSetupStepTool.handler({ stepId: "profile" }, context)
    await skipSetupStepTool.handler({ stepId: "profile" }, context)

    expect(services.get).toHaveBeenCalledOnce()
    expect(services.initialize).toHaveBeenCalledWith({ stepIds: ["profile"], fresh: false })
    expect(services.complete).toHaveBeenCalledWith("profile")
    expect(services.skip).toHaveBeenCalledWith("profile")
  })

  it("fails closed when the package service contribution is missing", async () => {
    await expect(getSetupStateTool.handler({}, baseContext)).rejects.toMatchObject({
      code: "MISSING_SERVICE",
    })
  })
})
