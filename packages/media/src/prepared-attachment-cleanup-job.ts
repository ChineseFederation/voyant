import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"

import { mediaPreparedAttachmentCleanupRuntimePort } from "./runtime-port.js"

export const PREPARED_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1_000

export async function runMediaPreparedAttachmentCleanupJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  const runtime = await context.getPort(mediaPreparedAttachmentCleanupRuntimePort)
  await runtime.cleanup(context.bindings, new Date(Date.now() - PREPARED_ATTACHMENT_TTL_MS))
}
