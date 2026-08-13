/**
 * Customer-facing payment policy primitive.
 *
 * Decides how to split a booking total into a payment schedule: full
 * payment up-front, or a deposit now + balance due before departure.
 * Pure function — no DB, no IO. Two policies in (the operator default
 * + any per-supplier / per-category / per-listing override) plus the
 * booking total + departure date, schedule rows out.
 *
 * Behaviour:
 *
 *   1. If `policy.deposit.kind === "none"` → one row, full total, due
 *      immediately. Skips the rest of the rules.
 *   2. If departure is too close (`< minDaysBeforeDepartureForDeposit`
 *      from today) → also full payment now. The agency doesn't have
 *      time to chase a balance.
 *   3. Otherwise → two rows:
 *        - deposit row, due today, amount = percent × total OR fixed
 *          cents (capped at total).
 *        - balance row, amount = total − deposit, due
 *          `balanceDueDaysBeforeDeparture` before departure, but never
 *          sooner than `balanceDueMinDaysFromNow` days from now.
 *
 * Cascade resolution lives in {@link resolveEffectivePaymentPolicy}:
 * the most-specific layer that defines a policy wins (booking >
 * listing > category > supplier > operator default), no field-level
 * merging — so the audit trail is "this whole policy applied".
 */

export type DepositKind = "none" | "percent" | "fixed_cents"

export interface DepositRule {
  kind: DepositKind
  /** Required when `kind === "percent"`. 0–100 inclusive. */
  percent?: number
  /** Required when `kind === "fixed_cents"`. Capped at total. */
  amountCents?: number
}

export interface PaymentPolicy {
  deposit: DepositRule
  /** Below this many days before departure, deposits are rejected and
   *  the booking is invoiced for the full amount up-front. */
  minDaysBeforeDepartureForDeposit: number
  /** When the balance is due (days BEFORE departure). */
  balanceDueDaysBeforeDeparture: number
  /** Floor on the balance due date so it's never sooner than this
   *  many days from "now". Protects the customer from a tight squeeze
   *  when departure is barely outside the deposit window. */
  balanceDueMinDaysFromNow: number
}

/** Default policy: 100% up-front, no deposit. Safe fallback for
 *  agencies that haven't configured anything yet. */
export const noDepositPolicy: PaymentPolicy = {
  deposit: { kind: "none" },
  minDaysBeforeDepartureForDeposit: 0,
  balanceDueDaysBeforeDeparture: 0,
  balanceDueMinDaysFromNow: 0,
}

export function normalizePaymentPolicy(value: unknown): PaymentPolicy | null {
  if (value == null) return null
  if (isPaymentPolicy(value)) return value
  if (!value || typeof value !== "object") return null

  const legacy = value as {
    type?: unknown
    depositPercent?: unknown
    balanceDueDays?: unknown
    balanceDueDaysBeforeDeparture?: unknown
    minDaysBeforeDepartureForDeposit?: unknown
    balanceDueMinDaysFromNow?: unknown
  }

  if (legacy.type === "full" || legacy.type === "none") {
    return noDepositPolicy
  }

  if (legacy.type !== "deposit") return null

  const percent = readPercent(legacy.depositPercent)
  if (percent === null) return null

  return {
    deposit: { kind: "percent", percent },
    minDaysBeforeDepartureForDeposit:
      readNonNegativeInteger(legacy.minDaysBeforeDepartureForDeposit) ?? 0,
    balanceDueDaysBeforeDeparture:
      readNonNegativeInteger(legacy.balanceDueDaysBeforeDeparture) ??
      readNonNegativeInteger(legacy.balanceDueDays) ??
      0,
    balanceDueMinDaysFromNow: readNonNegativeInteger(legacy.balanceDueMinDaysFromNow) ?? 0,
  }
}

export function isPaymentPolicy(value: unknown): value is PaymentPolicy {
  if (!value || typeof value !== "object") return false
  const policy = value as Partial<PaymentPolicy>
  return (
    isDepositRule(policy.deposit) &&
    isNonNegativeInteger(policy.minDaysBeforeDepartureForDeposit) &&
    isNonNegativeInteger(policy.balanceDueDaysBeforeDeparture) &&
    isNonNegativeInteger(policy.balanceDueMinDaysFromNow)
  )
}

function isDepositRule(value: unknown): value is DepositRule {
  if (!value || typeof value !== "object") return false
  const rule = value as Partial<DepositRule>
  if (rule.kind === "none") return true
  if (rule.kind === "percent") {
    return typeof rule.percent === "number" && rule.percent >= 0 && rule.percent <= 100
  }
  if (rule.kind === "fixed_cents") {
    return isNonNegativeInteger(rule.amountCents)
  }
  return false
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function readNonNegativeInteger(value: unknown): number | null {
  return isNonNegativeInteger(value) ? value : null
}

function readPercent(value: unknown): number | null {
  return typeof value === "number" && value >= 0 && value <= 100 ? value : null
}

export type PaymentScheduleEntryType = "deposit" | "balance" | "full"

export interface ComputedScheduleEntry {
  scheduleType: PaymentScheduleEntryType
  amountCents: number
  currency: string
  /** ISO `YYYY-MM-DD`. */
  dueDate: string
}

export interface ComputeScheduleInput {
  totalCents: number
  currency: string
  /** ISO `YYYY-MM-DD` (or full ISO string — we only look at the date). */
  departureDate: string | null | undefined
  /** Defaults to `new Date()`. Injectable for deterministic tests. */
  today?: Date
}

/**
 * Compute the customer-facing payment schedule for a booking.
 *
 * Always returns at least one row. When the policy resolves to no
 * deposit (or the gate denies one), the single row is a `full`
 * scheduled for today.
 */
export function computePaymentSchedule(
  input: ComputeScheduleInput,
  policy: PaymentPolicy,
): ComputedScheduleEntry[] {
  const effectivePolicy = normalizePaymentPolicy(policy) ?? noDepositPolicy
  const total = Math.max(0, Math.round(input.totalCents))
  const today = input.today ?? new Date()
  const todayIso = isoDate(today)

  if (total === 0) {
    return [{ scheduleType: "full", amountCents: 0, currency: input.currency, dueDate: todayIso }]
  }

  if (effectivePolicy.deposit.kind === "none") {
    return [
      { scheduleType: "full", amountCents: total, currency: input.currency, dueDate: todayIso },
    ]
  }

  const departure = parseIsoDate(input.departureDate)
  if (!departure) {
    // Without a departure date we can't anchor the balance, so fall
    // back to full upfront — the operator can still split manually
    // via a booking-level override later.
    return [
      { scheduleType: "full", amountCents: total, currency: input.currency, dueDate: todayIso },
    ]
  }

  const daysUntilDeparture = wholeDaysBetween(today, departure)
  if (daysUntilDeparture < effectivePolicy.minDaysBeforeDepartureForDeposit) {
    return [
      { scheduleType: "full", amountCents: total, currency: input.currency, dueDate: todayIso },
    ]
  }

  const depositCents = resolveDepositAmountCents(total, effectivePolicy.deposit)
  const balanceCents = total - depositCents
  if (depositCents <= 0 || balanceCents <= 0) {
    // Edge: a policy that resolves to 0% deposit or 100% deposit
    // collapses to a single row rather than emitting a zero-cent
    // partner.
    return [
      { scheduleType: "full", amountCents: total, currency: input.currency, dueDate: todayIso },
    ]
  }

  const rawBalanceDue = addDays(departure, -effectivePolicy.balanceDueDaysBeforeDeparture)
  const earliestBalanceDue = addDays(today, effectivePolicy.balanceDueMinDaysFromNow)
  const balanceDue =
    rawBalanceDue.getTime() > earliestBalanceDue.getTime() ? rawBalanceDue : earliestBalanceDue

  return [
    {
      scheduleType: "deposit",
      amountCents: depositCents,
      currency: input.currency,
      dueDate: todayIso,
    },
    {
      scheduleType: "balance",
      amountCents: balanceCents,
      currency: input.currency,
      dueDate: isoDate(balanceDue),
    },
  ]
}

/**
 * What a deposit rule is worth against a total, clamped to `[0, total]`.
 *
 * Exported because a deposit has to be quotable before a schedule exists — a
 * proposal states "50% now" as an amount the customer is agreeing to, and it
 * has no departure date to build a schedule around. Sharing this with
 * {@link computePaymentSchedule} keeps the quoted figure and the billed one
 * from drifting apart.
 */
export function resolveDepositAmountCents(totalCents: number, rule: DepositRule): number {
  const total = Math.max(0, Math.round(totalCents))
  return clampCents(computeDepositCents(total, rule), 0, total)
}

function computeDepositCents(total: number, rule: DepositRule): number {
  if (rule.kind === "percent") {
    const pct = clampNumber(rule.percent ?? 0, 0, 100)
    return Math.round((total * pct) / 100)
  }
  if (rule.kind === "fixed_cents") {
    return Math.max(0, Math.round(rule.amountCents ?? 0))
  }
  return 0
}

/** True when this policy is empty / "inherit from parent". */
export function isPaymentPolicyEmpty(policy: PaymentPolicy | null | undefined): boolean {
  const effectivePolicy = normalizePaymentPolicy(policy)
  if (!effectivePolicy) return true
  if (effectivePolicy.deposit.kind === "none") return true
  if (
    effectivePolicy.deposit.kind === "percent" &&
    (effectivePolicy.deposit.percent === undefined || effectivePolicy.deposit.percent === 0)
  ) {
    return true
  }
  if (
    effectivePolicy.deposit.kind === "fixed_cents" &&
    (effectivePolicy.deposit.amountCents === undefined || effectivePolicy.deposit.amountCents === 0)
  ) {
    return true
  }
  return false
}

export type PaymentPolicySource =
  | "booking"
  | "proposal"
  | "listing"
  | "category"
  | "supplier"
  | "operator_default"

export interface PaymentPolicyCascadeLayers {
  bookingPolicy?: PaymentPolicy | null
  /**
   * Terms stated on the accepted Proposal Version this booking came from.
   *
   * Sits directly under the booking-level override and above every catalog
   * layer: a quoted trip is negotiated per client, and "50% now, the rest 30
   * days out" is part of what the customer agreed to when they accepted. A
   * listing's default cannot outrank an agreement. The booking layer still
   * wins, because that one is an ops correction made after the fact.
   */
  proposalPolicy?: PaymentPolicy | null
  listingPolicy?: PaymentPolicy | null
  categoryPolicy?: PaymentPolicy | null
  supplierPolicy?: PaymentPolicy | null
  operatorDefault: PaymentPolicy
}

export interface ResolvedPaymentPolicy {
  policy: PaymentPolicy
  source: PaymentPolicySource
}

/**
 * Most-specific-wins cascade (booking → proposal → listing → category →
 * supplier → operator default). Returns both the policy and which
 * layer it came from so contracts and ops UIs can show the trace.
 *
 * A layer is "set" when it's not null/undefined AND not effectively
 * empty (deposit kind === "none" with no other meaningful fields).
 * That way operators who declare an explicit "no deposit" policy on
 * a supplier override their parent's "50% deposit" — they pass an
 * explicit `deposit: { kind: "none" }` AND set non-zero day fields
 * to mark the layer as intentional.
 *
 * For v1 we rely on null/undefined to mean "inherit". The settings
 * API stores `null` for "use parent". An explicit "none" policy
 * needs to be modeled with a different deposit kind later if it
 * proves useful.
 */
export function resolveEffectivePaymentPolicy(
  layers: PaymentPolicyCascadeLayers,
): ResolvedPaymentPolicy {
  const bookingPolicy = normalizePaymentPolicy(layers.bookingPolicy)
  if (bookingPolicy) return { policy: bookingPolicy, source: "booking" }
  const proposalPolicy = normalizePaymentPolicy(layers.proposalPolicy)
  if (proposalPolicy) return { policy: proposalPolicy, source: "proposal" }
  const listingPolicy = normalizePaymentPolicy(layers.listingPolicy)
  if (listingPolicy) return { policy: listingPolicy, source: "listing" }
  const categoryPolicy = normalizePaymentPolicy(layers.categoryPolicy)
  if (categoryPolicy) return { policy: categoryPolicy, source: "category" }
  const supplierPolicy = normalizePaymentPolicy(layers.supplierPolicy)
  if (supplierPolicy) return { policy: supplierPolicy, source: "supplier" }
  return {
    policy: normalizePaymentPolicy(layers.operatorDefault) ?? noDepositPolicy,
    source: "operator_default",
  }
}

/**
 * Predicate the storefront UI uses to decide whether to surface the
 * "deposit + balance" copy or just "pay full now". Returns true when
 * the policy + departure date resolve to a single full-payment row.
 */
export function policyShouldRequireFullPayment(
  policy: PaymentPolicy,
  departureDate: string | null | undefined,
  today: Date = new Date(),
): boolean {
  const effectivePolicy = normalizePaymentPolicy(policy) ?? noDepositPolicy
  if (effectivePolicy.deposit.kind === "none") return true
  const departure = parseIsoDate(departureDate)
  if (!departure) return true
  return wholeDaysBetween(today, departure) < effectivePolicy.minDaysBeforeDepartureForDeposit
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.length >= 10 ? value.slice(0, 10) : value
  const parsed = new Date(`${trimmed}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function wholeDaysBetween(from: Date, to: Date): number {
  const fromMs = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const toMs = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  return Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000))
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function clampCents(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
