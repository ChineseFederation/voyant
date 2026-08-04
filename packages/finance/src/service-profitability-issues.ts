/**
 * Departure-scoped profitability attention issues (voyant#4037, item 8).
 *
 * "Something about this departure's margin disagrees with itself." Modelled on
 * `@voyant-travel/inventory`'s `evaluateProductReadiness` and operations'
 * `evaluateDepartureIssues`: the rules are **pure** over facts the profitability
 * loader has already gathered, so they stay cheap to unit-test and identical
 * across every transport, and every issue carries a **stable machine code** the
 * UI translates. Never rename a code — the operator UI, the Tool transport, and
 * anything that stores an issue key off these. Add a new code instead.
 *
 * Deliberately no `href`. Navigation is the UI's job (see the deep-link wiring
 * in `finance-react`); the domain layer names the subject and its id and stops
 * there, exactly as operations' departure issues do.
 *
 * Detection only. Nothing here repairs anything.
 */

export type ProfitabilityIssueSeverity = "critical" | "warning"

/**
 * Stable profitability issue codes. Never rename one; add a new code instead.
 */
export type ProfitabilityIssueCode =
  /** Revenue or actual cost exists, but no planned cost was resolved — variance is meaningless. */
  | "missing_planned_cost"
  /** Cost is planned/committed for the departure, yet no supplier cost has been attributed to it. */
  | "incomplete_supplier_attribution"
  /** Revenue with zero cost of any kind — a 100% margin that is almost certainly an attribution gap. */
  | "suspicious_full_margin"
  /** The departure carries a currency that cannot be converted, so it silently drops out of the base rollup. */
  | "rollup_disagreement"

export type ProfitabilityIssueSubjectType = "departure"

export interface ProfitabilityIssue {
  code: ProfitabilityIssueCode
  severity: ProfitabilityIssueSeverity
  subjectType: ProfitabilityIssueSubjectType
  /** Id of the subject the issue is about — the departure (availability slot) id. */
  subjectId: string
  /** English fallback for consumers with no message catalogue. */
  message: string
}

/**
 * The facts the evaluator needs for one departure, summed across currencies from
 * the profitability accumulator. Amounts are indicative totals used only to
 * decide *whether* a signal fires; the report rows carry the authoritative
 * per-currency figures.
 */
export interface ProfitabilityIssueInput {
  departureId: string
  /** True when any per-currency revenue is positive. */
  hasRevenue: boolean
  /** Total actual (allocated supplier) cost across currencies. */
  actualCostCents: number
  /** Total planned cost across currencies. */
  plannedCostCents: number
  /** Total committed (confirmed supplier) cost across currencies. */
  committedCostCents: number
  /**
   * True when this departure is bound to a Product Version and therefore costed
   * from the frozen day-service contract rather than the `booking_items`
   * fallback. A fallback departure with no planned cost is a softer signal.
   */
  versionResolved: boolean
  /** Version-bound operation lines whose frozen day service declared no cost block. */
  linesMissingCostBlock: number
  /**
   * True when the departure holds an amount in a currency with no resolvable FX
   * rate, so its contribution is excluded from the accounting-base rollup.
   */
  hasUnconvertibleAmount: boolean
}

/**
 * Evaluate every rule against already-loaded facts. Pure: same facts in, same
 * issues out, in a stable order (critical first, then code order).
 */
export function evaluateProfitabilityIssues(input: ProfitabilityIssueInput): ProfitabilityIssue[] {
  const issues: ProfitabilityIssue[] = []
  const add = (
    code: ProfitabilityIssueCode,
    severity: ProfitabilityIssueSeverity,
    message: string,
  ) => {
    issues.push({ code, severity, subjectType: "departure", subjectId: input.departureId, message })
  }

  const hasCost = input.actualCostCents > 0 || input.plannedCostCents > 0
  const plannedMissing =
    input.plannedCostCents <= 0 && (input.hasRevenue || input.actualCostCents > 0)

  if (plannedMissing || input.linesMissingCostBlock > 0) {
    add(
      "missing_planned_cost",
      "warning",
      input.linesMissingCostBlock > 0
        ? "One or more of this departure's frozen services declared no planned cost, so planned margin is understated."
        : "This departure has revenue or actual cost but no planned cost, so its variance cannot be trusted.",
    )
  }

  // Cost is planned or committed for the departure, yet nothing has been
  // attributed to it from a supplier invoice — the actual cost is still zero.
  if (input.actualCostCents <= 0 && (input.plannedCostCents > 0 || input.committedCostCents > 0)) {
    add(
      "incomplete_supplier_attribution",
      "warning",
      "This departure has planned or committed cost but no supplier cost has been attributed to it yet.",
    )
  }

  // Revenue with no cost signal anywhere — a 100% margin that is almost always
  // an attribution gap rather than a real outcome.
  if (input.hasRevenue && !hasCost && input.committedCostCents <= 0) {
    add(
      "suspicious_full_margin",
      "warning",
      "This departure reports revenue with no cost of any kind, so its margin looks like 100%.",
    )
  }

  if (input.hasUnconvertibleAmount) {
    add(
      "rollup_disagreement",
      "critical",
      "This departure holds an amount in a currency with no FX rate, so it is excluded from the accounting-base rollup and the totals will not reconcile.",
    )
  }

  return issues.sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity) || a.code.localeCompare(b.code),
  )
}

function severityRank(severity: ProfitabilityIssueSeverity): number {
  return severity === "critical" ? 0 : 1
}
