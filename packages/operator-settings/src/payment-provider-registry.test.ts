import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it } from "vitest"

import { createDefaultPaymentProviderRegistry } from "./payment-provider-registry.js"

/** Minimal db stub — the single-row read resolves to an empty result. */
const emptyDb = {
  select: () => ({
    from: () => ({
      orderBy: () => ({
        limit: async () => [] as unknown[],
      }),
    }),
  }),
} as unknown as PostgresJsDatabase

const legacyVoyantPayDb = {
  select: () => ({
    from: () => ({
      orderBy: () => ({
        limit: async () => [
          {
            activeProviderId: "voyant-payments",
            status: "connected",
            mode: "sandbox",
          },
        ],
      }),
    }),
  }),
} as unknown as PostgresJsDatabase

const managedEnv = { VOYANT_PAYMENTS_CONTROL_PLANE_URL: "https://payments.example" }

describe("default payment provider registry", () => {
  it("lists the catalog", async () => {
    const registry = createDefaultPaymentProviderRegistry({ db: emptyDb, env: {} })
    const providers = await registry.listProviders()
    expect(providers.map((p) => p.id)).toContain("netopia")
  })

  describe("self-host (no control plane)", () => {
    it("reports read-only, env-derived connection", async () => {
      const registry = createDefaultPaymentProviderRegistry({
        db: emptyDb,
        env: { NETOPIA_MERCHANT_ID: "M1", NETOPIA_SANDBOX: "true" },
      })
      const status = await registry.getConnection()
      expect(status).toMatchObject({
        activeProviderId: "netopia",
        status: "connected",
        mode: "sandbox",
        readOnly: true,
      })
    })

    it("refuses to connect (configured via environment)", async () => {
      const registry = createDefaultPaymentProviderRegistry({ db: emptyDb, env: {} })
      const result = await registry.connect({
        providerId: "netopia",
        mode: "sandbox",
        credentials: {},
      })
      expect(result.ok).toBe(false)
    })

    it("summarizes the env-pinned connection as active and ready", async () => {
      const registry = createDefaultPaymentProviderRegistry({
        db: emptyDb,
        env: { NETOPIA_MERCHANT_ID: "M1", NETOPIA_SANDBOX: "true" },
      })
      const status = await registry.getConnection()
      expect(status.activeConnectionId).toBe("environment")
      expect(status.connections).toEqual([
        expect.objectContaining({
          providerId: "netopia",
          connectionId: "environment",
          state: "connected",
          readiness: "ready",
          active: true,
          readOnly: true,
        }),
      ])
    })

    it("refuses to activate (read-only, configured via environment)", async () => {
      const registry = createDefaultPaymentProviderRegistry({
        db: emptyDb,
        env: { NETOPIA_MERCHANT_ID: "M1", NETOPIA_SANDBOX: "true" },
      })
      const result = await registry.activate?.({
        providerId: "netopia",
        connectionId: "environment",
      })
      expect(result?.ok).toBe(false)
      expect(result?.activated).toBeUndefined()
      expect(result?.error).toContain("environment")
    })

    it("does not infer a hosted-account connection from a fake API key", async () => {
      const registry = createDefaultPaymentProviderRegistry({
        db: emptyDb,
        env: { VOYANT_PAYMENTS_API_KEY: "must-not-be-used" },
      })
      await expect(registry.getConnection()).resolves.toMatchObject({
        activeProviderId: null,
        status: "disconnected",
        readOnly: true,
      })
    })
  })

  describe("managed", () => {
    it("returns the canonical id for a legacy persisted Voyant Payments connection", async () => {
      const registry = createDefaultPaymentProviderRegistry({
        db: legacyVoyantPayDb,
        env: managedEnv,
      })
      await expect(registry.getConnection()).resolves.toMatchObject({
        activeProviderId: "voyant-pay",
      })
    })

    it("rejects an unknown provider", async () => {
      const registry = createDefaultPaymentProviderRegistry({ db: emptyDb, env: managedEnv })
      const result = await registry.connect({
        providerId: "nope",
        mode: "sandbox",
        credentials: {},
      })
      expect(result).toMatchObject({ ok: false })
      expect(result.error).toContain("Unknown")
    })

    it("rejects a coming-soon provider", async () => {
      const registry = createDefaultPaymentProviderRegistry({ db: emptyDb, env: managedEnv })
      const result = await registry.connect({
        providerId: "voyant-pay",
        mode: "sandbox",
        credentials: {},
      })
      expect(result.ok).toBe(false)
    })

    it("fails closed when hosted onboarding is not available", async () => {
      const registry = createDefaultPaymentProviderRegistry({ db: emptyDb, env: managedEnv })
      const result = await registry.beginOnboarding({
        providerId: "voyant-pay",
        mode: "sandbox",
      })
      expect(result).toMatchObject({
        ok: false,
        status: { status: "disconnected" },
      })
      expect(result.session).toBeUndefined()
      expect(result.error).toContain("not yet available")
    })

    it("accepts the legacy Voyant Payments request id", async () => {
      const registry = createDefaultPaymentProviderRegistry({ db: emptyDb, env: managedEnv })
      const result = await registry.beginOnboarding({
        providerId: "voyant-payments",
        mode: "sandbox",
      })
      expect(result.error).toContain("Voyant Pay")
    })

    it("fails closed on activation without inventing an active switch", async () => {
      const registry = createDefaultPaymentProviderRegistry({ db: emptyDb, env: managedEnv })
      const result = await registry.activate?.({
        providerId: "netopia",
        connectionId: "conn_1",
      })
      expect(result?.ok).toBe(false)
      expect(result?.activated).toBeUndefined()
      expect(result?.error).toContain("not yet available")
    })

    it("rejects activating an unknown provider", async () => {
      const registry = createDefaultPaymentProviderRegistry({ db: emptyDb, env: managedEnv })
      const result = await registry.activate?.({
        providerId: "nope",
        connectionId: "conn_1",
      })
      expect(result?.ok).toBe(false)
      expect(result?.error).toContain("Unknown")
    })

    it("rejects missing required credentials", async () => {
      const registry = createDefaultPaymentProviderRegistry({ db: emptyDb, env: managedEnv })
      const result = await registry.connect({
        providerId: "netopia",
        mode: "sandbox",
        credentials: {},
      })
      expect(result.ok).toBe(false)
    })

    it("validates then reports brokering unavailable for valid credentials", async () => {
      const registry = createDefaultPaymentProviderRegistry({ db: emptyDb, env: managedEnv })
      const result = await registry.connect({
        providerId: "netopia",
        mode: "sandbox",
        credentials: {
          merchantId: "M1",
          apiKey: "k",
          posSignature: "sig",
          ipnPublicKey: "-----BEGIN PUBLIC KEY-----",
        },
      })
      expect(result.ok).toBe(false)
      expect(result.error).toContain("not yet available")
    })
  })
})
