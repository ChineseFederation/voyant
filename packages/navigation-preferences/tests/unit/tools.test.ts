import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it, vi } from "vitest"

import { voyantToolContextContribution } from "../../src/mcp-runtime.js"
import {
  getNavigationPreferencesTool,
  type NavigationPreferencesToolContext,
  type NavigationPreferencesToolServices,
  navigationPreferencesTools,
  setMyNavigationPreferencesTool,
  setOrganizationNavigationPreferencesTool,
} from "../../src/tools.js"

const baseContext: ToolContext = {
  db: {},
  actor: "staff",
  audience: "staff",
  tenantId: "tenant",
  resolverScope: { locale: "en", audience: "staff", market: "default", actor: "staff" },
}

describe("navigation preference Tools", () => {
  it("declares structural contracts, audience, and risk", () => {
    expect(getNavigationPreferencesTool.inputSchema.safeParse({}).success).toBe(true)
    expect(getNavigationPreferencesTool.aliases ?? []).toEqual([])
    expect(getNavigationPreferencesTool.audience?.allowed).toEqual(["staff"])
    expect(setOrganizationNavigationPreferencesTool.tier).toBe("sensitive")
    expect(setOrganizationNavigationPreferencesTool.riskPolicy.confirmationRequired).toBe(true)
    expect(setMyNavigationPreferencesTool.tier).toBe("write")
  })

  it("delegates reads and both write scopes to the injected service", async () => {
    const snapshot = {
      organization: { finance: false },
      member: { finance: true },
      effective: { finance: true },
      canManageOrganization: true,
    }
    const services = {
      get: vi.fn().mockResolvedValue(snapshot),
      setOrganization: vi.fn().mockResolvedValue({ finance: false }),
      setMember: vi.fn().mockResolvedValue({ finance: true }),
    }
    const context: NavigationPreferencesToolContext = {
      ...baseContext,
      navigationPreferences: services,
    }

    await expect(getNavigationPreferencesTool.handler({}, context)).resolves.toEqual(snapshot)
    await expect(
      setOrganizationNavigationPreferencesTool.handler({ visibility: { finance: false } }, context),
    ).resolves.toEqual({ visibility: { finance: false } })
    await expect(
      setMyNavigationPreferencesTool.handler({ visibility: { finance: true } }, context),
    ).resolves.toEqual({ visibility: { finance: true } })
  })

  it("fails closed when the package service contribution is missing", async () => {
    await expect(getNavigationPreferencesTool.handler({}, baseContext)).rejects.toMatchObject({
      code: "MISSING_SERVICE",
    })
  })

  it("keeps MCP catalog composition available when the grant has no acting member", async () => {
    const contribution = await voyantToolContextContribution.contribute({
      request: { var: {} },
      context: baseContext,
      resources: {},
    })

    expect(contribution).toHaveProperty("navigationPreferences")
    await expect(
      (contribution.navigationPreferences as NavigationPreferencesToolServices).get(),
    ).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
      message: "Navigation preference Tools require an authenticated member.",
    })

    const registry = createToolRegistry()
    registry.registerAll(navigationPreferencesTools)
    await expect(
      registry.dispatch(
        "get_navigation_preferences",
        {},
        {
          ...baseContext,
          navigationPreferences:
            contribution.navigationPreferences as NavigationPreferencesToolServices,
        },
      ),
    ).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    })
  })
})
