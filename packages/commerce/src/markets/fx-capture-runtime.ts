import type {
  FinanceFxRateCaptureRuntime,
  FxRateCaptureRequest,
} from "@voyant-travel/finance/runtime-port"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { type CapturedFxRateSource, captureFxRateSet } from "./fx-capture.js"

/**
 * Markets' answer to finance's `finance.fx-rate-capture.runtime` seam: take a
 * day's published rates and hand back the rate-set identity a document is
 * stamped with (voyant#4703).
 */
export const commerceFxRateCaptureRuntime: FinanceFxRateCaptureRuntime = {
  async captureFxRates(db: PostgresJsDatabase, request: FxRateCaptureRequest) {
    const source = toCapturedSource(request.source)
    const captured = await captureFxRateSet(db, {
      reportingCurrency: request.reportingCurrency,
      date: request.date,
      source,
      // Keep the host's own label when the enum could not hold it, so the
      // provenance of an `other` set is still readable.
      sourceReference:
        request.sourceReference ?? (source === "other" ? request.source.trim() || null : null),
      commissionBps: request.commissionBps,
      quotes: request.quotes,
    })

    return {
      fxRateSetId: captured.fxRateSetId,
      rates: captured.rates.map(({ currency, rate, effectiveRate, commissionBps }) => ({
        currency,
        rate,
        effectiveRate,
        commissionBps,
      })),
    }
  },
}

const KNOWN_SOURCES = new Set<CapturedFxRateSource>(["manual", "ecb", "bnr", "custom", "other"])

/**
 * The port's source is free-form because a host reports whatever series it
 * drew from; the column is an enum. An unrecognised label is recorded as
 * `other` rather than rejected — losing the rate over its provenance label
 * would be the worse trade, and the label survives in `source_reference`.
 */
function toCapturedSource(source: string): CapturedFxRateSource {
  const normalized = source.trim().toLowerCase() as CapturedFxRateSource
  return KNOWN_SOURCES.has(normalized) ? normalized : "other"
}
