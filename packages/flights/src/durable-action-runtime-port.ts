import { definePort } from "@voyant-travel/core/project"

export const DURABLE_FLIGHT_ACTION_PROTOCOL = "flights-provider-idempotency-v1" as const

export type DurableFlightActionKind = "ticket-order" | "cancel-order"

export interface DurableFlightActionCommand {
  readonly operationId: string
  readonly action: DurableFlightActionKind
  /**
   * Immutable tenant authority from the admitted command. Providers MUST use
   * this scope when resolving the supplier connection and order.
   */
  readonly organizationId: string
  readonly idempotencyKey: string
  readonly requestFingerprint: string
  readonly orderId: string
  readonly input: Readonly<Record<string, unknown>>
}

export interface DurableFlightActionResult {
  readonly backendIdentity: string
  readonly providerOperationId: string
  readonly outcome: Readonly<Record<string, unknown>>
}

export interface DurableFlightActionCapability {
  readonly protocol: typeof DURABLE_FLIGHT_ACTION_PROTOCOL
  readonly backendIdentity: string
  execute(command: DurableFlightActionCommand): Promise<DurableFlightActionResult>
  reconcile(command: DurableFlightActionCommand): Promise<DurableFlightActionResult | null>
}

export interface DurableFlightActionProbe {
  readonly beforeRestart: DurableFlightActionCapability
  readonly afterRestart: DurableFlightActionCapability
  acceptedCount(idempotencyKey: string): number | Promise<number>
}

/**
 * Exact selected provider authority for supplier ticketing and cancellation.
 *
 * This is deliberately separate from `flights.runtime`: read/search/admin
 * connector wiring does not prove that supplier mutations are crash-safe.
 */
export interface DurableFlightActionRuntime {
  readonly ticket: DurableFlightActionCapability
  readonly cancel: DurableFlightActionCapability
  createIsolatedProbe(action: DurableFlightActionKind): Promise<DurableFlightActionProbe>
}

export const durableFlightActionRuntimePort = definePort<DurableFlightActionRuntime>({
  id: "flights.durable-action-runtime",
  conformance: {
    entry: "@voyant-travel/flights/durable-action-runtime-port",
    export: "durableFlightActionRuntimePort",
  },
  async test(runtime) {
    if (
      !runtime ||
      typeof runtime !== "object" ||
      typeof runtime.createIsolatedProbe !== "function"
    ) {
      throw new Error("flights.durable-action-runtime provider is incomplete")
    }
    await assertActionConforms(runtime, "ticket-order")
    await assertActionConforms(runtime, "cancel-order")
  },
})

async function assertActionConforms(
  runtime: DurableFlightActionRuntime,
  action: DurableFlightActionKind,
): Promise<void> {
  const selected = capabilityFor(runtime, action)
  assertCapability(selected)
  const probe = await runtime.createIsolatedProbe(action)
  assertCapability(probe.beforeRestart)
  assertCapability(probe.afterRestart)
  if (
    probe.beforeRestart.backendIdentity !== selected.backendIdentity ||
    probe.afterRestart.backendIdentity !== selected.backendIdentity
  ) {
    throw new Error(
      `flights.durable-action-runtime ${action} backend identity changed across restart`,
    )
  }

  const command: DurableFlightActionCommand = {
    operationId: `flights-conformance-${action}`,
    action,
    organizationId: "org-flights-conformance",
    idempotencyKey: `flights:conformance:${action}`,
    requestFingerprint: `sha256:conformance:${action}`,
    orderId: "flight-order-conformance",
    input: action === "cancel-order" ? { reason: "other" } : {},
  }
  const first = await probe.beforeRestart.execute(command)
  const replay = await probe.beforeRestart.execute(command)
  const restarted = await probe.afterRestart.reconcile(command)
  assertDurableFlightActionResult(selected, command, first)
  if (
    JSON.stringify(first) !== JSON.stringify(replay) ||
    JSON.stringify(first) !== JSON.stringify(restarted) ||
    (await probe.acceptedCount(command.idempotencyKey)) !== 1
  ) {
    throw new Error(`flights.durable-action-runtime ${action} failed replay/restart conformance`)
  }
  let driftRejected = false
  try {
    await probe.afterRestart.execute({
      ...command,
      requestFingerprint: `${command.requestFingerprint}:drift`,
      input: { conformance: false },
    })
  } catch {
    driftRejected = true
  }
  if (!driftRejected) {
    throw new Error(`flights.durable-action-runtime ${action} accepted command drift`)
  }
  const afterDrift = await probe.afterRestart.reconcile(command)
  if (
    JSON.stringify(first) !== JSON.stringify(afterDrift) ||
    (await probe.acceptedCount(command.idempotencyKey)) !== 1
  ) {
    throw new Error(
      `flights.durable-action-runtime ${action} mutated state before rejecting command drift`,
    )
  }

  let tenantDriftRejected = false
  try {
    await probe.afterRestart.execute({
      ...command,
      organizationId: "org-flights-conformance-other",
    })
  } catch {
    tenantDriftRejected = true
  }
  if (!tenantDriftRejected) {
    throw new Error(`flights.durable-action-runtime ${action} accepted tenant scope drift`)
  }
  const afterTenantDrift = await probe.afterRestart.reconcile(command)
  if (
    JSON.stringify(first) !== JSON.stringify(afterTenantDrift) ||
    (await probe.acceptedCount(command.idempotencyKey)) !== 1
  ) {
    throw new Error(
      `flights.durable-action-runtime ${action} mutated state before rejecting tenant scope drift`,
    )
  }
}

function capabilityFor(
  runtime: DurableFlightActionRuntime,
  action: DurableFlightActionKind,
): DurableFlightActionCapability {
  return action === "ticket-order" ? runtime.ticket : runtime.cancel
}

function assertCapability(
  capability: DurableFlightActionCapability,
): asserts capability is DurableFlightActionCapability {
  if (
    capability?.protocol !== DURABLE_FLIGHT_ACTION_PROTOCOL ||
    typeof capability.backendIdentity !== "string" ||
    capability.backendIdentity.trim().length === 0 ||
    capability.backendIdentity !== capability.backendIdentity.trim() ||
    typeof capability.execute !== "function" ||
    typeof capability.reconcile !== "function"
  ) {
    throw new Error(
      "flights.durable-action-runtime must expose an immutable crash-safe provider capability",
    )
  }
}

export function assertDurableFlightActionResult(
  capability: DurableFlightActionCapability,
  command: DurableFlightActionCommand,
  result: DurableFlightActionResult | null,
): asserts result is DurableFlightActionResult {
  if (
    !result ||
    result.backendIdentity !== capability.backendIdentity ||
    typeof result.providerOperationId !== "string" ||
    result.providerOperationId.trim().length === 0 ||
    result.providerOperationId !== result.providerOperationId.trim() ||
    !result.outcome ||
    typeof result.outcome !== "object" ||
    Array.isArray(result.outcome)
  ) {
    throw new Error(
      `flights.durable-action-runtime returned invalid result for operation ${command.operationId}`,
    )
  }
}
