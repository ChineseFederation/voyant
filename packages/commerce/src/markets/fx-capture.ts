import { and, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { exchangeRates, fxRateSets } from "./schema.js"

/**
 * Capture the reference rates that applied on one calendar day, so any
 * document dated that day can be expressed in the operator's reporting
 * currency forever after (voyant#4703).
 *
 * A rate set is the unit of identity: one set per (source, reporting
 * currency, day). Documents link to it by `fx_rate_set_id`, which is why a
 * captured rate is **never rewritten** — re-capturing a day that already has
 * a rate for a pair leaves the existing row alone. Recording a different
 * number under an id that historical documents already point at would
 * silently restate them.
 *
 * The row carries both halves of the arithmetic an inspector asks for: the
 * rate the source published, and the rate the operator actually converted at
 * once its currency-risk margin is folded in.
 */

/** Rate sources this module knows how to attribute. Anything else is `other`. */
export type CapturedFxRateSource = "manual" | "ecb" | "bnr" | "custom" | "other"

export interface CapturedFxQuote {
  /** The foreign currency being converted from, e.g. `EUR`. */
  currency: string
  /**
   * Units of the reporting currency per one unit of `currency`, exactly as
   * the source published it — with no margin applied.
   */
  rate: number
}

export interface CaptureFxRateSetInput {
  /** The operator's reporting currency the rates are quoted into, e.g. `RON`. */
  reportingCurrency: string
  /** The day the rates apply to, `YYYY-MM-DD`. */
  date: string
  source: CapturedFxRateSource
  /** Free-form provenance, e.g. the upstream series or document the rate came from. */
  sourceReference?: string | null
  /**
   * The operator's currency-risk margin in basis points, folded into the
   * recorded effective rate. `0` is a real answer, not a missing one.
   */
  commissionBps: number
  quotes: readonly CapturedFxQuote[]
}

export interface CapturedFxRate {
  currency: string
  /** The rate as published. */
  rate: number
  /** `rate × (1 + commissionBps / 10_000)` — what documents convert at. */
  effectiveRate: number
  commissionBps: number
  /** True when this call wrote the row; false when a captured rate already stood. */
  captured: boolean
}

export interface CaptureFxRateSetResult {
  fxRateSetId: string
  reportingCurrency: string
  date: string
  source: CapturedFxRateSource
  rates: CapturedFxRate[]
}

/** The transaction handle `db.transaction` hands its callback. */
type FxCaptureTx = Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0]

const RATE_SCALE = 8
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function captureFxRateSet(
  db: PostgresJsDatabase,
  input: CaptureFxRateSetInput,
): Promise<CaptureFxRateSetResult> {
  const reportingCurrency = normalizeCurrency(input.reportingCurrency)
  if (!reportingCurrency) {
    throw new FxRateCaptureError("A reporting currency is required to capture FX rates")
  }
  if (!ISO_DATE.test(input.date)) {
    throw new FxRateCaptureError(`FX capture date must be YYYY-MM-DD, received "${input.date}"`)
  }
  const commissionBps = normalizeCommissionBps(input.commissionBps)
  const quotes = normalizeQuotes(input.quotes, reportingCurrency)
  if (quotes.length === 0) {
    throw new FxRateCaptureError("FX capture requires at least one quoted currency")
  }

  const effectiveAt = new Date(`${input.date}T00:00:00.000Z`)

  return db.transaction(async (tx) => {
    // Serialize concurrent captures of the same day so two invoices issued at
    // once cannot mint two rate sets for it. Transaction-scoped, so it clears
    // with the commit.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`fx-rate-set:${input.source}:${reportingCurrency}:${input.date}`}))`,
    )

    const fxRateSetId = await resolveRateSetId(tx, {
      source: input.source,
      reportingCurrency,
      effectiveAt,
      sourceReference: input.sourceReference ?? null,
    })

    const rates: CapturedFxRate[] = []
    for (const quote of quotes) {
      const effectiveRate = applyCommission(quote.rate, commissionBps)
      const [inserted] = await tx
        .insert(exchangeRates)
        .values({
          fxRateSetId,
          baseCurrency: quote.currency,
          quoteCurrency: reportingCurrency,
          rateDecimal: toDecimal(quote.rate),
          inverseRateDecimal: toDecimal(1 / quote.rate),
          effectiveRateDecimal: toDecimal(effectiveRate),
          commissionBps,
          observedAt: effectiveAt,
        })
        // A captured rate is immutable: the day's number stands even if a
        // later capture would compute a different one.
        .onConflictDoNothing({
          target: [
            exchangeRates.fxRateSetId,
            exchangeRates.baseCurrency,
            exchangeRates.quoteCurrency,
          ],
        })
        .returning({ id: exchangeRates.id })

      if (inserted) {
        rates.push({
          currency: quote.currency,
          rate: quote.rate,
          effectiveRate,
          commissionBps,
          captured: true,
        })
        continue
      }

      const standing = await readStandingRate(tx, fxRateSetId, quote.currency, reportingCurrency)
      rates.push({
        currency: quote.currency,
        rate: standing?.rate ?? quote.rate,
        effectiveRate: standing?.effectiveRate ?? effectiveRate,
        commissionBps: standing?.commissionBps ?? commissionBps,
        captured: false,
      })
    }

    return {
      fxRateSetId,
      reportingCurrency,
      date: input.date,
      source: input.source,
      rates,
    }
  })
}

export class FxRateCaptureError extends Error {
  readonly code = "fx_rate_capture_invalid_input"

  constructor(message: string) {
    super(message)
    this.name = "FxRateCaptureError"
  }
}

async function resolveRateSetId(
  tx: FxCaptureTx,
  input: {
    source: CapturedFxRateSource
    reportingCurrency: string
    effectiveAt: Date
    sourceReference: string | null
  },
): Promise<string> {
  const [existing] = await tx
    .select({ id: fxRateSets.id })
    .from(fxRateSets)
    .where(
      and(
        eq(fxRateSets.source, input.source),
        eq(fxRateSets.baseCurrency, input.reportingCurrency),
        eq(fxRateSets.effectiveAt, input.effectiveAt),
      ),
    )
    .limit(1)
  if (existing) return existing.id

  const [created] = await tx
    .insert(fxRateSets)
    .values({
      source: input.source,
      baseCurrency: input.reportingCurrency,
      effectiveAt: input.effectiveAt,
      observedAt: input.effectiveAt,
      sourceReference: input.sourceReference,
    })
    .returning({ id: fxRateSets.id })

  if (!created) {
    throw new FxRateCaptureError("Failed to create an FX rate set")
  }
  return created.id
}

async function readStandingRate(
  tx: FxCaptureTx,
  fxRateSetId: string,
  baseCurrency: string,
  quoteCurrency: string,
) {
  const [row] = await tx
    .select({
      rateDecimal: exchangeRates.rateDecimal,
      effectiveRateDecimal: exchangeRates.effectiveRateDecimal,
      commissionBps: exchangeRates.commissionBps,
    })
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.fxRateSetId, fxRateSetId),
        eq(exchangeRates.baseCurrency, baseCurrency),
        eq(exchangeRates.quoteCurrency, quoteCurrency),
      ),
    )
    .limit(1)
  if (!row) return null

  const rate = Number.parseFloat(row.rateDecimal)
  const effectiveRate = row.effectiveRateDecimal
    ? Number.parseFloat(row.effectiveRateDecimal)
    : rate
  return {
    rate,
    effectiveRate,
    commissionBps: row.commissionBps ?? 0,
  }
}

/** `rate × (1 + bps/10_000)`, rounded to the column's scale so the stored
 * number is exactly the one the arithmetic is shown with. */
export function applyCommission(rate: number, commissionBps: number): number {
  return Number((rate * (1 + commissionBps / 10_000)).toFixed(RATE_SCALE))
}

function normalizeQuotes(
  quotes: readonly CapturedFxQuote[],
  reportingCurrency: string,
): CapturedFxQuote[] {
  const seen = new Set<string>()
  const normalized: CapturedFxQuote[] = []
  for (const quote of quotes) {
    const currency = normalizeCurrency(quote.currency)
    if (!currency) {
      throw new FxRateCaptureError(`FX quote currency is required, received "${quote.currency}"`)
    }
    // Converting a currency into itself is the identity, not a rate to store.
    if (currency === reportingCurrency) continue
    if (!Number.isFinite(quote.rate) || quote.rate <= 0) {
      throw new FxRateCaptureError(
        `FX quote for ${currency} must be a positive rate, received ${quote.rate}`,
      )
    }
    if (seen.has(currency)) continue
    seen.add(currency)
    normalized.push({ currency, rate: quote.rate })
  }
  return normalized
}

function normalizeCommissionBps(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new FxRateCaptureError(
      `FX commission must be a non-negative basis-point figure, received ${value}`,
    )
  }
  return Math.round(value)
}

function normalizeCurrency(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase()
  return normalized ? normalized : null
}

function toDecimal(value: number) {
  return value.toFixed(RATE_SCALE)
}
