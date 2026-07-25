import { assertPortConforms } from "@voyant-travel/core/project"
import { describe, expect, it } from "vitest"

import {
  type DurableTripActionCapability,
  type DurableTripActionCommand,
  durableTripActionRuntimePort,
} from "../src/durable-action-runtime-port.js"

describe("durable Trip action provider conformance", () => {
  it("proves exact replay, restart reconciliation, payload drift rejection, and identity", async () => {
    await expect(
      assertPortConforms(durableTripActionRuntimePort, conformingRuntime()),
    ).resolves.toBeUndefined()
  })

  it("rejects an identity change after restart", async () => {
    const runtime = conformingRuntime()
    runtime.createIsolatedProbe = async (action) => ({
      beforeRestart: memoryCapability(`backend:${action}`),
      afterRestart: memoryCapability(`changed:${action}`),
      acceptedCount: () => 1,
    })
    await expect(assertPortConforms(durableTripActionRuntimePort, runtime)).rejects.toThrow(
      /backend identity changed/,
    )
  })
})

function conformingRuntime() {
  const capabilities = {
    price: memoryCapability("backend:price-trip"),
    reserve: memoryCapability("backend:reserve-trip"),
  }
  return {
    ...capabilities,
    async createIsolatedProbe(action: "price-trip" | "reserve-trip") {
      const state = new Map<string, { fingerprint: string; result: object }>()
      const identity = `backend:${action}`
      return {
        beforeRestart: memoryCapability(identity, state),
        afterRestart: memoryCapability(identity, state),
        acceptedCount(idempotencyKey: string) {
          return state.has(idempotencyKey) ? 1 : 0
        },
      }
    },
  }
}

function memoryCapability(
  backendIdentity: string,
  state = new Map<string, { fingerprint: string; result: object }>(),
): DurableTripActionCapability {
  return {
    protocol: "trips-provider-idempotency-v1",
    backendIdentity,
    async execute(command) {
      const existing = state.get(command.idempotencyKey)
      if (existing) {
        if (existing.fingerprint !== command.requestFingerprint) throw new Error("command drift")
        return existing.result as never
      }
      const result = {
        backendIdentity,
        providerOperationId: `provider:${command.operationId}`,
        outcome: { accepted: true },
      }
      state.set(command.idempotencyKey, {
        fingerprint: command.requestFingerprint,
        result,
      })
      return result
    },
    async reconcile(command: DurableTripActionCommand) {
      const existing = state.get(command.idempotencyKey)
      if (!existing) return null
      if (existing.fingerprint !== command.requestFingerprint) throw new Error("command drift")
      return existing.result as never
    },
  }
}
