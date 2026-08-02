import {
  bookingActionProjectionRuntimePort,
  bookingActionSourceRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"

async function synchronize(
  context: VoyantGraphRuntimeFactoryContext,
  mode: "incremental" | "rebuild",
): Promise<void> {
  const [projection, sources] = await Promise.all([
    context.getPort(bookingActionProjectionRuntimePort),
    context.getPorts(bookingActionSourceRuntimePort),
  ])
  await projection.synchronize(sources, mode)
}

/** Frequent convergent refresh; the source readers always reread authority. */
export async function runBookingActionIncrementalProjectionJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  await synchronize(context, "incremental")
}

/** Deterministic full rebuild also invalidates projection rows whose source vanished. */
export async function runBookingActionProjectionRebuildJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  await synchronize(context, "rebuild")
}
