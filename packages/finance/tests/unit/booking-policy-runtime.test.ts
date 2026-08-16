/**
 * voyant#4744 — the surfaces that were carrying their own deposit model reach
 * the cascade through the container registration the `booking.confirmed`
 * subscriber already uses, so there is one wiring point rather than two that a
 * deployment could fill in differently.
 */

import { describe, expect, it, vi } from "vitest"

import { BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY } from "../../src/booking-schedule/subscriber-runtime.js"
import { defaultPaymentPlan } from "../../src/checkout-service-plan.js"
import { noDepositPolicy, type PaymentPolicy } from "../../src/payment-policy.js"
import { resolveBookingPaymentPolicy } from "../../src/payment-schedule/booking-policy.js"
import { resolveBookingPaymentPolicyCascade } from "../../src/payment-schedule/booking-policy-runtime.js"

const supplierPolicy: PaymentPolicy = {
  deposit: { kind: "percent", percent: 50 },
  minDaysBeforeDepartureForDeposit: 0,
  balanceDueDaysBeforeDeparture: 14,
  balanceDueMinDaysFromNow: 0,
}

const baseReaders = {
  resolveOperatorDefaultPaymentPolicy: vi.fn(async () => noDepositPolicy),
  resolveSupplierPolicy: vi.fn(async () => null),
  resolveCategoryPolicy: vi.fn(async () => null),
  resolveListingPolicy: vi.fn(async () => null),
}

function makeContainer(readers: Record<string, unknown>) {
  return {
    has: (key: string) => key === BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY,
    resolve: () => ({
      resolveRoutesOptions: async () => readers,
      withDb: async () => undefined,
    }),
  } as never
}

describe("resolveBookingPaymentPolicyCascade", () => {
  it("is absent when no booking-schedule extension is composed", async () => {
    expect(await resolveBookingPaymentPolicyCascade(undefined, {})).toBeNull()
    expect(await resolveBookingPaymentPolicyCascade({ has: () => false } as never, {})).toBeNull()
  })

  it("hands back the deployment's injected readers", async () => {
    const readers = { ...baseReaders, resolveSupplierPolicy: async () => supplierPolicy }

    const resolved = await resolveBookingPaymentPolicyCascade(makeContainer(readers), {})

    expect(resolved).toBe(readers)
    // And those readers answer the cascade the same way the subscriber does.
    expect(
      await resolveBookingPaymentPolicy(
        {} as never,
        { id: "bk_1", customerPaymentPolicy: null },
        // biome-ignore lint/suspicious/noExplicitAny: the stub is shaped by the interface it satisfies.
        resolved as any,
      ),
    ).toEqual({ policy: supplierPolicy, source: "supplier" })
  })
})

describe("defaultPaymentPlan", () => {
  it("states no deposit terms when the deployment configured none", () => {
    const plan = defaultPaymentPlan({})

    // These three being undefined is what makes the collection runtime take
    // the operator's configured policy. They used to be percentage / 30 / 30.
    expect(plan.depositMode).toBeUndefined()
    expect(plan.depositValue).toBeUndefined()
    expect(plan.balanceDueDaysBeforeStart).toBeUndefined()
    expect(plan.clearExistingPending).toBe(true)
  })

  it("passes a deliberately configured override through", () => {
    const plan = defaultPaymentPlan({
      defaultPaymentPlan: { depositMode: "fixed_amount", depositValue: 5_000 },
    })

    expect(plan).toMatchObject({ depositMode: "fixed_amount", depositValue: 5_000 })
  })
})
