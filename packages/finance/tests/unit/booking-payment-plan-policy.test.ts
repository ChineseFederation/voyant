/**
 * voyant#4744 — the default booking payment plan must come from the operator's
 * configured `PaymentPolicy`, not from a hardcoded 30% / 30-days plan standing
 * beside it.
 *
 * The three cases that matter are: an unstated plan follows the policy, an
 * unconfigured operator gets full payment (not a guess), and a caller who
 * states terms still gets exactly those terms.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@voyant-travel/db/booking-finance-fence", () => ({
  withBookingFinanceInsertionFence: <T>(
    db: unknown,
    _bookingId: string,
    operation: (tx: unknown) => Promise<T>,
  ) => operation(db),
  lockBookingFinanceInsertionFence: async () => {},
}))

import type { PaymentPolicy } from "../../src/payment-policy.js"
import type { BookingPaymentPolicyCascadeReaders } from "../../src/payment-schedule/booking-policy.js"
import { financeBookingPaymentScheduleService } from "../../src/service-booking-payment-schedules.js"

/** A cascade whose operator default is the policy under test. */
function cascadeFor(policy: PaymentPolicy | null): BookingPaymentPolicyCascadeReaders {
  return {
    resolveOperatorDefaultPaymentPolicy: async () => policy,
    resolveSupplierPolicy: async () => null,
    resolveCategoryPolicy: async () => null,
    resolveListingPolicy: async () => null,
  }
}

type InsertedRow = {
  scheduleType: string
  amountCents: number
  dueDate: string
  status: string
  currency: string
}

/**
 * Chainable drizzle stub.
 *
 * `.limit()` is the booking read — the only query in this path that narrows to
 * one row. `.where()` may be a link or a terminal, so it returns a real Promise
 * carrying the chain's methods: awaiting it yields the empty clearable-schedule
 * set, and calling `.limit()` on it still reaches the booking. `.returning()`
 * plays back whatever `.values()` was handed.
 */
function makeDbStub(booking: Record<string, unknown>) {
  const inserted: InsertedRow[] = []
  let pendingInsert: InsertedRow[] = []

  const chain: Record<string, unknown> = {}
  for (const method of ["select", "from", "set", "delete", "update", "insert"]) {
    chain[method] = vi.fn(() => chain)
  }
  chain.limit = vi.fn(() => Promise.resolve([booking]))
  chain.orderBy = vi.fn(() => Promise.resolve([]))
  chain.returning = vi.fn(() => Promise.resolve(pendingInsert))
  chain.values = vi.fn((rows: InsertedRow[] | InsertedRow) => {
    pendingInsert = Array.isArray(rows) ? rows : [rows]
    inserted.push(...pendingInsert)
    return chain
  })
  chain.where = vi.fn(() => Object.assign(Promise.resolve([]), chain))

  return { db: chain as never, inserted }
}

const fiftyPercentFourteenDays: PaymentPolicy = {
  deposit: { kind: "percent", percent: 50 },
  minDaysBeforeDepartureForDeposit: 0,
  balanceDueDaysBeforeDeparture: 14,
  balanceDueMinDaysFromNow: 0,
}

const booking = {
  id: "bk_1",
  sellAmountCents: 37_800,
  sellCurrency: "EUR",
  startDate: "2026-09-20",
}

const basePlan = { clearExistingPending: true, createGuarantee: false, guaranteeType: "deposit" }

describe("applyDefaultBookingPaymentPlan — deposit terms come from the policy", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-16T09:00:00Z"))
  })

  it("splits by the operator's configured policy when the caller states no terms", async () => {
    const stub = makeDbStub(booking)

    await financeBookingPaymentScheduleService.applyDefaultBookingPaymentPlan(
      stub.db,
      "bk_1",
      basePlan as never,
      { paymentPolicyCascade: cascadeFor(fiftyPercentFourteenDays) },
    )

    // The issue's booking: €378.00 departing 2026-09-20, operator configured
    // 50% with the balance 14 days out. The old code answered 30%/30-days.
    expect(stub.inserted).toHaveLength(2)
    expect(stub.inserted[0]).toMatchObject({
      scheduleType: "deposit",
      amountCents: 18_900,
      dueDate: "2026-08-16",
    })
    expect(stub.inserted[1]).toMatchObject({
      scheduleType: "balance",
      amountCents: 18_900,
      dueDate: "2026-09-06",
    })
  })

  it("honours the policy's near-departure deposit gate", async () => {
    const stub = makeDbStub(booking)

    await financeBookingPaymentScheduleService.applyDefaultBookingPaymentPlan(
      stub.db,
      "bk_1",
      basePlan as never,
      {
        paymentPolicyCascade: cascadeFor({
          ...fiftyPercentFourteenDays,
          minDaysBeforeDepartureForDeposit: 60,
        }),
      },
    )

    // Departure is 35 days out, inside the 60-day gate — the agency has no
    // time to chase a balance, so the whole amount is due now. The plan
    // fields the old model carried could not express this at all.
    expect(stub.inserted).toHaveLength(1)
    expect(stub.inserted[0]).toMatchObject({
      scheduleType: "balance",
      amountCents: 37_800,
      dueDate: "2026-08-16",
    })
  })

  it("charges in full when no cascade is composed, rather than guessing 30%", async () => {
    const stub = makeDbStub(booking)

    await financeBookingPaymentScheduleService.applyDefaultBookingPaymentPlan(
      stub.db,
      "bk_1",
      basePlan as never,
      {},
    )

    expect(stub.inserted).toHaveLength(1)
    expect(stub.inserted[0]).toMatchObject({ scheduleType: "balance", amountCents: 37_800 })
  })

  it("takes a caller-stated plan literally, ignoring the policy", async () => {
    const stub = makeDbStub(booking)

    await financeBookingPaymentScheduleService.applyDefaultBookingPaymentPlan(
      stub.db,
      "bk_1",
      {
        ...basePlan,
        depositMode: "percentage",
        depositValue: 20,
        balanceDueDaysBeforeStart: 7,
      } as never,
      { paymentPolicyCascade: cascadeFor(fiftyPercentFourteenDays) },
    )

    expect(stub.inserted).toHaveLength(2)
    expect(stub.inserted[0]).toMatchObject({ scheduleType: "deposit", amountCents: 7_560 })
    expect(stub.inserted[1]).toMatchObject({
      scheduleType: "balance",
      amountCents: 30_240,
      dueDate: "2026-09-13",
    })
  })

  it("treats a stated fixed deposit as an override even with a percent policy", async () => {
    const stub = makeDbStub(booking)

    await financeBookingPaymentScheduleService.applyDefaultBookingPaymentPlan(
      stub.db,
      "bk_1",
      { ...basePlan, depositMode: "fixed_amount", depositValue: 10_000 } as never,
      { paymentPolicyCascade: cascadeFor(fiftyPercentFourteenDays) },
    )

    expect(stub.inserted[0]).toMatchObject({ scheduleType: "deposit", amountCents: 10_000 })
    expect(stub.inserted[1]).toMatchObject({ scheduleType: "balance", amountCents: 27_800 })
  })
})
