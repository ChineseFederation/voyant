import {
  type CustomFieldsRuntime,
  customFieldsRuntimePort,
} from "@voyant-travel/core/custom-fields"
import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { createPrimitivesEventBus } from "./app-api-runtime.js"
import { financeInvoiceDocumentProviderPort } from "./contracts/invoice-document-provider.js"
import { fulfilPendingInvoiceRenditions } from "./invoice-document-fulfilment.js"
import { financeHostRuntimePort } from "./runtime-port.js"
import { createInvoiceCustomFieldsResolver } from "./service-documents.js"

/**
 * Raised once, after the drain, when requested invoice documents could not be
 * produced because the deployment selected no renderer.
 *
 * It is deliberately raised *after* the rows are recorded rather than instead
 * of recording them. A row left pending is indistinguishable from work in
 * flight — `?wait=true` blocks on it and the confirmation notification holds
 * for it — so the recording is what unblocks the deployment, and the throw is
 * only how an operator finds out.
 */
export class InvoiceDocumentRendererUnavailableError extends Error {
  constructor(readonly renditionIds: readonly string[]) {
    super(
      `${renditionIds.length} requested invoice document(s) could not be produced: no document renderer is available on this deployment.`,
    )
    this.name = "InvoiceDocumentRendererUnavailableError"
  }
}

/**
 * Reconcile requested invoice renditions the in-process path did not fulfil.
 *
 * The subscriber renders on `invoice.issued` and is the latency path; this is
 * the recovery leg for everything it cannot cover — a restart mid-render, a
 * transient renderer failure, a rendition requested through the API against an
 * invoice that was issued long ago, and a deployment whose renderer was only
 * configured after the fact.
 */
export async function runDueInvoiceDocumentRenditionsJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  const host = await context.getPort(financeHostRuntimePort)
  const db = host.primitives.database.resolve<PostgresJsDatabase>(context.bindings)
  const provider = context.hasPort(financeInvoiceDocumentProviderPort)
    ? await context.getPort(financeInvoiceDocumentProviderPort)
    : undefined
  // Same resolver the routes and the subscriber use: a template referencing
  // `{{customFields.*}}` must not render differently depending on which path
  // produced the document.
  const customFields = context.hasPort(customFieldsRuntimePort)
    ? await context.getPort<CustomFieldsRuntime>(customFieldsRuntimePort)
    : undefined

  const eventBus = createPrimitivesEventBus(host.primitives, context.bindings)
  const outcomes = await fulfilPendingInvoiceRenditions(db, {
    ...(provider ? { provider } : {}),
    ...(customFields
      ? { resolveCustomFields: createInvoiceCustomFieldsResolver(customFields) }
      : {}),
    ...(eventBus ? { eventBus } : {}),
  })

  // Rows waiting on an accounting app to allocate a number are skipped, not
  // failed, and must not raise: on an app-backed deployment they are pending by
  // design and would otherwise make this job fail every minute forever.
  const unavailable = outcomes.filter(
    (outcome) => outcome.status === "failed" && outcome.reason === "document_renderer_unavailable",
  )
  if (unavailable.length > 0) {
    throw new InvoiceDocumentRendererUnavailableError(
      unavailable.map((outcome) => outcome.renditionId),
    )
  }
}
