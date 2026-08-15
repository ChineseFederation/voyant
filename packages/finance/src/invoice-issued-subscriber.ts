import type { EventEnvelope, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import {
  type CustomFieldsRuntime,
  customFieldsRuntimePort,
} from "@voyant-travel/core/custom-fields"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type FinanceInvoiceDocumentProvider,
  financeInvoiceDocumentProviderPort,
} from "./contracts/invoice-document-provider.js"
import {
  type FulfilInvoiceRenditionOptions,
  fulfilPendingInvoiceRenditions,
} from "./invoice-document-fulfilment.js"
import { financeHostRuntimePort } from "./runtime-port.js"
import { createInvoiceCustomFieldsResolver } from "./service-documents.js"

export const FINANCE_INVOICE_ISSUED_DOCUMENT_SUBSCRIBER_ID =
  "@voyant-travel/finance#subscriber.invoice-issued-document"

export interface InvoiceIssuedPayload {
  invoiceId: string
}

export type InvoiceIssuedEventEnvelope = EventEnvelope<InvoiceIssuedPayload>

export interface InvoiceIssuedDocumentSubscriberOptions {
  resolveDb(bindings: unknown): PostgresJsDatabase | Promise<PostgresJsDatabase>
  provider?: FinanceInvoiceDocumentProvider
  /**
   * Templates may reference `{{customFields.*}}`, and `prepareInvoiceDocument`
   * only populates them when a resolver is supplied. Without it here the same
   * template renders with the customer's fields interactively and without them
   * in the background.
   */
  resolveCustomFields?: FulfilInvoiceRenditionOptions["resolveCustomFields"]
  logger?: Pick<Console, "error">
}

/**
 * Render the document a booking asked for as soon as its invoice is issued.
 *
 * Booking create writes the `pending` rendition inside the same transaction
 * that creates the invoice, and cannot render there: rendering is slow and the
 * transaction holds a lease. So the request is durable state and this is the
 * fast path that turns it into a document — which matters beyond latency,
 * because voyant#4667 made the booking confirmation email wait for the invoice
 * to resolve. Without an in-process trigger every confirmation would sit behind
 * the recovery job's cadence.
 *
 * The rendition row, not the event, is the unit of work: an issuance for an
 * invoice nobody asked a document for finds nothing pending and does nothing.
 */
export function createInvoiceIssuedDocumentSubscriber(
  options: InvoiceIssuedDocumentSubscriberOptions,
): SubscriberRuntimeDescriptor {
  const logger = options.logger ?? console

  return {
    id: FINANCE_INVOICE_ISSUED_DOCUMENT_SUBSCRIBER_ID,
    eventType: "invoice.issued",
    register: ({ bindings, eventBus }) => {
      eventBus.subscribe<InvoiceIssuedPayload>("invoice.issued", async (event) => {
        const invoiceId = event.data?.invoiceId
        if (!invoiceId) return
        try {
          const db = await options.resolveDb(bindings)
          await fulfilPendingInvoiceRenditions(db, {
            invoiceId,
            ...(options.provider ? { provider: options.provider } : {}),
            ...(options.resolveCustomFields
              ? { resolveCustomFields: options.resolveCustomFields }
              : {}),
            eventBus,
          })
        } catch (error) {
          // The recovery job re-drives this row on its own cadence, so a failure
          // here costs latency and not the document.
          logger.error("[invoice-issued-document] could not fulfil requested renditions", {
            invoiceId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })
    },
  }
}

/**
 * Resolve only graph-selected ports. A deployment that selected no provider
 * still registers: the fulfilment engine records the miss on the row, which is
 * what stops `?wait=true` and the notification bundle waiting on work that will
 * never happen.
 */
export const createInvoiceIssuedDocumentSubscriberGraphRuntime = defineGraphRuntimeFactory(
  async ({ getPort, hasPort }) => {
    const host = await getPort(financeHostRuntimePort)
    const provider = hasPort(financeInvoiceDocumentProviderPort)
      ? await getPort(financeInvoiceDocumentProviderPort)
      : undefined
    const customFields = hasPort(customFieldsRuntimePort)
      ? await getPort<CustomFieldsRuntime>(customFieldsRuntimePort)
      : undefined
    return createInvoiceIssuedDocumentSubscriber({
      resolveDb: (bindings) => host.primitives.database.resolve<PostgresJsDatabase>(bindings),
      ...(provider ? { provider } : {}),
      ...(customFields
        ? { resolveCustomFields: createInvoiceCustomFieldsResolver(customFields) }
        : {}),
    })
  },
)
