/**
 * Vertical-agnostic live availability-search fan-out.
 *
 * Parallel `searchAvailability` across an operator's sourced connections and
 * owned search handlers, with per-connection timeouts, partial-success
 * handling, and a comparable-price merge into one `AvailabilityCandidate`
 * list. Mixed currencies remain in stable source order unless presentation FX
 * normalizes every candidate. The
 * non-flight counterpart of `fanOutFlightSearch`
 * (`@voyant-travel/flights`), built on the catalog source-adapter contract.
 *
 * Owned and sourced supply land in the same ranked list; one slow/erroring
 * source is flagged in `perConnection`, never fatal.
 *
 * See `docs/architecture/dynamic-packaging-rfc.md` §2 (Gap 1) and §4.
 */

import type {
  AvailabilityCandidate,
  AvailabilitySearchRequest,
  SourceAdapter,
  SourceAdapterContext,
} from "@voyant-travel/catalog-contracts/adapter/contract"
import type {
  PresentationMoney,
  PriceRanking,
} from "@voyant-travel/catalog-contracts/presentation-money"
import type { OwnedAvailabilitySearchHandler, OwnedSearchContext } from "./owned-search-handler.js"
import {
  comparePresentationMoney,
  type NormalizePresentationMoneyOptions,
  normalizePresentationMoney,
} from "./presentation-money.js"

/** Per-source outcome, returned alongside merged candidates for partial-success UX. */
export type AvailabilityConnectionStatus =
  | "ok"
  | "partial"
  | "empty"
  | "unsupported"
  | "timeout"
  | "error"
  | "capability_missing"
  | "vertical_skipped"

export interface AvailabilityConnectionResult {
  /** Connection id (sourced) or entity module (owned). */
  source: string
  kind: "sourced" | "owned"
  status: AvailabilityConnectionStatus
  count: number
  latencyMs: number
  errorMessage?: string
  /**
   * Per-source pagination token. A merged cursor can't represent N sources,
   * so paging is per-connection: re-run the fan-out for just this source with
   * `request.cursor = nextCursor` to fetch its next page.
   */
  nextCursor?: string
}

export interface FanOutAvailabilityResult {
  /** Merged candidates; price-ranked only when `priceRanking` says so. */
  candidates: PresentedAvailabilityCandidate[]
  perConnection: AvailabilityConnectionResult[]
  /** Explicitly fails closed when a mixed-currency page cannot be normalized. */
  priceRanking?: PriceRanking
}

export type PresentedAvailabilityCandidate = AvailabilityCandidate & {
  /** Native + shopper-selected display money. `price` remains provider-native. */
  presentationPrice?: PresentationMoney
}

export interface FanOutAvailabilitySearchOptions {
  /** Sourced adapters to fan out across. Gated by `supportsAvailabilitySearch`. */
  adapters?: ReadonlyArray<{
    connectionId: string
    adapter: SourceAdapter
    context?: Partial<SourceAdapterContext>
  }>
  /** Owned search handlers — owned inventory as a search source. */
  ownedHandlers?: ReadonlyArray<{
    handler: OwnedAvailabilitySearchHandler
    context: OwnedSearchContext
  }>
  request: AvailabilitySearchRequest
  /**
   * Per-source hard timeout. Default 5000ms. One slow source is reported as
   * `timeout`; the rest return on time.
   */
  perConnectionTimeoutMs?: number
  /** Optional cap on the merged candidate count (the search still runs in full). */
  limit?: number
  /** Server-side display FX configuration. Credentials stay behind `quoteFx`. */
  presentation?: NormalizePresentationMoneyOptions
  /** Server-only cursors keyed independently for sourced and owned supply. */
  continuationCursors?: {
    sourced?: Readonly<Record<string, string>>
    owned?: Readonly<Record<string, string>>
  }
}

interface SourceOutcome {
  source: string
  kind: "sourced" | "owned"
  status: AvailabilityConnectionStatus
  candidates: AvailabilityCandidate[]
  latencyMs: number
  errorMessage?: string
  nextCursor?: string
}

/**
 * Fan out an availability search across sourced connections + owned handlers,
 * parallelized with a per-source timeout, then merge and rank by price.
 *
 * Partial-success semantics: sources that time out / error / lack the
 * capability are flagged in `perConnection`; the fan-out still returns
 * whatever responding sources produced.
 */
export async function fanOutAvailabilitySearch(
  options: FanOutAvailabilitySearchOptions,
): Promise<FanOutAvailabilityResult> {
  const timeoutMs = options.perConnectionTimeoutMs ?? 5000
  const { request } = options

  const sourcedTasks = (options.adapters ?? []).map(({ connectionId, adapter, context }) =>
    runSource(connectionId, "sourced", timeoutMs, async () => {
      // Vertical gate — skip adapters that don't feed the requested vertical
      // (e.g. a flight connection on an accommodations search) rather than
      // querying them with criteria they don't own.
      if (!adapter.capabilities.verticals.includes(request.vertical)) {
        return { status: "vertical_skipped" as const, candidates: [] }
      }
      // Capability gate up front — declared flag AND method presence.
      if (!adapter.capabilities.supportsAvailabilitySearch || !adapter.searchAvailability) {
        return { status: "capability_missing" as const, candidates: [] }
      }
      const ctx: SourceAdapterContext = { connection_id: connectionId, ...context }
      const cursor = options.continuationCursors?.sourced?.[connectionId]
      const result = await adapter.searchAvailability(
        ctx,
        cursor ? { ...request, cursor } : request,
      )
      // Stamp the dispatching connection as origin, unless the adapter already
      // set a more specific one (e.g. a cross-provider search per candidate).
      const candidates = result.candidates.map((candidate) => {
        if (candidate.source?.kind === "owned") return candidate
        return {
          ...candidate,
          source: {
            kind: "sourced" as const,
            connectionId: candidate.source?.connectionId ?? connectionId,
            sourceKind: candidate.source?.sourceKind ?? adapter.kind,
            ...(candidate.source?.sourceProvider
              ? { sourceProvider: candidate.source.sourceProvider }
              : {}),
            ...(candidate.source?.sourceRef ? { sourceRef: candidate.source.sourceRef } : {}),
          },
        }
      })
      return { status: result.status, candidates, nextCursor: result.next_cursor }
    }),
  )

  const ownedTasks = (options.ownedHandlers ?? []).map(({ handler, context }) =>
    runSource(handler.entityModule, "owned", timeoutMs, async () => {
      // An owned handler claims exactly one vertical (its entityModule); skip
      // it when the search is for a different one.
      if (handler.entityModule !== request.vertical) {
        return { status: "vertical_skipped" as const, candidates: [] }
      }
      const cursor = options.continuationCursors?.owned?.[handler.entityModule]
      const result = await handler.searchAvailability(
        context,
        cursor ? { ...request, cursor } : request,
      )
      const candidates = result.candidates.map((c) =>
        c.source ? c : { ...c, source: { kind: "owned" as const, module: handler.entityModule } },
      )
      return { status: result.status, candidates, nextCursor: result.next_cursor }
    }),
  )

  const outcomes = await Promise.all([...sourcedTasks, ...ownedTasks])

  const perConnection: AvailabilityConnectionResult[] = outcomes.map((o) => ({
    source: o.source,
    kind: o.kind,
    status: o.status,
    count: o.candidates.length,
    latencyMs: o.latencyMs,
    errorMessage: o.errorMessage,
    nextCursor: o.nextCursor,
  }))

  const merged: PresentedAvailabilityCandidate[] = outcomes
    .flatMap((o) => o.candidates)
    .map((candidate) => ({ ...candidate }))
  const presentation = await normalizePresentationMoney(
    merged.map((candidate) => candidate.price),
    options.presentation,
  )
  for (const [index, price] of presentation.prices.entries()) {
    if (price && merged[index]) merged[index].presentationPrice = price
  }
  if (
    presentation.ranking.status === "ranked_native" ||
    presentation.ranking.status === "ranked_presentation"
  ) {
    merged.sort((a, b) => {
      if (!a.presentationPrice || !b.presentationPrice) return 0
      return comparePresentationMoney(a.presentationPrice, b.presentationPrice)
    })
  }

  const candidates = options.limit != null ? merged.slice(0, options.limit) : merged

  return { candidates, perConnection, priceRanking: presentation.ranking }
}

async function runSource(
  source: string,
  kind: "sourced" | "owned",
  timeoutMs: number,
  run: () => Promise<{
    status: AvailabilityConnectionStatus
    candidates: AvailabilityCandidate[]
    nextCursor?: string
  }>,
): Promise<SourceOutcome> {
  const start = Date.now()
  try {
    const { status, candidates, nextCursor } = await withTimeout(
      run(),
      timeoutMs,
      `source ${source} timed out after ${timeoutMs}ms`,
    )
    return { source, kind, status, candidates, nextCursor, latencyMs: Date.now() - start }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isTimeout = message.includes("timed out")
    return {
      source,
      kind,
      status: isTimeout ? "timeout" : "error",
      candidates: [],
      latencyMs: Date.now() - start,
      errorMessage: message,
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}
