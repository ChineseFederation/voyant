import type { DepartureServiceOperationStatus } from "./schema-departure-operations.js"

/**
 * Allowed status transitions for a departure service operation line.
 *
 * The happy path advances a line from `planned` through supplier arrangement
 * (`requested` → `confirmed`) to operationally `ready`, then `completed` once
 * delivered. Any non-terminal state may be `cancelled` or flagged as an
 * `exception`; an `exception` is recoverable back into the flow (it is a "needs
 * attention" marker, not a dead end). `completed` and `cancelled` are terminal.
 */
const ALLOWED_TRANSITIONS: Record<
  DepartureServiceOperationStatus,
  readonly DepartureServiceOperationStatus[]
> = {
  planned: ["requested", "confirmed", "ready", "cancelled", "exception"],
  requested: ["confirmed", "ready", "cancelled", "exception"],
  confirmed: ["ready", "cancelled", "exception"],
  ready: ["completed", "cancelled", "exception"],
  completed: [],
  cancelled: [],
  exception: ["planned", "requested", "confirmed", "ready", "cancelled"],
}

/**
 * True when a line may move from `from` to `to`. A no-op transition
 * (`from === to`) is always allowed so an idempotent re-apply never trips the
 * guard.
 */
export function canTransitionDepartureServiceOperation(
  from: DepartureServiceOperationStatus,
  to: DepartureServiceOperationStatus,
): boolean {
  if (from === to) return true
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/** Thrown when a departure service operation status change is not permitted. */
export class DepartureServiceOperationTransitionError extends Error {
  constructor(
    readonly from: DepartureServiceOperationStatus,
    readonly to: DepartureServiceOperationStatus,
  ) {
    super(`Cannot transition departure service operation from "${from}" to "${to}"`)
    this.name = "DepartureServiceOperationTransitionError"
  }
}

/** Assert a transition is permitted, throwing otherwise. */
export function assertDepartureServiceOperationTransition(
  from: DepartureServiceOperationStatus,
  to: DepartureServiceOperationStatus,
): void {
  if (!canTransitionDepartureServiceOperation(from, to)) {
    throw new DepartureServiceOperationTransitionError(from, to)
  }
}
