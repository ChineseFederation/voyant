import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { type ResolvedDocumentFxRate, resolveDocumentFxRate, toIsoDay } from "./fx-money.js"
import { type InvoiceFxOptions, resolveInvoiceFxSettingsOrDefault } from "./invoice-fx.js"
import { invoices, payments } from "./schema/receivables.js"

/**
 * Set the FX stamp on a document that was written before rates were captured
 * (voyant#4703). Live documents stamp themselves; this exists so an operator
 * can repair the history that predates it rather than keep a spreadsheet
 * beside the platform.
 *
 * A stamp is the rate of the document's OWN date. The route may supply that
 * rate — read off the paperwork the accounting provider already issued — or
 * let the configured source answer for that date; either way it is captured as
 * a rate set first, so the repaired document carries the same durable identity
 * a freshly-issued one does.
 */

export class FxStampError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, options: { status?: number; code: string }) {
    super(message)
    this.name = "FxStampError"
    this.status = options.status ?? 400
    this.code = options.code
  }
}

export interface FxStampRequest {
  /**
   * The rate to stamp with, as published by the source — units of the
   * reporting currency per one unit of the document's currency, BEFORE the
   * operator's margin. Omit to ask the configured source for the date.
   */
  rate?: number
  /** The source that published `rate`, e.g. `bnr`. Defaults to `manual`. */
  source?: string
  /** Re-stamp a document that already carries one. */
  force?: boolean
}

export interface FxStampResult {
  documentId: string
  currency: string
  reportingCurrency: string
  /** The rate as published. */
  rate: number
  /** What the document was converted at, margin included. */
  effectiveRate: number
  commissionBps: number
  fxRateSetId: string | null
  reportingAmountCents: number
}

export async function stampInvoiceFx(
  db: PostgresJsDatabase,
  invoiceId: string,
  request: FxStampRequest,
  options: InvoiceFxOptions = {},
): Promise<FxStampResult | null> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  if (!invoice) return null

  const settings = await resolveInvoiceFxSettingsOrDefault(db, options)
  const reportingCurrency = settings.baseCurrency

  if (invoice.currency === reportingCurrency) {
    throw new FxStampError(
      `Invoice ${invoice.invoiceNumber} is already in the reporting currency ${reportingCurrency}`,
      { code: "invoice_not_foreign_currency" },
    )
  }
  if (invoice.baseTotalCents !== null && !request.force) {
    throw new FxStampError(
      `Invoice ${invoice.invoiceNumber} already carries an FX stamp; pass force to replace it`,
      { status: 409, code: "invoice_already_fx_stamped" },
    )
  }

  const resolved = await resolveStampRate(
    db,
    {
      currency: invoice.currency,
      reportingCurrency,
      date: invoice.issueDate,
      commissionBps: settings.fxCommissionBps,
    },
    request,
    options,
  )

  // Derive every base column from ONE converted total so the parts still sum
  // to the whole. Converting each column separately leaves the rounding
  // remainder unaccounted for, which is exactly the kind of one-cent gap an
  // inspector asks about.
  const baseTotalCents = Math.round(invoice.totalCents * resolved.effectiveRate)
  const baseSubtotalCents =
    invoice.totalCents === 0
      ? baseTotalCents
      : Math.round((baseTotalCents * invoice.subtotalCents) / invoice.totalCents)
  const basePaidCents =
    invoice.totalCents === 0
      ? 0
      : Math.round((baseTotalCents * invoice.paidCents) / invoice.totalCents)

  await db
    .update(invoices)
    .set({
      baseCurrency: reportingCurrency,
      fxRateSetId: resolved.fxRateSetId,
      baseSubtotalCents,
      baseTaxCents: baseTotalCents - baseSubtotalCents,
      baseTotalCents,
      basePaidCents,
      baseBalanceDueCents: baseTotalCents - basePaidCents,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id))

  return {
    documentId: invoice.id,
    currency: invoice.currency,
    reportingCurrency,
    rate: resolved.sourceRate,
    effectiveRate: resolved.effectiveRate,
    commissionBps: resolved.commissionBps,
    fxRateSetId: resolved.fxRateSetId,
    reportingAmountCents: baseTotalCents,
  }
}

export async function stampPaymentFx(
  db: PostgresJsDatabase,
  paymentId: string,
  request: FxStampRequest,
  options: InvoiceFxOptions = {},
): Promise<FxStampResult | null> {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1)
  if (!payment) return null

  const settings = await resolveInvoiceFxSettingsOrDefault(db, options)
  const reportingCurrency = settings.baseCurrency

  if (payment.reportingAmountCents !== null && !request.force) {
    throw new FxStampError(
      `Payment ${payment.id} already carries an FX stamp; pass force to replace it`,
      { status: 409, code: "payment_already_fx_stamped" },
    )
  }

  if (payment.currency === reportingCurrency) {
    await db
      .update(payments)
      .set({
        reportingCurrency,
        reportingAmountCents: payment.amountCents,
        reportingFxRateSetId: null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))

    return {
      documentId: payment.id,
      currency: payment.currency,
      reportingCurrency,
      rate: 1,
      effectiveRate: 1,
      commissionBps: 0,
      fxRateSetId: null,
      reportingAmountCents: payment.amountCents,
    }
  }

  const resolved = await resolveStampRate(
    db,
    {
      currency: payment.currency,
      reportingCurrency,
      date: payment.paymentDate,
      commissionBps: settings.fxCommissionBps,
    },
    request,
    options,
  )
  const reportingAmountCents = Math.round(payment.amountCents * resolved.effectiveRate)

  await db
    .update(payments)
    .set({
      reportingCurrency,
      reportingAmountCents,
      reportingFxRateSetId: resolved.fxRateSetId,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id))

  return {
    documentId: payment.id,
    currency: payment.currency,
    reportingCurrency,
    rate: resolved.sourceRate,
    effectiveRate: resolved.effectiveRate,
    commissionBps: resolved.commissionBps,
    fxRateSetId: resolved.fxRateSetId,
    reportingAmountCents,
  }
}

async function resolveStampRate(
  db: PostgresJsDatabase,
  document: {
    currency: string
    reportingCurrency: string
    date: string | Date | null
    commissionBps: number
  },
  request: FxStampRequest,
  options: InvoiceFxOptions,
): Promise<ResolvedDocumentFxRate> {
  const day = toIsoDay(document.date)
  if (!day) {
    throw new FxStampError("The document has no date to resolve a rate for", {
      code: "document_date_missing",
    })
  }

  if (request.rate !== undefined) {
    if (!Number.isFinite(request.rate) || request.rate <= 0) {
      throw new FxStampError("An FX stamp rate must be a positive number", {
        code: "fx_stamp_rate_invalid",
      })
    }
    const captured = await captureSuppliedRate(db, {
      currency: document.currency,
      reportingCurrency: document.reportingCurrency,
      day,
      rate: request.rate,
      source: request.source ?? "manual",
      commissionBps: document.commissionBps,
      capture: options.captureFxRates,
    })
    if (captured) return captured

    // No rate store to keep it in — the operator's number still stands, it
    // just cannot be handed a rate-set identity.
    return {
      sourceRate: request.rate,
      effectiveRate: request.rate * (1 + document.commissionBps / 10_000),
      commissionBps: document.commissionBps,
      fxRateSetId: null,
      quotedAt: day,
      origin: "resolver",
    }
  }

  const resolved = await resolveDocumentFxRate(
    db,
    { currency: document.currency, baseCurrency: document.reportingCurrency, date: day },
    options,
  )
  if (!resolved) {
    throw new FxStampError(
      `No exchange rate is available for ${document.currency}→${document.reportingCurrency} on ${day}. Supply the rate printed on the document instead.`,
      { status: 422, code: "fx_stamp_rate_unavailable" },
    )
  }
  return resolved
}

async function captureSuppliedRate(
  db: PostgresJsDatabase,
  input: {
    currency: string
    reportingCurrency: string
    day: string
    rate: number
    source: string
    commissionBps: number
    capture: InvoiceFxOptions["captureFxRates"]
  },
): Promise<ResolvedDocumentFxRate | null> {
  if (!input.capture) return null

  const result = await input.capture(db, {
    reportingCurrency: input.reportingCurrency,
    date: input.day,
    source: input.source,
    sourceReference: "operator-supplied document rate",
    commissionBps: input.commissionBps,
    quotes: [{ currency: input.currency, rate: input.rate }],
  })
  if (!result) return null

  const captured = result.rates.find((rate) => rate.currency === input.currency)
  if (!captured) return null

  return {
    sourceRate: captured.rate,
    effectiveRate: captured.effectiveRate,
    commissionBps: captured.commissionBps,
    fxRateSetId: result.fxRateSetId,
    quotedAt: input.day,
    origin: "captured",
  }
}
