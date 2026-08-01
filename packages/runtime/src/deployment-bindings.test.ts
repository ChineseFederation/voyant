import { describe, expect, it } from "vitest"

import {
  resolveRuntimeDeploymentBindings,
  VOYANT_DEPLOYMENT_BINDINGS_ENV,
} from "./deployment-bindings.js"

const GENERATED = {
  mode: "self-hosted" as const,
  providers: {
    storage: "memory",
    cache: "postgres",
    sharedState: "memory",
    rateLimit: "memory",
    adminAuth: "better-auth",
    customerAuth: "better-auth",
    outboundWebhooks: "postgres",
  },
}

describe("runtime deployment bindings", () => {
  it("preserves generated providers when no boot override is configured", () => {
    expect(resolveRuntimeDeploymentBindings(GENERATED, {})).toEqual({
      mode: "self-hosted",
      providers: GENERATED.providers,
      redis: { isolation: "dedicated", network: "trusted" },
      source: "generated",
    })
  })

  it("preserves the Redis safety policy of legacy managed artifacts", () => {
    const deployment = resolveRuntimeDeploymentBindings(
      {
        ...GENERATED,
        mode: "managed-cloud",
        providers: { ...GENERATED.providers, cache: "redis", rateLimit: "redis" },
      },
      {},
    )

    expect(deployment.redis).toEqual({ isolation: "shared", network: "untrusted" })
  })

  it("overlays providers and keeps isolation separate from network trust", () => {
    const deployment = resolveRuntimeDeploymentBindings(GENERATED, {
      [VOYANT_DEPLOYMENT_BINDINGS_ENV]: JSON.stringify({
        providers: {
          cache: "redis",
          rateLimit: "redis",
          adminAuth: "voyant-cloud",
          customerAuth: "disabled",
        },
        redis: { isolation: "shared", network: "untrusted" },
      }),
    })

    expect(deployment).toMatchObject({
      providers: {
        storage: "memory",
        cache: "redis",
        sharedState: "memory",
        rateLimit: "redis",
        adminAuth: "voyant-cloud",
        customerAuth: "disabled",
      },
      redis: { isolation: "shared", network: "untrusted" },
      source: "runtime",
    })
  })

  it("requires explicit Redis properties for every runtime-selected Redis binding", () => {
    expect(() =>
      resolveRuntimeDeploymentBindings(GENERATED, {
        [VOYANT_DEPLOYMENT_BINDINGS_ENV]: JSON.stringify({
          providers: { cache: "redis" },
        }),
      }),
    ).toThrow(/redis is required.*Declare isolation and network explicitly/)
  })

  it("rejects unknown fields and unsupported known provider values", () => {
    expect(() =>
      resolveRuntimeDeploymentBindings(GENERATED, {
        [VOYANT_DEPLOYMENT_BINDINGS_ENV]: JSON.stringify({ unexpected: true }),
      }),
    ).toThrow(/unknown field: unexpected/)
    expect(() =>
      resolveRuntimeDeploymentBindings(GENERATED, {
        [VOYANT_DEPLOYMENT_BINDINGS_ENV]: JSON.stringify({
          providers: { adminAuth: "custom" },
        }),
      }),
    ).toThrow(/providers\.adminAuth is not supported/)
  })

  it("canonicalizes legacy payment provider values at the runtime boundary", () => {
    const deployment = resolveRuntimeDeploymentBindings(GENERATED, {
      [VOYANT_DEPLOYMENT_BINDINGS_ENV]: JSON.stringify({
        providers: { payments: "voyant-payments" },
      }),
    })

    expect(deployment.providers.payments).toBe("voyant-pay")
  })
})
