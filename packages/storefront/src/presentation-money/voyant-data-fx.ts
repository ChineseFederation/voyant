import type { PresentationFxQuoter } from "@voyant-travel/catalog-contracts/presentation-money"
import { createVoyantDataClient } from "@voyant-travel/data-sdk"

export interface VoyantDataPresentationFxOptions {
  /** Server credential. Never serialize this option into a storefront response. */
  apiKey: string
  baseUrl?: string
  fetch?: typeof globalThis.fetch
  now?: () => Date
}

/**
 * Create the server-side display-FX seam used by storefront shopping fan-outs.
 * Voyant Data owns the rate; the returned quote retains source and freshness
 * metadata so clients can disclose exactly what was used without receiving a
 * Voyant Data credential.
 */
export function createVoyantDataPresentationFxQuoter(
  options: VoyantDataPresentationFxOptions,
): PresentationFxQuoter {
  const apiKey = options.apiKey.trim()
  if (!apiKey) throw new Error("storefront_presentation_fx_api_key_required")

  const client = createVoyantDataClient({
    apiKey,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    userAgent: "voyant-storefront",
  })

  return async (sourceCurrency, targetCurrency) => {
    const source = normalizeCurrency(sourceCurrency)
    const target = normalizeCurrency(targetCurrency)
    if (source === target) {
      return {
        rate: "1",
        provider: "voyant-data-fx",
        quotedAt: (options.now?.() ?? new Date()).toISOString(),
        validUntil: null,
      }
    }

    const quote = await client.fx.pair(source, target)
    if (
      typeof quote.conversionRate !== "number" ||
      !Number.isFinite(quote.conversionRate) ||
      quote.conversionRate <= 0
    ) {
      throw new Error("storefront_presentation_fx_quote_invalid")
    }

    const quotedAt = normalizeTimestamp(quote.timeLastUpdateUtc)
    const validUntil = normalizeTimestamp(quote.timeNextUpdateUtc)
    return {
      rate: numberToPlainDecimal(quote.conversionRate),
      provider: quote.source ?? "voyant-data-fx",
      quotedAt: quotedAt ?? (options.now?.() ?? new Date()).toISOString(),
      ...(validUntil ? { validUntil } : {}),
    }
  }
}

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("storefront_presentation_fx_currency_invalid")
  }
  return currency
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString()
}

function numberToPlainDecimal(value: number): string {
  const text = String(value)
  if (!/[eE]/.test(text)) return text

  const [coefficient = "", exponentText = "0"] = text.toLowerCase().split("e")
  const exponent = Number.parseInt(exponentText, 10)
  const [whole = "0", fraction = ""] = coefficient.split(".")
  const digits = `${whole}${fraction}`.replace(/^\+/, "")
  const decimalIndex = whole.replace(/^\+/, "").length + exponent
  if (decimalIndex <= 0) return `0.${"0".repeat(-decimalIndex)}${digits}`
  if (decimalIndex >= digits.length) return `${digits}${"0".repeat(decimalIndex - digits.length)}`
  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`
}
