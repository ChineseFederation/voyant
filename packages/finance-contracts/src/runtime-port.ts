/**
 * Import-cheap deployment declaration for the Finance App API runtime.
 * Runtime DTOs deliberately stay behind `./app-api`.
 */
export const financeAppApiRuntimePort = Object.freeze({
  id: "finance.app-api.runtime",
  test(provider: unknown) {
    if (!provider || typeof provider !== "object") {
      throw new Error("finance.app-api.runtime provider must be an object.")
    }
    for (const method of [
      "getIssuanceDocument",
      "getExternalReference",
      "upsertExternalReference",
      "attachPdfArtifact",
      "updateExternalSyncState",
      "updateExternalLifecycleState",
      "recordSettlementObservation",
    ]) {
      if (typeof Reflect.get(provider, method) !== "function") {
        throw new Error(`finance.app-api.runtime provider must implement ${method}().`)
      }
    }
  },
})

/**
 * The subset of Finance's departure profitability row a non-Finance module is
 * allowed to read. Finance's own `DepartureProfitabilityRow` is structurally a
 * superset, so the provider `satisfies` this without a mapping layer — and
 * stops compiling if the read model ever loses one of these fields.
 */
export interface FinanceDepartureProfitabilityRow {
  departureId: string
  productId: string | null
  departureDate: string | null
  currency: string
  revenueCents: number
  actualCostCents: number
  plannedCostCents: number
  profitCents: number
  marginPercent: number | null
  varianceCents: number
}

/** Single-currency rollup of the rows above, in the operator's base currency. */
export interface FinanceDepartureProfitabilityBaseRollup {
  currency: string
  rows: FinanceDepartureProfitabilityRow[]
  /** Source currencies with no resolvable FX rate — excluded from the rollup. */
  unconvertibleCurrencies: string[]
}

export interface FinanceDepartureProfitabilityReport {
  rows: FinanceDepartureProfitabilityRow[]
  base?: FinanceDepartureProfitabilityBaseRollup
}

export interface FinanceDepartureProfitabilityQuery {
  departureId?: string
  productId?: string
  currency?: string
}

/**
 * Read-only view of Finance's departure P&L.
 *
 * Exists so a module that renders a departure — Operations' departure
 * workspace — can put a headline profit figure on it without depending on
 * `@voyant-travel/finance` and without recomputing money. Finance stays the
 * monetary authority: FX settings and the base-currency rollup are resolved
 * inside the provider, which is why the seam takes no FX options.
 *
 * Optional on the consuming side — a deployment without Finance simply binds
 * nothing and the consumer renders no money.
 */
export interface FinanceDepartureProfitabilityRuntime<TDatabase = unknown> {
  getDepartureProfitability(
    db: TDatabase,
    query: FinanceDepartureProfitabilityQuery,
  ): Promise<FinanceDepartureProfitabilityReport>
}

/**
 * Import-cheap deployment declaration for the departure profitability read.
 *
 * Typed against the runtime interface (rather than `unknown`) so `getPort`
 * infers the provider on the consuming side; the conformance kit still probes
 * the raw value, because the whole point of a kit is that the binding might be
 * anything.
 */
export const financeDepartureProfitabilityRuntimePort: {
  readonly id: "finance.departure-profitability.runtime"
  readonly test: (provider: FinanceDepartureProfitabilityRuntime) => void
} = Object.freeze({
  id: "finance.departure-profitability.runtime" as const,
  test(provider: unknown) {
    if (!provider || typeof provider !== "object") {
      throw new Error("finance.departure-profitability.runtime provider must be an object.")
    }
    if (typeof Reflect.get(provider, "getDepartureProfitability") !== "function") {
      throw new Error(
        "finance.departure-profitability.runtime provider must implement getDepartureProfitability().",
      )
    }
  },
})
