import {
  type CatalogMoney,
  catalogMoneySchema,
  type PresentationFxQuoter,
  type PresentationMoney,
  type PriceRanking,
  presentationFxProvenanceSchema,
} from "@voyant-travel/catalog-contracts/presentation-money"

export interface NormalizePresentationMoneyOptions {
  /** The shopper-selected currency. Omit only for native-currency callers. */
  targetCurrency?: string
  /** Required when any native price differs from `targetCurrency`. */
  quoteFx?: PresentationFxQuoter
  /** Per-currency FX quote timeout. Default 2000ms. */
  quoteTimeoutMs?: number
}

export interface NormalizePresentationMoneyResult {
  /** One result per input; unavailable entries retain their native price only. */
  prices: Array<PresentationMoney | undefined>
  ranking: PriceRanking
}

/**
 * Normalize a result page to one presentation currency. FX quotes are fetched
 * once per native currency and carry their provider/timestamp provenance into
 * every converted amount. A missing or invalid quote fails closed: callers
 * keep every native result but must not price-rank the mixed page.
 */
export async function normalizePresentationMoney(
  nativePrices: readonly CatalogMoney[],
  options: NormalizePresentationMoneyOptions = {},
): Promise<NormalizePresentationMoneyResult> {
  const parsed = nativePrices.map((money) => catalogMoneySchema.safeParse(money))
  const validCurrencies = parsed.flatMap((result) => (result.success ? [result.data.currency] : []))
  const nativeCurrencies = [...new Set(validCurrencies)]
  const targetCurrency = options.targetCurrency?.trim().toUpperCase()
  const quoteTimeoutMs = options.quoteTimeoutMs ?? 2000

  if (!targetCurrency) {
    const prices = parsed.map((result) =>
      result.success ? { native: result.data, presentation: result.data } : undefined,
    )
    if (parsed.some((result) => !result.success)) {
      return {
        prices,
        ranking: {
          status: "unranked_fx_unavailable",
          unavailableCurrencies: nativeCurrencies,
        },
      }
    }
    return {
      prices,
      ranking:
        nativeCurrencies.length <= 1
          ? { status: "ranked_native", currency: nativeCurrencies[0] }
          : {
              status: "unranked_mixed_currency",
              unavailableCurrencies: nativeCurrencies,
            },
    }
  }

  if (!/^[A-Z]{3}$/.test(targetCurrency)) {
    return {
      prices: nativePrices.map(() => undefined),
      ranking: {
        status: "unranked_fx_unavailable",
        unavailableCurrencies: nativeCurrencies,
      },
    }
  }

  const currenciesToQuote = nativeCurrencies.filter((currency) => currency !== targetCurrency)
  if (currenciesToQuote.length > 0 && !options.quoteFx) {
    return {
      prices: parsed.map((result) =>
        result.success && result.data.currency === targetCurrency
          ? { native: result.data, presentation: result.data }
          : undefined,
      ),
      ranking: {
        status: "unranked_fx_unavailable",
        currency: targetCurrency,
        unavailableCurrencies: currenciesToQuote,
      },
    }
  }

  const quotes = new Map<
    string,
    { ok: true; value: Awaited<ReturnType<PresentationFxQuoter>> } | { ok: false }
  >()
  await Promise.all(
    currenciesToQuote.map(async (currency) => {
      try {
        const quote = presentationFxProvenanceSchema.parse(
          await withTimeout(
            options.quoteFx?.(currency, targetCurrency),
            quoteTimeoutMs,
            `presentation FX quote ${currency}/${targetCurrency} timed out`,
          ),
        )
        quotes.set(currency, { ok: true, value: quote })
      } catch {
        quotes.set(currency, { ok: false })
      }
    }),
  )

  const unavailableCurrencies = new Set<string>()
  const prices = parsed.map((result): PresentationMoney | undefined => {
    if (!result.success) return undefined
    const native = result.data
    if (native.currency === targetCurrency) return { native, presentation: native }

    const quote = quotes.get(native.currency)
    if (!quote?.ok) {
      unavailableCurrencies.add(native.currency)
      return undefined
    }
    try {
      return {
        native,
        presentation: {
          amount: convertDecimalAmount(native.amount, quote.value.rate, targetCurrency),
          currency: targetCurrency,
        },
        fx: quote.value,
      }
    } catch {
      unavailableCurrencies.add(native.currency)
      return undefined
    }
  })

  if (parsed.some((result) => !result.success)) {
    for (const currency of nativeCurrencies) unavailableCurrencies.add(currency)
  }
  if (unavailableCurrencies.size > 0 || prices.some((price) => !price)) {
    return {
      prices,
      ranking: {
        status: "unranked_fx_unavailable",
        currency: targetCurrency,
        unavailableCurrencies: [...unavailableCurrencies].sort(),
      },
    }
  }

  return {
    prices,
    ranking: {
      status: currenciesToQuote.length > 0 ? "ranked_presentation" : "ranked_native",
      currency: targetCurrency,
    },
  }
}

/** Compare already-normalized presentation amounts in the same currency. */
export function comparePresentationMoney(a: PresentationMoney, b: PresentationMoney): number {
  if (a.presentation.currency !== b.presentation.currency) return 0
  return compareDecimalStrings(a.presentation.amount, b.presentation.amount)
}

function convertDecimalAmount(amount: string, rate: string, currency: string): string {
  const left = parseDecimal(amount)
  const right = parseDecimal(rate)
  const product = left.integer * right.integer
  const productScale = left.scale + right.scale
  const outputScale = currencyFractionDigits(currency)

  let rounded: bigint
  if (productScale <= outputScale) {
    rounded = product * 10n ** BigInt(outputScale - productScale)
  } else {
    const divisor = 10n ** BigInt(productScale - outputScale)
    const quotient = product / divisor
    const remainder = product % divisor
    rounded = quotient + (remainder * 2n >= divisor ? 1n : 0n)
  }

  if (outputScale === 0) return rounded.toString()
  const digits = rounded.toString().padStart(outputScale + 1, "0")
  const splitAt = digits.length - outputScale
  return `${digits.slice(0, splitAt)}.${digits.slice(splitAt)}`
}

function parseDecimal(value: string): { integer: bigint; scale: number } {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("invalid_decimal")
  const [whole = "0", fraction = ""] = value.split(".")
  return { integer: BigInt(`${whole}${fraction}`), scale: fraction.length }
}

function compareDecimalStrings(a: string, b: string): number {
  const left = parseDecimal(a)
  const right = parseDecimal(b)
  const scale = Math.max(left.scale, right.scale)
  const leftInteger = left.integer * 10n ** BigInt(scale - left.scale)
  const rightInteger = right.integer * 10n ** BigInt(scale - right.scale)
  return leftInteger < rightInteger ? -1 : leftInteger > rightInteger ? 1 : 0
}

function currencyFractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

async function withTimeout<T>(
  promise: Promise<T> | undefined,
  timeoutMs: number,
  message: string,
): Promise<T> {
  if (!promise) throw new Error("presentation_fx_quoter_unavailable")
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
