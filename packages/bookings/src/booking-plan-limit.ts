import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export const VOYANT_BOOKINGS_MONTHLY_LIMIT_BINDING = "VOYANT_BOOKINGS_MONTHLY_LIMIT" as const

export class BookingMonthlyLimitConfigurationError extends Error {
  readonly code = "invalid_monthly_booking_limit" as const

  constructor(readonly value: unknown) {
    super(
      `${VOYANT_BOOKINGS_MONTHLY_LIMIT_BINDING} must be a positive integer when configured; unset it for unlimited bookings.`,
    )
    this.name = "BookingMonthlyLimitConfigurationError"
  }
}

export interface BookingMonthlyLimitReachedDetails {
  limit: number
  current: number
  periodStart: string
  periodEnd: string
}

export class BookingMonthlyLimitReachedError extends Error {
  readonly code = "monthly_booking_limit_reached" as const

  constructor(readonly details: BookingMonthlyLimitReachedDetails) {
    super(
      `This workspace has reached its monthly booking limit (${details.current}/${details.limit}). Upgrade the plan or wait until ${details.periodEnd}.`,
    )
    this.name = "BookingMonthlyLimitReachedError"
  }
}

/**
 * Resolve the managed-plan booking allowance. The limit is intentionally
 * opt-in so self-hosted and older deployments retain unlimited bookings.
 */
export function resolveMonthlyBookingLimit(env: Readonly<Record<string, unknown>>): number | null {
  const raw = env[VOYANT_BOOKINGS_MONTHLY_LIMIT_BINDING]
  if (raw === undefined || raw === null || raw === "") return null

  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new BookingMonthlyLimitConfigurationError(raw)
  }
  return parsed
}

/**
 * Supplies the monthly booking allowance that applies to the work in flight,
 * rather than the one the process booted with.
 *
 * A composed API graph is built once per process and reused for the process
 * lifetime, so anything read from bindings at composition time is a boot-time
 * constant. That is correct for a self-hosted deployment, where the allowance
 * is a property of the container. It is wrong for a managed host serving a
 * tenant whose plan entitlement can change while the process runs — there the
 * allowance is a property of the request's subscription state.
 *
 * A host supplies one of these (typically reading an `AsyncLocalStorage` it
 * populates per request) and the runtime consults it on every read. Returning:
 *
 * - a `number` — that allowance applies right now
 * - `null` — unlimited right now, overriding whatever was configured
 * - `undefined` — no live answer available; fall back to the configured value
 *
 * The resolver is not validated here. `assertMonthlyBookingLimitAvailable` is
 * the single validation authority for the value that is actually enforced, so
 * a malformed live answer fails at the point of enforcement rather than
 * silently capping a tenant at the wrong number.
 */
export type MonthlyBookingLimitResolver = () => number | null | undefined

/**
 * Pick between a host's live allowance and the value resolved from bindings at
 * composition time. Absent a resolver — or absent a live answer from one — the
 * configured value wins, so a deployment that installs no resolver behaves
 * exactly as it did before the seam existed.
 */
export function selectMonthlyBookingLimit(
  resolveLive: MonthlyBookingLimitResolver | undefined,
  configured: number | null,
): number | null {
  if (!resolveLive) return configured
  const live = resolveLive()
  return live === null || typeof live === "number" ? live : configured
}

type MonthlyBookingUsageRow = {
  current: number | string
  period_start: string | Date
  period_end: string | Date
}

function rowsFromResult<TRow>(result: unknown): TRow[] {
  if (Array.isArray(result)) return result as TRow[]
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows
    return Array.isArray(rows) ? (rows as TRow[]) : []
  }
  return []
}

function timestampText(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

/**
 * Serialize quota consumers in the current tenant database and reject the
 * next accepted booking once the configured allowance is exhausted.
 *
 * Callers must invoke this inside the same transaction that accepts the
 * booking. The transaction-scoped advisory lock makes concurrent acceptances
 * observe one another, while `excludeBookingId` makes status repair/replay
 * paths count a booking at most once.
 */
export async function assertMonthlyBookingLimitAvailable(
  tx: PostgresJsDatabase,
  limit: number | null | undefined,
  options: { excludeBookingId?: string | null } = {},
): Promise<void> {
  if (limit === undefined || limit === null) return
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new BookingMonthlyLimitConfigurationError(limit)
  }

  // One workload database is one tenant. A stable advisory-lock key therefore
  // serializes only this tenant's quota-consuming transitions.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('voyant:bookings:monthly-limit', 0))`,
  )

  const result = await tx.execute(sql`
    SELECT
      (
        SELECT count(*)::int
        FROM bookings
        WHERE accepted_at >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
          AND accepted_at < (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC'
          AND (${options.excludeBookingId ?? null}::text IS NULL OR id <> ${options.excludeBookingId ?? null})
      ) AS current,
      (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::text AS period_start,
      ((date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC')::text AS period_end
  `)
  const usage = rowsFromResult<MonthlyBookingUsageRow>(result)[0]
  const current = Number(usage?.current ?? 0)
  if (current < limit) return

  throw new BookingMonthlyLimitReachedError({
    limit,
    current,
    periodStart: timestampText(usage?.period_start ?? new Date()),
    periodEnd: timestampText(usage?.period_end ?? new Date()),
  })
}
