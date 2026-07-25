import { assertPortConforms } from "@voyant-travel/core/project"
import { describe, expect, it } from "vitest"

import {
  DURABLE_FLIGHT_ACTION_PROTOCOL,
  type DurableFlightActionCapability,
  type DurableFlightActionCommand,
  type DurableFlightActionKind,
  type DurableFlightActionResult,
  type DurableFlightActionRuntime,
  durableFlightActionRuntimePort,
} from "./durable-action-runtime-port.js"

interface Backend {
  accepted: Map<
    string,
    { organizationId: string; fingerprint: string; result: DurableFlightActionResult }
  >
  attempts: Map<string, number>
}

describe("durableFlightActionRuntimePort", () => {
  it("proves exact replay, restart reconciliation, and request-drift rejection", async () => {
    await expect(
      assertPortConforms(durableFlightActionRuntimePort, conformingRuntime()),
    ).resolves.toBeUndefined()
  })

  it("rejects an incomplete selected runtime", async () => {
    await expect(assertPortConforms(durableFlightActionRuntimePort, {} as never)).rejects.toThrow(
      /provider is incomplete/,
    )
  })

  it("rejects a probe whose backend identity differs from the selected provider", async () => {
    const runtime = conformingRuntime()
    const original = runtime.createIsolatedProbe
    runtime.createIsolatedProbe = async (action) => {
      const probe = await original(action)
      return {
        ...probe,
        afterRestart: capability(action, backend(), "different-backend"),
      }
    }
    await expect(assertPortConforms(durableFlightActionRuntimePort, runtime)).rejects.toThrow(
      /backend identity changed/,
    )
  })

  it("rejects a non-canonical provider identity", async () => {
    const conforming = conformingRuntime()
    const runtime: DurableFlightActionRuntime = {
      ...conforming,
      ticket: capability("ticket-order", backend(), " test-flights-backend "),
    }
    await expect(assertPortConforms(durableFlightActionRuntimePort, runtime)).rejects.toThrow(
      /immutable crash-safe provider capability/,
    )
  })

  it("rejects a provider that mutates state before reporting drift", async () => {
    const runtime = conformingRuntime()
    runtime.createIsolatedProbe = async (action) => {
      const isolated = backend()
      const beforeRestart = capability(action, isolated)
      const afterRestart = capability(action, isolated)
      const originalExecute = afterRestart.execute.bind(afterRestart)
      afterRestart.execute = async (command) => {
        const existing = isolated.accepted.get(command.idempotencyKey)
        if (existing && existing.fingerprint !== command.requestFingerprint) {
          // Mutate durable acceptance count without changing the stored
          // fingerprint, so restart reconcile still returns a result and the
          // port can prove the provider mutated before rejecting drift.
          isolated.attempts.set(
            command.idempotencyKey,
            (isolated.attempts.get(command.idempotencyKey) ?? 0) + 1,
          )
          throw new Error("ambiguous transport after accepting drift")
        }
        return originalExecute(command)
      }
      return {
        beforeRestart,
        afterRestart,
        acceptedCount: (key) => isolated.attempts.get(key) ?? 0,
      }
    }
    await expect(assertPortConforms(durableFlightActionRuntimePort, runtime)).rejects.toThrow()
  })
})

function conformingRuntime(): DurableFlightActionRuntime {
  const selectedBackend = backend()
  return {
    ticket: capability("ticket-order", selectedBackend),
    cancel: capability("cancel-order", selectedBackend),
    async createIsolatedProbe(action) {
      const isolated = backend()
      return {
        beforeRestart: capability(action, isolated),
        afterRestart: capability(action, isolated),
        acceptedCount: (key) => isolated.attempts.get(key) ?? 0,
      }
    },
  }
}

function backend(): Backend {
  return { accepted: new Map(), attempts: new Map() }
}

function capability(
  action: DurableFlightActionKind,
  state: Backend,
  backendIdentity = "test-flights-backend",
): DurableFlightActionCapability {
  return {
    protocol: DURABLE_FLIGHT_ACTION_PROTOCOL,
    backendIdentity,
    async execute(command) {
      assertAction(action, command)
      const existing = state.accepted.get(command.idempotencyKey)
      if (existing) {
        if (
          existing.organizationId !== command.organizationId ||
          existing.fingerprint !== command.requestFingerprint
        ) {
          throw new Error("idempotency payload drift")
        }
        return existing.result
      }
      const result: DurableFlightActionResult = {
        backendIdentity,
        providerOperationId: `provider-${command.operationId}`,
        outcome: { order: { orderId: command.orderId }, action },
      }
      state.accepted.set(command.idempotencyKey, {
        organizationId: command.organizationId,
        fingerprint: command.requestFingerprint,
        result,
      })
      state.attempts.set(
        command.idempotencyKey,
        (state.attempts.get(command.idempotencyKey) ?? 0) + 1,
      )
      return result
    },
    async reconcile(command) {
      assertAction(action, command)
      const existing = state.accepted.get(command.idempotencyKey)
      if (!existing) return null
      if (
        existing.organizationId !== command.organizationId ||
        existing.fingerprint !== command.requestFingerprint
      ) {
        throw new Error("idempotency payload drift")
      }
      return existing.result
    },
  }
}

function assertAction(expected: DurableFlightActionKind, command: DurableFlightActionCommand) {
  if (command.action !== expected) throw new Error("action mismatch")
}
