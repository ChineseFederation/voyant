import { customerBusinessAccountOnboardingRuntimePort } from "@voyant-travel/auth/customer-business-onboarding-runtime-port"
import { catalogSearchRuntimePort } from "@voyant-travel/catalog/api-runtime-ports"
import { catalogRuntimeServicesPort } from "@voyant-travel/catalog/runtime-contracts"
import { describe, expect, it, vi } from "vitest"

import { createStorefrontRuntimePortContribution } from "../../src/runtime-contributor.js"
import { storefrontOpaqueReferenceIssuerPort } from "../../src/shopping/provider-ports.js"
import { storefrontShoppingRuntimePort } from "../../src/shopping/runtime-port.js"

function primitives() {
  return {
    env: vi.fn(() => ({})),
    database: {
      resolve: vi.fn(),
      fromContext: vi.fn(),
      transaction: vi.fn(),
    },
    storage: {
      resolve: vi.fn(),
      read: vi.fn(),
      downloadUrl: vi.fn(),
    },
    events: { deliver: vi.fn() },
    config: { read: vi.fn() },
  }
}

describe("storefront customer business onboarding runtime contribution", () => {
  it("provides the standard implementation when the host has no override", () => {
    const ports = createStorefrontRuntimePortContribution({ primitives: primitives() })
    expect(ports[customerBusinessAccountOnboardingRuntimePort.id]).toBeDefined()
  })

  it("omits the standard implementation when a self-hoster seeded an override", () => {
    const ports = createStorefrontRuntimePortContribution({
      primitives: primitives(),
      hasRuntimePort: ({ id }) => id === customerBusinessAccountOnboardingRuntimePort.id,
    })
    expect(ports).not.toHaveProperty(customerBusinessAccountOnboardingRuntimePort.id)
  })

  it("keeps managed shopping absent until every closed dependency is configured", () => {
    const ports = createStorefrontRuntimePortContribution({
      primitives: primitives(),
      hasRuntimePort: ({ id }) => id === catalogSearchRuntimePort.id,
      getRuntimePort: vi.fn(),
    })
    expect(ports).not.toHaveProperty(storefrontShoppingRuntimePort.id)
  })

  it("contributes the closed live provider without a browser-selected provider port", async () => {
    const providers = new Map<string, unknown>([
      [catalogSearchRuntimePort.id, { resolveRuntime: vi.fn() }],
      [catalogRuntimeServicesPort.id, { fieldPolicyRegistries: vi.fn() }],
      [storefrontOpaqueReferenceIssuerPort.id, { issue: vi.fn(), redeem: vi.fn() }],
    ])
    const ports = createStorefrontRuntimePortContribution({
      primitives: primitives(),
      hasRuntimePort: ({ id }) => providers.has(id),
      getRuntimePort: ({ id }) => providers.get(id) as never,
    })
    await expect(ports[storefrontShoppingRuntimePort.id]).resolves.toEqual(
      expect.objectContaining({ resolveScope: expect.any(Function), search: expect.any(Function) }),
    )
  })
})
