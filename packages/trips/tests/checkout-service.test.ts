import { beforeEach, describe, expect, it, vi } from "vitest"

const createPaymentSession = vi.fn()
const buildConfiguredPaymentLinkUrl = vi.fn()

vi.mock("@voyant-travel/finance", () => ({
  financeService: {
    createPaymentSession: (...args: unknown[]) => createPaymentSession(...args),
  },
  buildConfiguredPaymentLinkUrl: (...args: unknown[]) => buildConfiguredPaymentLinkUrl(...args),
}))

import {
  formatTripBillingName,
  readTripBilling,
  splitTripBillingName,
  startTripCheckout,
  synthesizeTripBilling,
  type TripCheckoutDeps,
} from "../src/checkout/index.js"
import type { Trip, TripCheckoutInput } from "../src/service.js"

const travelerParty = {
  billing: {
    personId: "person_billing",
    contact: {
      firstName: "Diego",
      lastName: "Muller",
      email: "diego@example.com",
      phone: "+40700000000",
    },
  },
}

function makeTrip(overrides?: Partial<Trip["envelope"]>): Trip {
  return {
    envelope: {
      id: "trip_abc",
      travelerParty,
      aggregateCurrency: "EUR",
      aggregateTotalAmountCents: 10000,
      ...overrides,
    },
    components: [
      {
        id: "comp_1",
        kind: "catalog_product",
        status: "priced",
        bookingId: null,
        orderId: null,
        title: "Lisbon city tour",
        description: null,
        metadata: null,
        componentCurrency: "EUR",
        componentTotalAmountCents: 10000,
      },
    ],
  } as Trip
}

function makeInput(intent: TripCheckoutInput["intent"]): TripCheckoutInput {
  return {
    trip: makeTrip(),
    intent,
    request: {},
  } as TripCheckoutInput
}

function makeDeps(overrides?: Partial<TripCheckoutDeps>): TripCheckoutDeps {
  return {
    db: {},
    quoteFx: vi.fn(async () => ({ rate: 1, quotedAt: "2026-01-01T00:00:00Z", validUntil: null })),
    resolveCheckoutBaseUrl: () => "https://pay.example.com",
    resolvePaymentLinkUrlTemplate: async () => "https://pay.example.com/pay?session={sessionId}",
    ...overrides,
  }
}

beforeEach(() => {
  createPaymentSession.mockReset()
  buildConfiguredPaymentLinkUrl.mockReset()
  createPaymentSession.mockResolvedValue({ id: "ps_1", status: "pending" })
  buildConfiguredPaymentLinkUrl.mockReturnValue("https://pay.example.com/pay?session=ps_1")
})

describe("startTripCheckout", () => {
  it("creates a payment session and returns a checkout link for card intent", async () => {
    const startProviderPayment = vi.fn(async () => {})
    const deps = makeDeps({ startProviderPayment })

    const result = await startTripCheckout(deps, makeInput("card"))

    expect(result).toEqual({
      kind: "payment_session",
      paymentSessionId: "ps_1",
      checkoutUrl: "https://pay.example.com/pay?session=ps_1",
    })

    expect(createPaymentSession).toHaveBeenCalledTimes(1)
    const [, sessionInput] = createPaymentSession.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ]
    expect(sessionInput.targetType).toBe("other")
    expect(sessionInput.targetId).toBe("trip_abc")
    expect(sessionInput.amountCents).toBe(10000)
    expect(sessionInput.currency).toBe("EUR")
    expect(sessionInput.provider).toBeNull()
    expect(sessionInput.payerName).toBe("Diego Muller")
    expect(sessionInput.payerEmail).toBe("diego@example.com")

    expect(startProviderPayment).toHaveBeenCalledTimes(1)
    const providerArg = startProviderPayment.mock.calls[0][0] as { paymentSessionId: string }
    expect(providerArg.paymentSessionId).toBe("ps_1")

    expect(buildConfiguredPaymentLinkUrl).toHaveBeenCalledWith("ps_1", {
      paymentLinkUrlTemplate: "https://pay.example.com/pay?session={sessionId}",
      publicCheckoutBaseUrl: "https://pay.example.com",
    })
  })

  it("skips the payment provider for bank transfer and reports instructions kind", async () => {
    const startProviderPayment = vi.fn(async () => {})
    const deps = makeDeps({ startProviderPayment })

    const result = await startTripCheckout(deps, makeInput("bank_transfer"))

    expect(result.kind).toBe("bank_transfer_instructions")
    expect(startProviderPayment).not.toHaveBeenCalled()
    const [, sessionInput] = createPaymentSession.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ]
    expect(sessionInput.provider).toBeNull()
    expect(sessionInput.paymentMethod).toBe("bank_transfer")
  })

  it("swallows payment-provider failures (best-effort start)", async () => {
    const startProviderPayment = vi.fn(async () => {
      throw new Error("provider down")
    })
    const deps = makeDeps({ startProviderPayment })

    const result = await startTripCheckout(deps, makeInput("card"))

    expect(result.paymentSessionId).toBe("ps_1")
  })

  it("throws when the trip total is zero", async () => {
    const deps = makeDeps()
    const input = makeInput("card")
    ;(input.trip.components[0] as { componentTotalAmountCents: number }).componentTotalAmountCents =
      0

    await expect(startTripCheckout(deps, input)).rejects.toThrow("trip_checkout_total_required")
    expect(createPaymentSession).not.toHaveBeenCalled()
  })

  it("throws when billing name or email is missing", async () => {
    const deps = makeDeps()
    const input = makeInput("card")
    input.trip.envelope.travelerParty = { billing: { contact: {} } }

    await expect(startTripCheckout(deps, input)).rejects.toThrow("trip_checkout_billing_required")
  })
})

describe("trip billing helpers", () => {
  it("readTripBilling extracts billing details from the traveler party", () => {
    const billing = readTripBilling(travelerParty)
    expect(billing.personId).toBe("person_billing")
    expect(billing.contact?.email).toBe("diego@example.com")
    expect(billing.contact?.phone).toBe("+40700000000")
  })

  it("formatTripBillingName joins first + last name, null when empty", () => {
    expect(formatTripBillingName(readTripBilling(travelerParty))).toBe("Diego Muller")
    expect(formatTripBillingName({ contact: {} })).toBeNull()
  })

  it("splitTripBillingName splits with sensible fallbacks", () => {
    expect(splitTripBillingName("Diego Muller")).toEqual({
      firstName: "Diego",
      lastName: "Muller",
    })
    expect(splitTripBillingName("Madonna")).toEqual({
      firstName: "Madonna",
      lastName: "Customer",
    })
    expect(splitTripBillingName("")).toEqual({ firstName: "Trip", lastName: "Customer" })
  })

  it("synthesizeTripBilling produces a complete provider payload", () => {
    const synthesized = synthesizeTripBilling(readTripBilling(travelerParty))
    expect(synthesized.firstName).toBe("Diego")
    expect(synthesized.lastName).toBe("Muller")
    expect(synthesized.email).toBe("diego@example.com")
    expect(synthesized.phone).toBe("+40700000000")
    expect(synthesized.country).toBe(642)
  })
})
