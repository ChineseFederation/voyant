import { and, asc, desc, eq, gte, isNull, lt, lte, or } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type {
  InvoiceExchangeRateResolution,
  InvoiceFxOptions,
  InvoiceFxSettings,
  ResolveInvoiceExchangeRateInput,
} from "./invoice-fx.js"
import { exchangeRatesRef } from "./markets-ref.js"

export type FxMoneyInput = {
  amountCents: number
  currency: string
  baseCurrency?: string | null
  baseAmountCents?: number | null
  fxRateSetId?: string | null
}

export type ResolveFxMoneyBaseAmountOptions = InvoiceFxOptions & {
  targetBaseCurrency?: string | null
  fallbackFxRateSetId?: string | null
  date?: string | Date | null
  setBaseCurrencyWhenUnresolved?: boolean
}

/**
 * One resolved conversion, with both halves of the arithmetic an inspector
 * asks for: what the source published, and what the document is actually
 * converted at once the operator's currency-risk margin is folded in.
 */
export type ResolvedDocumentFxRate = {
  /** The rate as published, before the operator's margin. */
  sourceRate: number
  /** `sourceRate × (1 + commissionBps / 10_000)` — what the amount is multiplied by. */
  effectiveRate: number
  commissionBps: number
  /** The rate set this rate belongs to; null when nothing durable backs it. */
  fxRateSetId: string | null
  /** The label of the source that published it, when known. */
  source?: string
  /** When the rate was quoted — the day it belongs to, or the source's stamp. */
  quotedAt?: string
  /** When a live quote expires. Only a live quote has one. */
  validUntil?: string
  /** Where the rate came from, for callers that need to explain themselves. */
  origin: "rate-set" | "captured" | "persisted" | "resolver"
}

export type ResolveDocumentFxRateInput = {
  /** Currency being converted from — the document's own currency. */
  currency: string
  /** Currency being converted into — the operator's reporting currency. */
  baseCurrency: string
  /** The document's own date. A rate for any other day is a different number. */
  date?: string | Date | null
  /**
   * A rate set the document is already bound to. When set it wins outright:
   * an invoice and the payments against it have to agree, and re-resolving
   * would let them drift.
   */
  fxRateSetId?: string | null
}

type PersistedRate = {
  sourceRate: number
  effectiveRate: number | null
  commissionBps: number | null
  fxRateSetId: string
  observedAt: Date | null
}

export async function resolveFxMoneyBaseAmount<T extends FxMoneyInput>(
  db: PostgresJsDatabase,
  input: T,
  options: ResolveFxMoneyBaseAmountOptions = {},
): Promise<T> {
  const settings = await resolveConfiguredFxSettings(db, options)
  const currency = normalizeCurrency(input.currency) ?? input.currency
  const configuredBaseCurrency = normalizeCurrency(settings?.baseCurrency)
  const targetBaseCurrency =
    normalizeCurrency(input.baseCurrency) ??
    normalizeCurrency(options.targetBaseCurrency) ??
    configuredBaseCurrency

  if (!targetBaseCurrency) {
    return {
      ...input,
      currency,
      baseCurrency: normalizeCurrency(input.baseCurrency) ?? input.baseCurrency ?? null,
      fxRateSetId: normalizeOptionalText(input.fxRateSetId) ?? input.fxRateSetId ?? null,
    }
  }

  const existingBaseAmountCents = normalizeAmount(input.baseAmountCents)
  const fallbackFxRateSetId =
    normalizeOptionalText(input.fxRateSetId) ??
    normalizeOptionalText(options.fallbackFxRateSetId) ??
    null

  if (existingBaseAmountCents !== null) {
    return {
      ...input,
      currency,
      baseCurrency: targetBaseCurrency,
      baseAmountCents: existingBaseAmountCents,
      fxRateSetId: currency === targetBaseCurrency ? null : fallbackFxRateSetId,
    }
  }

  if (currency === targetBaseCurrency) {
    return {
      ...input,
      currency,
      baseCurrency: targetBaseCurrency,
      baseAmountCents: input.amountCents,
      fxRateSetId: null,
    }
  }

  const resolved = await resolveDocumentFxRate(
    db,
    {
      currency,
      baseCurrency: targetBaseCurrency,
      date: options.date,
      fxRateSetId: fallbackFxRateSetId,
    },
    options,
    settings,
  )

  if (!resolved) {
    return {
      ...input,
      currency,
      baseCurrency: options.setBaseCurrencyWhenUnresolved
        ? targetBaseCurrency
        : (normalizeCurrency(input.baseCurrency) ?? input.baseCurrency ?? null),
      baseAmountCents: input.baseAmountCents ?? null,
      fxRateSetId: fallbackFxRateSetId,
    }
  }

  return {
    ...input,
    currency,
    baseCurrency: targetBaseCurrency,
    baseAmountCents: Math.round(input.amountCents * resolved.effectiveRate),
    fxRateSetId: resolved.fxRateSetId,
  }
}

export type ReportingStamp = {
  reportingCurrency: string
  reportingAmountCents: number
  reportingFxRateSetId: string | null
}

/**
 * What an amount was worth in the operator's reporting currency on its own
 * date — the figure a regulator asks for, frozen at the transaction (voyant#4703).
 *
 * Returns null when no reporting currency is configured or no rate can be had
 * for that day: an unstamped row is honest, a row stamped at today's rate is
 * not.
 */
export async function resolveReportingStamp(
  db: PostgresJsDatabase,
  input: { amountCents: number; currency: string; date?: string | Date | null },
  options: InvoiceFxOptions = {},
): Promise<ReportingStamp | null> {
  const settings = await resolveConfiguredFxSettings(db, options)
  const reportingCurrency = normalizeCurrency(settings?.baseCurrency)
  const currency = normalizeCurrency(input.currency)
  if (!reportingCurrency || !currency) return null

  if (currency === reportingCurrency) {
    return {
      reportingCurrency,
      reportingAmountCents: input.amountCents,
      reportingFxRateSetId: null,
    }
  }

  const resolved = await resolveDocumentFxRate(
    db,
    { currency, baseCurrency: reportingCurrency, date: input.date },
    options,
    settings,
  )
  if (!resolved) return null

  return {
    reportingCurrency,
    reportingAmountCents: Math.round(input.amountCents * resolved.effectiveRate),
    reportingFxRateSetId: resolved.fxRateSetId,
  }
}

/**
 * Resolve the rate a document dated `date` is converted at, and make it
 * durable while resolving it (voyant#4703).
 *
 * The order is the whole point. A rate captured for the document's OWN day
 * wins; failing that a fresh one is captured for that day; only then does an
 * older standing rate get used. Reaching for the newest rate on hand — which
 * is what this did before — silently restates a March invoice at August's
 * rate, and across one month of BNR quotes that is worth about 1.8%.
 */
export async function resolveDocumentFxRate(
  db: PostgresJsDatabase,
  input: ResolveDocumentFxRateInput,
  options: InvoiceFxOptions = {},
  preresolvedSettings?: InvoiceFxSettings | null,
): Promise<ResolvedDocumentFxRate | null> {
  const currency = normalizeCurrency(input.currency)
  const baseCurrency = normalizeCurrency(input.baseCurrency)
  if (!currency || !baseCurrency) return null
  if (currency === baseCurrency) {
    return {
      sourceRate: 1,
      effectiveRate: 1,
      commissionBps: 0,
      fxRateSetId: null,
      origin: "persisted",
    }
  }

  const settings =
    preresolvedSettings !== undefined
      ? preresolvedSettings
      : await resolveConfiguredFxSettings(db, options)
  const commissionBps = normalizeBasisPoints(settings?.fxCommissionBps)
  const fxRateSetId = normalizeOptionalText(input.fxRateSetId) ?? null
  const day = toIsoDay(input.date)

  // 1. Bound to a rate set already — the document's own answer, whatever the
  //    calendar says.
  if (fxRateSetId) {
    const pinned = await queryRateSetRate(db, currency, baseCurrency, fxRateSetId)
    if (pinned) return fromPersisted(pinned, commissionBps, "rate-set")
  }

  // 2. A rate captured for this document's own day.
  if (day) {
    const sameDay =
      (await queryPersistedRate(db, currency, baseCurrency, { day })) ??
      (await queryPersistedRate(db, baseCurrency, currency, { day, inverse: true }))
    if (sameDay) return fromPersisted(sameDay, commissionBps, "persisted")
  }

  // 3. Nothing captured for that day yet — go and get it, and keep it.
  const resolution = await resolveRuntimeExchangeRate(currency, baseCurrency, {
    ...options,
    date: input.date,
  })
  if (resolution && day && options.captureFxRates) {
    const captured = await captureResolvedRate(db, options.captureFxRates, {
      currency,
      baseCurrency,
      day,
      commissionBps,
      resolution,
    })
    if (captured) return captured

    // Capture is durability, not correctness, and the two must not be traded
    // for each other. The source answered for the document's OWN day; falling
    // through to an older standing rate here would quietly convert the document
    // at a different number because a WRITE failed. Losing the rate-set id is
    // the cost of a failed capture; losing the right amount is not.
    return fromResolution(resolution, commissionBps)
  }

  // 4. An older standing rate, for deployments that keep rates by hand or have
  //    no source wired. Never a rate observed AFTER the document. This sits
  //    ahead of the raw resolver answer on purpose: a deployment with no
  //    capture wired is managing its rate table by hand, and that table is its
  //    authority — the same order this had before capture existed.
  const standing = await queryStandingRate(db, currency, baseCurrency, day)
  if (standing) return fromPersisted(standing, commissionBps, "persisted")

  if (!resolution) return null

  // 5. Resolved but not persistable: the amount is still right, but nothing
  //    records which rate produced it.
  return fromResolution(resolution, commissionBps)
}

/** A source answer nothing could be persisted for — right number, no identity. */
function fromResolution(
  resolution: InvoiceExchangeRateResolution,
  commissionBps: number,
): ResolvedDocumentFxRate {
  return {
    sourceRate: resolution.rate,
    effectiveRate: applyCommission(resolution.rate, commissionBps),
    commissionBps,
    fxRateSetId: normalizeOptionalText(resolution.fxRateSetId) ?? null,
    ...(resolution.source ? { source: resolution.source } : {}),
    ...(resolution.quotedAt ? { quotedAt: resolution.quotedAt } : {}),
    ...(resolution.validUntil ? { validUntil: resolution.validUntil } : {}),
    origin: "resolver",
  }
}

async function captureResolvedRate(
  db: PostgresJsDatabase,
  capture: NonNullable<InvoiceFxOptions["captureFxRates"]>,
  input: {
    currency: string
    baseCurrency: string
    day: string
    commissionBps: number
    resolution: InvoiceExchangeRateResolution
  },
): Promise<ResolvedDocumentFxRate | null> {
  let result: Awaited<ReturnType<typeof capture>>
  try {
    result = await capture(db, {
      reportingCurrency: input.baseCurrency,
      date: input.day,
      source: input.resolution.source ?? "custom",
      commissionBps: input.commissionBps,
      quotes: [{ currency: input.currency, rate: input.resolution.rate }],
    })
  } catch {
    // Capture is durability, not correctness: a document must still be able to
    // carry a converted amount when the rate store refuses the write.
    return null
  }
  if (!result) return null

  const captured = result.rates.find((rate) => rate.currency === input.currency)
  if (!captured) return null

  return {
    sourceRate: captured.rate,
    effectiveRate: captured.effectiveRate,
    commissionBps: captured.commissionBps,
    fxRateSetId: result.fxRateSetId,
    ...(input.resolution.source ? { source: input.resolution.source } : {}),
    quotedAt: input.day,
    origin: "captured",
  }
}

/**
 * A persisted rate that already records an effective rate carries the margin
 * in force when it was captured. Re-applying the CURRENT margin on top would
 * both double-count it and restate every historical document the next time
 * the operator changes the setting.
 */
function fromPersisted(
  persisted: PersistedRate,
  commissionBps: number,
  origin: ResolvedDocumentFxRate["origin"],
): ResolvedDocumentFxRate {
  const quotedAt = persisted.observedAt
    ? { quotedAt: persisted.observedAt.toISOString().slice(0, 10) }
    : {}
  if (persisted.effectiveRate !== null) {
    return {
      sourceRate: persisted.sourceRate,
      effectiveRate: persisted.effectiveRate,
      commissionBps: persisted.commissionBps ?? 0,
      fxRateSetId: persisted.fxRateSetId,
      ...quotedAt,
      origin,
    }
  }
  return {
    sourceRate: persisted.sourceRate,
    effectiveRate: applyCommission(persisted.sourceRate, commissionBps),
    commissionBps,
    fxRateSetId: persisted.fxRateSetId,
    ...quotedAt,
    origin,
  }
}

export function applyCommission(rate: number, commissionBps: number) {
  return rate * (1 + commissionBps / 10_000)
}

async function resolveConfiguredFxSettings(
  db: PostgresJsDatabase,
  options: InvoiceFxOptions,
): Promise<InvoiceFxSettings | null> {
  if (options.invoiceFxSettings !== undefined) return options.invoiceFxSettings
  return (await options.resolveInvoiceFxSettings?.(db)) ?? null
}

async function resolveRuntimeExchangeRate(
  baseCurrency: string,
  quoteCurrency: string,
  options: InvoiceFxOptions & { date?: string | Date | null },
) {
  if (!options.resolveInvoiceExchangeRate) return null

  const day = toIsoDay(options.date)
  const input: ResolveInvoiceExchangeRateInput = {
    baseCurrency,
    quoteCurrency,
    ...(day ? { date: day } : {}),
  }

  try {
    return normalizeExchangeRateResolution(await options.resolveInvoiceExchangeRate(input))
  } catch (error) {
    try {
      await options.onInvoiceFxResolutionError?.(error, input)
    } catch {
      // FX resolution failure hooks should not mask the original write path.
    }
    return null
  }
}

/** The rate this exact set holds for the pair, direct or inverted. */
async function queryRateSetRate(
  db: PostgresJsDatabase,
  baseCurrency: string,
  quoteCurrency: string,
  fxRateSetId: string,
) {
  return (
    (await queryPersistedRate(db, baseCurrency, quoteCurrency, { fxRateSetId })) ??
    (await queryPersistedRate(db, quoteCurrency, baseCurrency, { fxRateSetId, inverse: true }))
  )
}

/** The newest rate observed no later than `day`, or ever when no day is given. */
async function queryStandingRate(
  db: PostgresJsDatabase,
  baseCurrency: string,
  quoteCurrency: string,
  day: string | null,
) {
  const asOf = day ? new Date(`${day}T23:59:59.999Z`) : null
  if (asOf) {
    return (
      (await queryPersistedRate(db, baseCurrency, quoteCurrency, { asOf })) ??
      (await queryPersistedRate(db, quoteCurrency, baseCurrency, { asOf, inverse: true }))
    )
  }
  return (
    (await queryPersistedRate(db, baseCurrency, quoteCurrency, {})) ??
    (await queryPersistedRate(db, quoteCurrency, baseCurrency, { inverse: true }))
  )
}

async function queryPersistedRate(
  db: PostgresJsDatabase,
  baseCurrency: string,
  quoteCurrency: string,
  options: {
    fxRateSetId?: string | null
    asOf?: Date | null
    day?: string | null
    inverse?: boolean
  },
): Promise<PersistedRate | null> {
  const conditions = [
    eq(exchangeRatesRef.baseCurrency, baseCurrency),
    eq(exchangeRatesRef.quoteCurrency, quoteCurrency),
  ]
  if (options.fxRateSetId) {
    conditions.push(eq(exchangeRatesRef.fxRateSetId, options.fxRateSetId))
  }
  if (options.day) {
    const dayStart = new Date(`${options.day}T00:00:00.000Z`)
    const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    conditions.push(gte(exchangeRatesRef.observedAt, dayStart))
    conditions.push(lt(exchangeRatesRef.observedAt, nextDay))
  }
  if (options.asOf) {
    const asOfCondition = or(
      isNull(exchangeRatesRef.observedAt),
      lte(exchangeRatesRef.observedAt, options.asOf),
    )
    if (asOfCondition) conditions.push(asOfCondition)
  }

  const [row] = await db
    .select({
      fxRateSetId: exchangeRatesRef.fxRateSetId,
      rateDecimal: exchangeRatesRef.rateDecimal,
      inverseRateDecimal: exchangeRatesRef.inverseRateDecimal,
      effectiveRateDecimal: exchangeRatesRef.effectiveRateDecimal,
      commissionBps: exchangeRatesRef.commissionBps,
      observedAt: exchangeRatesRef.observedAt,
    })
    .from(exchangeRatesRef)
    .where(and(...conditions))
    .orderBy(
      asc(isNull(exchangeRatesRef.observedAt)),
      desc(exchangeRatesRef.observedAt),
      desc(exchangeRatesRef.createdAt),
    )
    .limit(1)

  if (!row) return null

  const sourceRate = options.inverse
    ? (normalizeRate(row.inverseRateDecimal) ?? inverseRate(row.rateDecimal))
    : normalizeRate(row.rateDecimal)
  if (!sourceRate) return null

  // An applied rate has two readings, not two rates: if the operator converts
  // at 5.352144 RON per EUR then one RON is 1/5.352144 EUR, and inverting the
  // applied rate is what keeps both directions telling the same story.
  //
  // Inverting the SOURCE rate and re-applying the margin does not: it would
  // value a RON amount at an implied 5.1443 RON per EUR while the row next to
  // it says the operator converts at 5.352144.
  const recordedEffectiveRate = normalizeRate(row.effectiveRateDecimal)
  const effectiveRate = options.inverse
    ? recordedEffectiveRate === null
      ? null
      : 1 / recordedEffectiveRate
    : recordedEffectiveRate

  return {
    sourceRate,
    effectiveRate,
    commissionBps: effectiveRate === null ? null : row.commissionBps,
    fxRateSetId: row.fxRateSetId,
    observedAt: row.observedAt ?? null,
  }
}

function normalizeExchangeRateResolution(
  resolution: number | InvoiceExchangeRateResolution | null | undefined,
): InvoiceExchangeRateResolution | null {
  if (typeof resolution === "number") {
    return Number.isFinite(resolution) && resolution > 0 ? { rate: resolution } : null
  }
  if (!resolution || typeof resolution !== "object") return null
  if (typeof resolution.rate !== "number" || !Number.isFinite(resolution.rate)) return null
  if (resolution.rate <= 0) return null

  const fxRateSetId = normalizeOptionalText(resolution.fxRateSetId)
  const source = normalizeOptionalText(resolution.source)
  const quotedAt = normalizeOptionalText(resolution.quotedAt)
  const validUntil = normalizeOptionalText(resolution.validUntil)
  return {
    rate: resolution.rate,
    ...(fxRateSetId ? { fxRateSetId } : {}),
    ...(source ? { source } : {}),
    ...(quotedAt ? { quotedAt } : {}),
    ...(validUntil ? { validUntil } : {}),
  }
}

function normalizeAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null
}

function normalizeRate(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "")
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function inverseRate(value: string | number | null | undefined) {
  const rate = normalizeRate(value)
  return rate ? 1 / rate : null
}

function normalizeBasisPoints(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function normalizeCurrency(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase()
  return normalized ? normalized : null
}

function normalizeOptionalText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

/** The calendar day a document belongs to, `YYYY-MM-DD`, or null if unknown. */
export function toIsoDay(value: string | Date | null | undefined): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  }
  if (typeof value !== "string" || value.length === 0) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}
