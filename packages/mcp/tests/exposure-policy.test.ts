import type { ToolManifestEntry } from "@voyant-travel/tools"
import type { AccessCatalog } from "@voyant-travel/types/api-keys"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_MCP_EXPOSURE_POLICY,
  evaluateMcpToolExposure,
  normalizeMcpExposurePolicy,
} from "../src/exposure-policy.js"

const catalog: AccessCatalog = {
  presets: [],
  resources: [
    {
      id: "bookings",
      unitId: "bookings",
      resource: "bookings",
      label: "Bookings",
      description: "",
      wildcard: "allow",
      actions: [
        { action: "read", label: "", description: "", remoteSafe: true },
        { action: "write", label: "", description: "", sensitive: true },
      ],
    },
    {
      id: "booking-pii",
      unitId: "bookings",
      resource: "bookings-pii",
      label: "Booking PII",
      description: "",
      wildcard: "explicit-resource",
      actions: [{ action: "read", label: "", description: "", sensitive: true }],
    },
  ],
}

function tool(input: Partial<ToolManifestEntry> = {}): ToolManifestEntry {
  return {
    capabilityId: "bookings.list",
    owner: "bookings",
    capabilityVersion: "v1",
    name: "list_bookings",
    description: "",
    aliases: [],
    inputSchema: {},
    outputSchema: {},
    requiredScopes: ["bookings:read"],
    audience: { source: "grant" },
    deploymentRisk: "low",
    tier: "read",
    riskPolicy: { level: "low" },
    annotations: { readOnlyHint: true },
    ...input,
  }
}

describe("MCP exposure policy", () => {
  it("defaults to low-risk remote-safe reads", () => {
    expect(evaluateMcpToolExposure(tool(), DEFAULT_MCP_EXPOSURE_POLICY, catalog)).toMatchObject({
      enabled: true,
      remoteSafe: true,
      sensitive: false,
    })
    expect(
      evaluateMcpToolExposure(
        tool({ capabilityId: "bookings.cancel", deploymentRisk: "critical" }),
        DEFAULT_MCP_EXPOSURE_POLICY,
        catalog,
      ),
    ).toMatchObject({ enabled: false, reason: "explicit-enable-required" })
  })

  it("requires explicit admission for tools whose scopes are not remote-safe", () => {
    const write = tool({
      capabilityId: "bookings.cancel",
      requiredScopes: ["bookings:write"],
      deploymentRisk: "critical",
      annotations: { readOnlyHint: false },
    })
    const policy = normalizeMcpExposurePolicy({
      allowedRiskLevels: ["low", "medium", "high", "critical"],
      allowWrites: true,
      allowSensitiveData: true,
      toolOverrides: {},
    })
    expect(evaluateMcpToolExposure(write, policy, catalog)).toMatchObject({
      enabled: false,
      reason: "explicit-enable-required",
    })
    expect(
      evaluateMcpToolExposure(
        write,
        { ...policy, toolOverrides: { "bookings.cancel": "allow" } },
        catalog,
      ),
    ).toMatchObject({ enabled: true })
  })

  it("keeps writes and sensitive data behind independent switches", () => {
    const write = tool({
      capabilityId: "bookings.cancel",
      requiredScopes: ["bookings:write"],
      annotations: { readOnlyHint: false },
    })
    const pii = tool({
      capabilityId: "bookings.documents",
      requiredScopes: ["bookings:read", "bookings-pii:read"],
      deploymentRisk: "high",
    })
    const explicitlyAllowed = { ...DEFAULT_MCP_EXPOSURE_POLICY, toolOverrides: {} }

    expect(
      evaluateMcpToolExposure(
        write,
        { ...explicitlyAllowed, toolOverrides: { "bookings.cancel": "allow" } },
        catalog,
      ).reason,
    ).toBe("writes-disabled")
    expect(
      evaluateMcpToolExposure(
        pii,
        { ...explicitlyAllowed, toolOverrides: { "bookings.documents": "allow" } },
        catalog,
      ).reason,
    ).toBe("sensitive-data-disabled")
  })

  it("normalizes malformed persisted values without broadening access", () => {
    expect(
      normalizeMcpExposurePolicy({
        allowedRiskLevels: ["low", "unknown", "critical"],
        allowWrites: "yes",
        allowSensitiveData: 1,
        toolOverrides: { valid: "allow", denied: "deny", invalid: true },
      }),
    ).toEqual({
      allowedRiskLevels: ["low", "critical"],
      allowWrites: false,
      allowSensitiveData: false,
      toolOverrides: { valid: "allow", denied: "deny" },
    })
  })
})
