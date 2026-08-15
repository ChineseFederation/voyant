import {
  type ExternalInvoiceDocumentInput,
  formatExternalDocumentLabel,
  isCancelledExternalDocumentStatus,
} from "@voyant-travel/finance-contracts"
import { and, eq, inArray, ne } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { invoiceExternalRefs, invoiceLineItems, invoices } from "./schema.js"
import type { CreateInvoiceExternalRefInput } from "./service-shared.js"

/**
 * Recording a sale against a fiscal document the operator already issued
 * elsewhere, and refusing to issue a second one over the top of it.
 *
 * voyant#4688: back-filling a booking for an already-invoiced sale mirrored a
 * second real fiscal document to the accounting provider — same customer, same
 * amount, same date, different series — and for a Romanian operator both landed
 * in e-Factura. There was no flag that said "this sale is already invoiced",
 * and `voidInvoice` refuses once a payment is recorded, so there was no way
 * forward and no way back.
 *
 * The external reference row is what carries the fact. Writing one alongside a
 * suppressed mirror is the declaration; reading them back is the guard.
 */

/** The metadata key the platform's own bookkeeping lives under on a ref row. */
export const EXTERNAL_DOCUMENT_METADATA_KEY = "voyantExternalDocument"

/** Where the identities of documents this reference used to point at are kept. */
export const SUPERSEDED_DOCUMENTS_METADATA_KEY = "voyantSupersededDocuments"

export interface LiveBookingExternalDocument {
  invoiceId: string
  invoiceNumber: string
  invoiceStatus: string
  provider: string
  externalId: string | null
  externalNumber: string | null
  externalUrl: string | null
  status: string | null
  /** `"SERIES 1234"`, for an operator-facing refusal message. */
  label: string
}

/**
 * Translate an operator's "already invoiced externally" declaration into the
 * external reference row that records it.
 *
 * `series` has no column of its own — the providers this targets number within
 * a series, but `external_number` is the document's number, so the series rides
 * in metadata next to the rest of the operator's declaration.
 */
export function externalDocumentToRefInput(
  document: ExternalInvoiceDocumentInput,
  options: { recordedAt?: Date } = {},
): CreateInvoiceExternalRefInput {
  const recordedAt = (options.recordedAt ?? new Date()).toISOString()
  return {
    provider: document.provider,
    externalId: document.externalId ?? null,
    externalNumber: document.number,
    externalUrl: document.externalUrl ?? null,
    // Not a provider status: the platform never called the provider. It says
    // the document exists there and this row did not put it there.
    status: "recorded_externally",
    metadata: {
      [EXTERNAL_DOCUMENT_METADATA_KEY]: {
        series: document.series ?? null,
        number: document.number,
        issuedAt: document.issuedAt ?? null,
        note: document.note ?? null,
        recordedAt,
      },
    },
    // The operator issued it; the platform did not sync it. `syncedAt` would
    // claim a successful mirror that never ran.
    syncedAt: null,
    syncError: null,
  }
}

function readSeries(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null
  const scoped = (metadata as Record<string, unknown>)[EXTERNAL_DOCUMENT_METADATA_KEY]
  if (typeof scoped !== "object" || scoped === null) return null
  const series = (scoped as Record<string, unknown>).series
  return typeof series === "string" ? series : null
}

/**
 * A live fiscal document already covering what a new invoice for this booking
 * would cover, if there is one.
 *
 * **"Live"** is two conditions, and both matter. The invoice must not be void —
 * a voided invoice's document is not the operator's current record of the sale.
 * And the reference's own status must not be one of the cancelled words: a
 * document retracted in the provider's UI (see `supersedeInvoiceExternalRef`)
 * has to stop blocking, otherwise the only remedy for the first duplicate would
 * permanently prevent the correction.
 *
 * **"Covering the same thing"** is what keeps this from breaking ordinary
 * travel invoicing. A booking legitimately has more than one fiscal document —
 * a deposit and a balance are two real sales of two different amounts — so
 * "this booking already has a document" is not on its own a duplicate. The
 * question is overlap:
 *
 * - a request naming a payment schedule overlaps a document whose invoice bills
 *   that same schedule, and one that bills the booking as a whole
 * - a request naming none is for the whole booking, so it overlaps any document
 *   the booking has
 *
 * When it cannot tell, it does not refuse. A guard that blocks a legitimate
 * balance invoice costs more than the duplicate it would have caught, and the
 * declaration (`externalDocument`) is the primary remedy here — this is the
 * backstop.
 */
export async function findLiveBookingExternalDocument(
  db: PostgresJsDatabase,
  bookingId: string,
  options: { excludeInvoiceId?: string; bookingPaymentScheduleId?: string | null } = {},
): Promise<LiveBookingExternalDocument | null> {
  const rows = await db
    .select({
      invoiceId: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      invoiceStatus: invoices.status,
      provider: invoiceExternalRefs.provider,
      externalId: invoiceExternalRefs.externalId,
      externalNumber: invoiceExternalRefs.externalNumber,
      externalUrl: invoiceExternalRefs.externalUrl,
      status: invoiceExternalRefs.status,
      metadata: invoiceExternalRefs.metadata,
    })
    .from(invoiceExternalRefs)
    .innerJoin(invoices, eq(invoices.id, invoiceExternalRefs.invoiceId))
    .where(and(eq(invoices.bookingId, bookingId), ne(invoices.status, "void")))

  const candidates = rows.filter((row) => {
    if (options.excludeInvoiceId && row.invoiceId === options.excludeInvoiceId) return false
    if (isCancelledExternalDocumentStatus(row.status)) return false
    // A reference with no identity at all is a placeholder the provider has not
    // answered yet, not a document that exists. Blocking on one would refuse
    // every issuance a pending external allocation is waiting on.
    return Boolean(row.externalId || row.externalNumber)
  })
  if (candidates.length === 0) return null

  const overlapping = options.bookingPaymentScheduleId
    ? await filterToOverlappingSchedule(db, candidates, options.bookingPaymentScheduleId)
    : candidates
  const row = overlapping[0]
  if (!row) return null

  return {
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    invoiceStatus: row.invoiceStatus,
    provider: row.provider,
    externalId: row.externalId,
    externalNumber: row.externalNumber,
    externalUrl: row.externalUrl,
    status: row.status,
    label: formatExternalDocumentLabel({
      series: readSeries(row.metadata),
      externalNumber: row.externalNumber,
    }),
  }
}

type ExternalDocumentCandidate = {
  invoiceId: string
  invoiceNumber: string
  invoiceStatus: string
  provider: string
  externalId: string | null
  externalNumber: string | null
  externalUrl: string | null
  status: string | null
  metadata: unknown
}

/**
 * Keep the candidates whose invoice bills the given schedule, plus those that
 * bill no schedule at all — a whole-booking document already covers every
 * schedule in it, so a per-schedule invoice on top of one is still a second
 * document for money already invoiced.
 */
async function filterToOverlappingSchedule(
  db: PostgresJsDatabase,
  candidates: ExternalDocumentCandidate[],
  bookingPaymentScheduleId: string,
): Promise<ExternalDocumentCandidate[]> {
  const lines = await db
    .select({
      invoiceId: invoiceLineItems.invoiceId,
      bookingPaymentScheduleId: invoiceLineItems.bookingPaymentScheduleId,
    })
    .from(invoiceLineItems)
    .where(
      inArray(
        invoiceLineItems.invoiceId,
        candidates.map((candidate) => candidate.invoiceId),
      ),
    )

  const scheduleIdsByInvoice = new Map<string, Set<string>>()
  for (const line of lines) {
    const scoped = scheduleIdsByInvoice.get(line.invoiceId) ?? new Set<string>()
    if (line.bookingPaymentScheduleId) scoped.add(line.bookingPaymentScheduleId)
    scheduleIdsByInvoice.set(line.invoiceId, scoped)
  }

  return candidates.filter((candidate) => {
    const scoped = scheduleIdsByInvoice.get(candidate.invoiceId)
    if (!scoped || scoped.size === 0) return true
    return scoped.has(bookingPaymentScheduleId)
  })
}

/** The operator-facing sentence a refusal carries. */
export function describeDuplicateExternalDocument(existing: LiveBookingExternalDocument): string {
  return `This booking is already invoiced in ${existing.provider} as ${existing.label} (invoice ${existing.invoiceNumber}). Issuing again would send a second fiscal document for the same sale.`
}
