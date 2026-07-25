import { definePort } from "@voyant-travel/core/project"

export type DurableTripActionKind = "price-trip" | "reserve-trip"

export interface DurableTripActionCommand {
  readonly operationId: string
  readonly action: DurableTripActionKind
  readonly idempotencyKey: string
  readonly requestFingerprint: string
  readonly targetId: string
  readonly input: Readonly<Record<string, unknown>>
}

export interface DurableTripActionResult {
  readonly backendIdentity: string
  readonly providerOperationId: string
  readonly outcome: Readonly<Record<string, unknown>>
}

export interface DurableTripActionCapability {
  readonly protocol: "trips-provider-idempotency-v1"
  readonly backendIdentity: string
  execute(command: DurableTripActionCommand): Promise<DurableTripActionResult>
  reconcile(command: DurableTripActionCommand): Promise<DurableTripActionResult | null>
}

export interface DurableTripActionProbe {
  readonly beforeRestart: DurableTripActionCapability
  readonly afterRestart: DurableTripActionCapability
  acceptedCount(idempotencyKey: string): number
}

/**
 * Exact selected provider capability for Trips pricing and reservation.
 *
 * The framework deliberately ships no implementation. A deployment can select
 * this port only when its composed catalog/flight backend has crash-safe
 * idempotency and reconciliation for the entire Trip operation.
 */
export interface DurableTripActionRuntime {
  readonly price: DurableTripActionCapability
  readonly reserve: DurableTripActionCapability
  createIsolatedProbe(action: DurableTripActionKind): Promise<DurableTripActionProbe>
}

export const durableTripActionRuntimePort = definePort<DurableTripActionRuntime>({
  id: "trips.durable-action-runtime",
  conformance: {
    entry: "@voyant-travel/trips/durable-action-runtime-port",
    export: "durableTripActionRuntimePort",
  },
  async test(runtime) {
    if (
      !runtime ||
      typeof runtime !== "object" ||
      typeof runtime.createIsolatedProbe !== "function"
    ) {
      throw new Error("trips.durable-action-runtime provider is incomplete")
    }
    await assertActionConforms(runtime, "price-trip")
    await assertActionConforms(runtime, "reserve-trip")
  },
})

async function assertActionConforms(
  runtime: DurableTripActionRuntime,
  action: DurableTripActionKind,
): Promise<void> {
  const selected = action === "price-trip" ? runtime.price : runtime.reserve
  assertCapability(selected)
  const selectedIdentity = selected.backendIdentity
  const probe = await runtime.createIsolatedProbe(action)
  assertCapability(probe.beforeRestart)
  assertCapability(probe.afterRestart)
  if (
    probe.beforeRestart.backendIdentity !== selectedIdentity ||
    probe.afterRestart.backendIdentity !== selectedIdentity
  ) {
    throw new Error(
      `trips.durable-action-runtime ${action} backend identity changed across restart`,
    )
  }
  const command: DurableTripActionCommand = {
    operationId: `trips-conformance-${action}`,
    action,
    idempotencyKey: `trips:conformance:${action}`,
    requestFingerprint: `sha256:conformance:${action}`,
    targetId: "trip-conformance",
    input: { conformance: true },
  }
  const first = await probe.beforeRestart.execute(command)
  const replay = await probe.beforeRestart.execute(command)
  const restarted = await probe.afterRestart.reconcile(command)
  assertResult(selectedIdentity, command.operationId, first)
  if (
    JSON.stringify(first) !== JSON.stringify(replay) ||
    JSON.stringify(first) !== JSON.stringify(restarted) ||
    probe.acceptedCount(command.idempotencyKey) !== 1
  ) {
    throw new Error(`trips.durable-action-runtime ${action} failed replay/restart conformance`)
  }
  try {
    await probe.afterRestart.execute({
      ...command,
      requestFingerprint: `${command.requestFingerprint}:drift`,
      input: { conformance: false },
    })
  } catch {
    return
  }
  throw new Error(`trips.durable-action-runtime ${action} accepted command drift`)
}

function assertCapability(
  capability: DurableTripActionCapability,
): asserts capability is DurableTripActionCapability {
  if (
    capability?.protocol !== "trips-provider-idempotency-v1" ||
    typeof capability.backendIdentity !== "string" ||
    capability.backendIdentity.trim().length === 0 ||
    typeof capability.execute !== "function" ||
    typeof capability.reconcile !== "function"
  ) {
    throw new Error(
      "trips.durable-action-runtime must expose an immutable crash-safe provider capability",
    )
  }
}

export function assertDurableTripActionResult(
  capability: DurableTripActionCapability,
  command: DurableTripActionCommand,
  result: DurableTripActionResult,
): void {
  assertResult(capability.backendIdentity, command.operationId, result)
}

function assertResult(
  backendIdentity: string,
  operationId: string,
  result: DurableTripActionResult | null,
): asserts result is DurableTripActionResult {
  if (
    !result ||
    result.backendIdentity !== backendIdentity ||
    typeof result.providerOperationId !== "string" ||
    result.providerOperationId.trim().length === 0 ||
    !result.outcome ||
    typeof result.outcome !== "object" ||
    Array.isArray(result.outcome)
  ) {
    throw new Error(
      `trips.durable-action-runtime returned invalid result for operation ${operationId}`,
    )
  }
}
