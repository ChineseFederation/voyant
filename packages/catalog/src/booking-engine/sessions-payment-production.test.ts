import { beforeEach, describe, expect, it, vi } from "vitest"

import { createProductionBookingSessionPaymentPorts } from "./sessions-payment-production.js"

const startPaymentAdapterCardPayment = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => null))

/**
 * What the port re-reads after the adapter has been asked. `null` is the
 * pre-existing default — the port then keeps the session it created, which is
 * the "no handoff yet" path.
 */
const getPaymentSessionById = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => null as unknown),
)

vi.mock("@voyant-travel/finance", () => ({
  computePaymentSchedule: () => [
    { amountCents: 10_000, currency: "EUR", scheduleType: "deposit", dueDate: "2026-08-05" },
  ],
  createOrReuseBookingSessionPayment: async () => ({
    id: "pmts_1",
    status: "pending",
    amountCents: 10_000,
    currency: "EUR",
    redirectUrl: null,
    expiresAt: null,
  }),
  expirePendingBookingSessionPayments: vi.fn(),
  financeService: { getPaymentSessionById },
  findEstablishedBookingSessionPayment: async () => null,
  noDepositPolicy: { kind: "no_deposit" },
  resolveEffectivePaymentPolicy: () => ({ policy: { kind: "deposit" }, source: "operator" }),
  resolvePaymentCallbackUrl: () => undefined,
  startPaymentAdapterCardPayment,
  transferBookingSessionPaymentToBooking: vi.fn(),
}))

describe("production Booking Session staff payment policy", () => {
  it("does not create a customer checkout when staff supplied a collection schedule", async () => {
    const loadProductPaymentPolicyContext = vi.fn()
    const payments = createProductionBookingSessionPaymentPorts({
      db: {} as never,
      inventory: { loadProductPaymentPolicyContext },
      distribution: { loadSupplierPaymentPolicy: vi.fn() },
      settings: { resolveOperatorDefaultPaymentPolicy: vi.fn() },
    })

    await expect(
      payments.prepare({
        session: {
          target: { kind: "product", productId: "prod_1" },
          statePayload: {
            staffBooking: {
              paymentSchedules: [
                {
                  scheduleType: "balance",
                  status: "pending",
                  dueDate: "2026-09-01",
                  currency: "EUR",
                  amountCents: 10_000,
                },
              ],
            },
          },
        },
        access: {
          actorKind: "staff",
          principalId: "usr_staff",
          staffAuthority: { admitted: true, reason: "manual_booking" },
          staffBookingAuthority: {
            admitted: true,
            reason: "bookings_and_finance_write",
          },
        },
      } as never),
    ).resolves.toEqual({ kind: "not_required" })
    expect(loadProductPaymentPolicyContext).not.toHaveBeenCalled()
  })
})

describe("production Booking Session bank-transfer intent", () => {
  it("does not start card collection and delegates durable offline establishment", async () => {
    const loadProductPaymentPolicyContext = vi.fn()
    const establishBankTransfer = vi.fn(async () => ({
      paymentSessionId: "pays_bank",
      document: { id: "invc_proforma", number: "PRO-42", type: "proforma" as const },
      instructions: {
        beneficiary: "Voyant Travel",
        iban: "RO49AAAA1B31007593840000",
        bankName: "Voyant Bank",
        reference: "BOOK-42",
        amountCents: 10_000,
        currency: "EUR",
        dueAt: "2026-08-08T12:00:00.000Z",
      },
    }))
    const payments = createProductionBookingSessionPaymentPorts({
      db: {} as never,
      inventory: { loadProductPaymentPolicyContext },
      distribution: { loadSupplierPaymentPolicy: vi.fn() },
      settings: { resolveOperatorDefaultPaymentPolicy: vi.fn() },
      establishBankTransfer,
    })

    await expect(
      payments.prepare({
        session: { target: { kind: "product", productId: "prod_1" }, statePayload: {} },
        commit: { checkoutIntent: "bank_transfer" },
        access: { actorKind: "anonymous" },
      } as never),
    ).resolves.toEqual({ kind: "not_required" })
    await expect(
      payments.establishBankTransfer?.({ bookingId: "book_42" } as never),
    ).resolves.toMatchObject({ document: { id: "invc_proforma" } })
    expect(loadProductPaymentPolicyContext).not.toHaveBeenCalled()
    expect(startPaymentAdapterCardPayment).not.toHaveBeenCalled()
    expect(establishBankTransfer).toHaveBeenCalledWith({ bookingId: "book_42" })
  })
})

/**
 * A hosted-checkout provider renders the initiation payload to the shopper, so
 * what is in it has to mean something to them. Nothing downstream can repair a
 * line item that names a Session, a page rendered in a guessed language, or a
 * customer that can only be keyed on their email address.
 */
describe("production Booking Session hosted-checkout initiation", () => {
  beforeEach(() => {
    startPaymentAdapterCardPayment.mockClear()
  })

  it("names the product and its departure in the Session locale", async () => {
    await prepare({ locale: "en-GB", departureDate: "2026-09-12" })

    expect(startArgs().description).toBe("Danube Delta tour — 12 September 2026")
  })

  it("renders the departure in the Session's own locale", async () => {
    await prepare({ locale: "ro-RO", departureDate: "2026-09-12", name: "Tur în Delta Dunării" })

    expect(startArgs().description).toBe("Tur în Delta Dunării — 12 septembrie 2026")
  })

  it("names the product alone when the target has no departure", async () => {
    await prepare({ locale: "en-GB", departureDate: null })

    expect(startArgs().description).toBe("Danube Delta tour")
  })

  it("never sends the Session id as the line item", async () => {
    await prepare({ locale: "en-GB", departureDate: "2026-09-12" })

    expect(startArgs().description).not.toContain("bses_")
  })

  it("carries the Session locale so the provider does not guess from the browser", async () => {
    await prepare({ locale: "ro-RO", departureDate: null })

    expect(startArgs().locale).toBe("ro-RO")
  })

  it("references the CRM person the buyer was identified as", async () => {
    await prepare({ locale: "en-GB", departureDate: null, personId: "per_01k" })

    expect(startArgs().customerReference).toBe("per_01k")
  })

  it("falls back to the owning principal for a customer-actor Session", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: null,
      actorKind: "customer",
      ownerPrincipalId: "usr_shopper",
    })

    expect(startArgs().customerReference).toBe("usr_shopper")
  })

  it("does not reference the agent's principal on a staff-created Session", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: null,
      actorKind: "staff",
      ownerPrincipalId: "usr_agent",
    })

    expect(startArgs().customerReference).toBeUndefined()
  })
})

/**
 * The storefront is the only party that knows whether it can mount a payment
 * form, and the Booking Session is the only path between it and the adapter.
 * The commit therefore carries the preference and interprets none of it —
 * negotiation is the adapter's, via `negotiatePaymentCheckoutHandoff`
 * (voyant#4346).
 */
describe("production Booking Session checkout handoff preference", () => {
  beforeEach(() => {
    startPaymentAdapterCardPayment.mockClear()
    getPaymentSessionById.mockClear()
    getPaymentSessionById.mockResolvedValue(null)
  })

  it("forwards the storefront's stated preference to the adapter unmodified", async () => {
    const acceptedCheckoutHandoffs = ["embedded", "redirect"] as const

    await prepare({ locale: "en-GB", departureDate: null, acceptedCheckoutHandoffs })

    // Same value, same order: a re-sorted or de-duplicated copy here would be
    // a second opinion about what the page can render.
    expect(startArgs().acceptedCheckoutHandoffs).toBe(acceptedCheckoutHandoffs)
  })

  it("says nothing to the adapter when the storefront said nothing", async () => {
    await prepare({ locale: "en-GB", departureDate: null })

    // Absent, not `["redirect"]`. The default lives in
    // `acceptedPaymentCheckoutHandoffs`, and stamping it here would put a
    // second copy of it on the path.
    expect(startArgs().acceptedCheckoutHandoffs).toBeUndefined()
    expect("acceptedCheckoutHandoffs" in startArgs()).toBe(true)
  })

  it("forwards a redirect-only preference as stated", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: null,
      acceptedCheckoutHandoffs: ["redirect"],
    })

    expect(startArgs().acceptedCheckoutHandoffs).toEqual(["redirect"])
  })

  it("carries the negotiated handoff back out, not just its redirect projection", async () => {
    const outcome = await prepare({
      locale: "en-GB",
      departureDate: null,
      acceptedCheckoutHandoffs: ["embedded", "redirect"],
      refreshedCheckout: {
        kind: "embedded",
        clientSecret: "cs_test_secret",
        publishableKey: "pk_test_key",
      },
      refreshedRedirectUrl: null,
    })

    // Asking for the arm is worth nothing if the answer dies here: the client
    // secret has no other way out to the storefront, because `redirectUrl` is
    // null for exactly this arm.
    expect(outcome).toMatchObject({
      kind: "required",
      paymentSession: {
        redirectUrl: null,
        checkout: {
          kind: "embedded",
          clientSecret: "cs_test_secret",
          publishableKey: "pk_test_key",
        },
      },
    })
  })

  it("reports no handoff as null rather than dropping the field", async () => {
    const outcome = await prepare({ locale: "en-GB", departureDate: null })

    expect(outcome).toMatchObject({ kind: "required", paymentSession: { checkout: null } })
  })
})

describe("production Booking Session settlement", () => {
  beforeEach(() => {
    startPaymentAdapterCardPayment.mockClear()
    getPaymentSessionById.mockClear()
  })

  it("uses the exact paid Session named by the completion event", async () => {
    getPaymentSessionById.mockResolvedValue({
      id: "pmts_paid",
      targetType: "booking_session",
      targetId: "bses_01k",
      status: "paid",
      amountCents: 10_000,
      currency: "EUR",
    })

    await expect(
      prepare({
        locale: "en-GB",
        departureDate: null,
        settlementPaymentSessionId: "pmts_paid",
      }),
    ).resolves.toEqual({ kind: "established", paymentSessionId: "pmts_paid" })
    expect(getPaymentSessionById).toHaveBeenCalledWith({}, "pmts_paid")
    expect(startPaymentAdapterCardPayment).not.toHaveBeenCalled()
  })

  it("rejects a completion event whose payment does not belong to the Session", async () => {
    getPaymentSessionById.mockResolvedValue({
      id: "pmts_paid",
      targetType: "booking_session",
      targetId: "bses_other",
      status: "paid",
      amountCents: 10_000,
      currency: "EUR",
    })

    await expect(
      prepare({
        locale: "en-GB",
        departureDate: null,
        settlementPaymentSessionId: "pmts_paid",
      }),
    ).rejects.toThrow("booking_session_settlement_payment_not_established")
  })
})

async function prepare(input: {
  locale: string
  departureDate: string | null
  name?: string
  personId?: string
  actorKind?: string
  ownerPrincipalId?: string
  acceptedCheckoutHandoffs?: readonly ("redirect" | "embedded")[]
  refreshedCheckout?: Record<string, unknown>
  refreshedRedirectUrl?: string | null
  settlementPaymentSessionId?: string
}) {
  if (input.refreshedCheckout !== undefined) {
    // What the adapter persisted, read back by the port exactly as production
    // reads it — through `financeService.getPaymentSessionById`, not by
    // handing the port a pre-built projection.
    getPaymentSessionById.mockResolvedValue({
      id: "pmts_1",
      status: "pending",
      amountCents: 10_000,
      currency: "EUR",
      redirectUrl: input.refreshedRedirectUrl ?? null,
      checkout: input.refreshedCheckout,
      expiresAt: null,
    })
  }
  const payments = createProductionBookingSessionPaymentPorts({
    db: {} as never,
    inventory: {
      loadProductPaymentPolicyContext: async () => ({
        listingPolicy: null,
        categoryPolicy: null,
        supplierId: null,
        departureDate: input.departureDate,
        name: input.name ?? "Danube Delta tour",
      }),
    },
    distribution: { loadSupplierPaymentPolicy: async () => null },
    settings: { resolveOperatorDefaultPaymentPolicy: async () => null },
    resolvePaymentAdapter: () => ({ id: "test" }) as never,
  })

  return payments.prepare({
    session: {
      id: "bses_01k",
      actorKind: input.actorKind ?? "anonymous",
      ownerPrincipalId: input.ownerPrincipalId,
      scope: { locale: input.locale, market: "default" },
      target: { kind: "product", productId: "prod_1" },
      expiresAt: new Date("2026-08-06T00:00:00Z"),
      statePayload: {
        billing: {
          contact: {
            firstName: "Ana",
            lastName: "Pop",
            email: "ana@example.com",
            ...(input.personId ? { personId: input.personId } : {}),
          },
        },
      },
    },
    quote: {
      id: "bqot_01k",
      pricing: { total: 10_000, currency: "EUR" },
      expiresAt: new Date("2026-08-06T00:00:00Z"),
    },
    commit: {
      idempotencyKey: "commit-1",
      ...(input.acceptedCheckoutHandoffs
        ? { payment: { acceptedCheckoutHandoffs: input.acceptedCheckoutHandoffs } }
        : {}),
    },
    access: {
      actorKind: input.actorKind ?? "anonymous",
      ...(input.settlementPaymentSessionId
        ? {
            settlementAuthority: {
              admitted: true,
              reason: "paid booking session settlement",
              paymentSessionId: input.settlementPaymentSessionId,
            },
          }
        : {}),
    },
    now: new Date("2026-08-05T00:00:00Z"),
  } as never)
}

function startArgs() {
  const call = startPaymentAdapterCardPayment.mock.calls.at(-1)
  if (!call) throw new Error("the card-payment starter was never called")
  return call[1] as {
    description?: string
    locale?: string
    customerReference?: string
    acceptedCheckoutHandoffs?: readonly ("redirect" | "embedded")[]
  }
}
