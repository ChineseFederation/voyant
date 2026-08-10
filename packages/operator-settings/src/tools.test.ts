import { createToolRegistry, type ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { describe, expect, it, vi } from "vitest"

import type { OperatorSettingsToolContext } from "./tools.js"
import {
  getOperatorSettingsTool,
  UPDATE_OPERATOR_SETTINGS_HANDLER_POLICY,
  updateOperatorSettingsTool,
} from "./tools.js"

const settings = {
  name: "Voyant Travel",
  bankTransferBeneficiary: null,
  iban: null,
  bank: null,
  notes: null,
  customerPaymentPolicy: null,
  bookingCheckoutUrlTemplate: null,
  invoicePayUrlTemplate: null,
}

function context(
  overrides: Partial<NonNullable<OperatorSettingsToolContext["operatorSettings"]>> = {},
): OperatorSettingsToolContext {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "tenant-1",
    resolverScope: {
      locale: "en",
      audience: "staff",
      market: "default",
      actor: "staff",
    },
    operatorSettings: {
      getSettings: vi.fn(async () => settings),
      updateSettings: vi.fn(async () => settings),
      ...overrides,
    },
  }
}

describe("operator settings tools", () => {
  it("reads the combined settings aggregate", async () => {
    const ctx = context()

    await expect(getOperatorSettingsTool.handler({}, ctx)).resolves.toEqual({ settings })
    expect(ctx.operatorSettings?.getSettings).toHaveBeenCalledOnce()
  })

  it("updates settings through the injected service", async () => {
    const updateSettings = vi.fn(async () => settings)
    const registry = createToolRegistry()
    registry.register(updateOperatorSettingsTool, {
      capabilityId: UPDATE_OPERATOR_SETTINGS_HANDLER_POLICY.capabilityId,
      owner: "@voyant-travel/operator-settings",
      capabilityVersion: UPDATE_OPERATOR_SETTINGS_HANDLER_POLICY.capabilityVersion,
      name: UPDATE_OPERATOR_SETTINGS_HANDLER_POLICY.canonicalName,
      requiredScopes: ["settings:write"],
      deploymentRisk: "high",
      actionPolicy: UPDATE_OPERATOR_SETTINGS_HANDLER_POLICY.actionPolicy,
    })
    const actionPolicy = registry.list()[0]?.actionPolicy
    if (!actionPolicy) throw new Error("registered operator settings action is missing")
    const handlerActionPolicy = {
      ...UPDATE_OPERATOR_SETTINGS_HANDLER_POLICY,
      actionPolicy,
      invocation: {
        confirmed: true,
        idempotencyKey: "settings-update-1",
        approvalId: "approval-1",
        idempotencyFingerprint: "sha256:test",
      },
    } as ToolHandlerActionPolicyContext

    await expect(
      registry.dispatch(
        "update_operator_settings",
        { name: "Voyant Travel" },
        {
          ...context({ updateSettings }),
          handlerActionPolicy,
        },
      ),
    ).resolves.toEqual({ settings })
    expect(updateSettings).toHaveBeenCalledWith({ name: "Voyant Travel" }, expect.any(Object))
  })

  it("publishes typed schemas and guarded write risk", () => {
    expect(getOperatorSettingsTool.outputSchema.safeParse({ settings }).success).toBe(true)
    expect(
      updateOperatorSettingsTool.inputSchema.safeParse({ email: "not-an-email" }).success,
    ).toBe(false)
    expect(updateOperatorSettingsTool.requiredScopes).toEqual(["settings:write"])
    expect(updateOperatorSettingsTool.riskPolicy).toMatchObject({
      confirmationRequired: true,
      reversible: true,
      sideEffects: ["data-write"],
    })
    expect(updateOperatorSettingsTool.actionPolicyEnforcement).toBe("handler")
    expect(updateOperatorSettingsTool.resolvesIdempotencyKeyServerSide).toBe(true)
  })
})
