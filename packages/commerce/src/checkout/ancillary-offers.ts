/**
 * Ancillary offer fan-out.
 *
 * Every bound source is asked, in parallel, with a hard per-source deadline;
 * whatever answers in time is merged into one group per `kind` and ordered
 * neutrally. Nothing here can fail the checkout step: a source that throws or
 * runs long becomes a `diagnostics` entry beside the offers that did arrive,
 * because the traveller is mid-purchase and a third party's outage is not
 * their problem.
 *
 * Zero bound sources is a supported, silent state and returns an empty list —
 * not an error, not an empty group with a heading. An operator who has
 * connected nothing should see nothing.
 *
 * The structure deliberately mirrors `fanOutAvailabilitySearch` in
 * `@voyant-travel/catalog` (`src/search/availability-fan-out.ts`): same
 * `runSource`/`withTimeout` shape, same "partial failure is reported, never
 * fatal" contract. Two fan-outs that behave differently under timeout would be
 * two things to learn.
 */

import type {
  AncillaryOfferGroupV1,
  AncillaryOfferV1,
  AncillarySourceDiagnosticV1,
} from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import { orderAncillaryOffers } from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"

import type { AncillaryOfferSource, AncillaryQuoteInput } from "./ancillary-ports.js"

/** Mirrors `fanOutAvailabilitySearch`'s default so one slow source cannot stall checkout. */
export const DEFAULT_ANCILLARY_SOURCE_TIMEOUT_MS = 5000

export interface QuoteAncillaryOffersOptions {
  /**
   * Per-source hard deadline. One slow source is reported as `timeout`; the
   * rest return on time.
   */
  perSourceTimeoutMs?: number
}

interface SourceOutcome {
  kind: string
  label: string
  offers: AncillaryOfferV1[]
  diagnostics: AncillarySourceDiagnosticV1[]
}

/**
 * Ask every bound source what it can offer, and return one group per kind.
 *
 * The result is always a list of groups, each of which always has a list of
 * offers — including when a source answered with nothing. Callers branch on
 * the counts for presentation only; the shape never changes underneath them.
 */
export async function quoteAncillaryOffers(
  sources: readonly AncillaryOfferSource[],
  input: AncillaryQuoteInput,
  options: QuoteAncillaryOffersOptions = {},
): Promise<AncillaryOfferGroupV1[]> {
  if (sources.length === 0) return []
  const timeoutMs = options.perSourceTimeoutMs ?? DEFAULT_ANCILLARY_SOURCE_TIMEOUT_MS

  const outcomes = await Promise.all(sources.map((source) => runSource(source, input, timeoutMs)))

  // Bucket on the source's declared `kind` rather than the returned group's,
  // because a source that timed out never returned one and its diagnostic
  // still has to land in the group the traveller is looking at.
  const groups = new Map<string, AncillaryOfferGroupV1>()
  for (const outcome of outcomes) {
    const group = groups.get(outcome.kind) ?? {
      kind: outcome.kind,
      label: outcome.label,
      offers: [],
      diagnostics: [],
    }
    group.offers.push(...outcome.offers)
    group.diagnostics.push(...outcome.diagnostics)
    groups.set(outcome.kind, group)
  }

  return [...groups.values()].map((group) => ({
    ...group,
    offers: orderAncillaryOffers(group.offers),
  }))
}

async function runSource(
  source: AncillaryOfferSource,
  input: AncillaryQuoteInput,
  timeoutMs: number,
): Promise<SourceOutcome> {
  const start = Date.now()
  try {
    const group = await withTimeout(
      source.quote(input),
      timeoutMs,
      `ancillary source ${source.sourceId} timed out after ${timeoutMs}ms`,
    )
    return {
      kind: source.kind,
      label: group.label || source.label,
      // Stamp the dispatching source unless the source named a more specific
      // one — it may itself be fanning out across several providers.
      offers: group.offers.map((offer) => ({
        ...offer,
        sourceId: offer.sourceId || source.sourceId,
      })),
      diagnostics: group.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        sourceId: diagnostic.sourceId || source.sourceId,
      })),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      kind: source.kind,
      label: source.label,
      offers: [],
      diagnostics: [
        {
          sourceId: source.sourceId,
          status: message.includes("timed out") ? "timeout" : "error",
          message,
          latencyMs: Date.now() - start,
        },
      ],
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
