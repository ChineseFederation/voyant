import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import type { LegacyInquiryCutoverProgress } from "./legacy-inquiry-cutover-job-runtime-port.js"
import { legacyInquiryCutoverJobRuntimePort } from "./legacy-inquiry-cutover-job-runtime-port.js"

/** Scheduled resumable cutover pass; becomes a bounded no-op after completion. */
export async function runLegacyInquiryCutoverJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<LegacyInquiryCutoverProgress> {
  const runtime = await context.getPort(legacyInquiryCutoverJobRuntimePort)
  return runtime.run(context.bindings)
}
