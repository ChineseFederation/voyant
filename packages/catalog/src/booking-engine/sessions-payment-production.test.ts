import { ANONYMOUS_STOREFRONT_USER_ID } from "@voyant-travel/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createProductionBookingSessionPaymentPorts } from "./sessions-payment-production.js"

/** Every departure resolution the port asked for, in order. Reset per `prepare`. */
const resolveCalls: Array<{ productId: string; departureSlotId?: string | null }> = []

const startPaymentAdapterCardPayment = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => null))

/**
 * What the port re-reads after the adapter has been asked. `null` is the
 * pre-existing default — the port then keeps the session it created, which is
 * the "no handoff yet" path.
 */
const getPaymentSessionById = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => null as unknown),
)

/**
 * Spied rather than stubbed so the *input* the policy is measured from can be
 * asserted. What comes back is fixed — the amount a real cascade would return
 * is finance's own tested behaviour; what this file owns is which date reaches
 * it (voyant#4740).
 */
const computePaymentSchedule = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => [
    { amountCents: 10_000, currency: "EUR", scheduleType: "deposit", dueDate: "2026-08-05" },
  ]),
)

/** Which cascade layer answered. Spied so a plan can be asserted to report it. */
const resolveEffectivePaymentPolicy = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => ({
    policy: { kind: "deposit" },
    source: "operator_default" as string,
  })),
)

/**
 * Echoes the amount it was asked for rather than a constant, so what the port
 * decided to collect is observable. A fixed stub would make every assertion
 * about the charged amount an assertion about the stub.
 */
const createOrReuseBookingSessionPayment = vi.hoisted(() =>
  vi.fn(async (_db: unknown, input: { amountCents: number; currency: string }) => ({
    id: "pmts_1",
    status: "pending",
    amountCents: input.amountCents,
    currency: input.currency,
    redirectUrl: null,
    expiresAt: null,
  })),
)

vi.mock("@voyant-travel/finance", () => ({
  computePaymentSchedule,
  createOrReuseBookingSessionPayment,
  expirePendingBookingSessionPayments: vi.fn(),
  financeService: { getPaymentSessionById },
  findEstablishedBookingSessionPayment: async () => null,
  noDepositPolicy: { kind: "no_deposit" },
  resolveEffectivePaymentPolicy,
  resolvePaymentCallbackUrl: () => undefined,
  startPaymentAdapterCardPayment,
  transferBookingSessionPaymentToBooking: vi.fn(),
}))

describe("production Booking Session staff payment policy", () => {
  it("does not create a customer checkout when staff supplied a collection schedule", async () => {
    const loadProductPaymentPolicyContext = vi.fn()
    const resolveSelectedDepartureDate = vi.fn()
    const payments = createProductionBookingSessionPaymentPorts({
      db: {} as never,
      inventory: { loadProductPaymentPolicyContext, resolveSelectedDepartureDate },
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
    expect(resolveSelectedDepartureDate).not.toHaveBeenCalled()
  })
})

describe("production Booking Session bank-transfer intent", () => {
  it("does not start card collection and delegates durable offline establishment", async () => {
    const loadProductPaymentPolicyContext = vi.fn()
    const resolveSelectedDepartureDate = vi.fn()
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
      inventory: { loadProductPaymentPolicyContext, resolveSelectedDepartureDate },
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
    expect(resolveSelectedDepartureDate).not.toHaveBeenCalled()
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

  it("stores nothing when no mandate is configured", async () => {
    await prepare({ locale: "en-GB", departureDate: null, personId: "per_01k" })

    expect(startArgs().storeInstrument).toBeUndefined()
  })

  // Terms that carry the mandate authorize nothing until somebody accepts them.
  it("stores nothing when the shopper accepted no terms", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: null,
      personId: "per_01k",
      mandate: { enabled: true, revision: "v3" },
    })

    expect(startArgs().storeInstrument).toBeUndefined()
  })

  // And an acceptance authorizes nothing if the terms accepted never said it.
  it("stores nothing when the operator's terms carry no mandate", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: null,
      personId: "per_01k",
      mandate: { enabled: false, revision: "v3" },
      contractAcceptedAt: "2026-08-12T09:00:00.000Z",
    })

    expect(startArgs().storeInstrument).toBeUndefined()
  })

  // Storage binds to a customer record, so there has to be one to bind to.
  it("stores nothing for a shopper it cannot identify", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: null,
      mandate: { enabled: true, revision: "v3" },
      contractAcceptedAt: "2026-08-12T09:00:00.000Z",
    })

    expect(startArgs().storeInstrument).toBeUndefined()
  })

  it("names the terms revision and the acceptance it rests on", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: null,
      personId: "per_01k",
      mandate: { enabled: true, revision: "v3" },
      contractAcceptedAt: "2026-08-12T09:00:00.000Z",
    })

    expect(startArgs().storeInstrument).toEqual({
      merchantInitiated: true,
      agreementReference: "booking-terms:v3:bses_01k:2026-08-12T09:00:00.000Z",
    })
  })

  // Permission to show the card back to the shopper is a separate consent that
  // only the payment surface can collect, so the runtime never grants it here.
  it("never grants reselection from the terms alone", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: null,
      personId: "per_01k",
      mandate: { enabled: true, revision: "v3" },
      contractAcceptedAt: "2026-08-12T09:00:00.000Z",
    })

    expect(startArgs().storeInstrument).not.toHaveProperty("offerShopperReselect")
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

  it("does not reference the anonymous placeholder a guest Session owns", async () => {
    // voyant#4637. A guest Session is `actorKind: "customer"` whose principal
    // is the placeholder auth mints for every guest on every deployment. A
    // customer reference is a *stable customer key*: the processor mints a
    // Customer under it on first use and matches every later checkout to that
    // same record, so handing over a shared value pooled unrelated shoppers'
    // payment history into one Customer and left the first shopper's billing
    // email on all of them. Absent is the answer — an anonymous shopper pays
    // as a guest.
    await prepare({
      locale: "en-GB",
      departureDate: null,
      actorKind: "customer",
      ownerPrincipalId: ANONYMOUS_STOREFRONT_USER_ID,
    })

    expect(startArgs().customerReference).toBeUndefined()
  })

  it("stores no instrument for a guest, who has no customer record to hold one", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: null,
      actorKind: "customer",
      ownerPrincipalId: ANONYMOUS_STOREFRONT_USER_ID,
      mandate: { enabled: true, revision: "v3" },
      contractAcceptedAt: "2026-08-12T09:00:00.000Z",
    })

    expect(startArgs().storeInstrument).toBeUndefined()
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

  it("starts checkout when optional contact details are absent", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: null,
      omitContact: true,
    })

    expect(startPaymentAdapterCardPayment).toHaveBeenCalledOnce()
    expect(startArgs().billing).toEqual({})
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

/**
 * A customer payment policy gates on the distance to departure — "deposit now
 * if the trip is far enough out, otherwise collect in full". The distance is
 * only meaningful measured from the departure the shopper is buying, and
 * voyant#4740 measured it from `products.startDate`: for a slot-based product
 * that is the listing's own window, so a seeded "today" collapsed the gate to
 * full payment on a departure five weeks away, and a listing dated months out
 * offered a 50% deposit on a trip leaving tomorrow.
 *
 * `generatePaymentScheduleForBooking` has always read the Booking's own
 * `startDate` — the selected departure — so this is also what stops checkout
 * and the post-confirmation schedule computing two plans from one policy.
 */
describe("production Booking Session payment policy departure", () => {
  beforeEach(() => {
    computePaymentSchedule.mockClear()
    startPaymentAdapterCardPayment.mockClear()
  })

  it("measures the policy from the selected slot, not the product row", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: "2026-08-16",
      selection: { departureSlotId: "avsl_01k" },
      slotDates: { avsl_01k: "2026-09-20" },
    })

    expect(scheduleInput().departureDate).toBe("2026-09-20")
  })

  it("falls back to the product row when the selection names no departure", async () => {
    await prepare({ locale: "en-GB", departureDate: "2026-08-16" })

    expect(scheduleInput().departureDate).toBe("2026-08-16")
  })

  it("asks about the product the Session targets", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: null,
      selection: { departureSlotId: "avsl_01k" },
    })

    expect(resolveArgs()).toEqual({ productId: "prod_1", departureSlotId: "avsl_01k" })
  })

  /**
   * `configure.departureDate` sits next to the slot id on the same selection
   * step and quoting does price against it, so consulting it here looks
   * obviously right. It is not: `deriveSelfServiceCommand` carries only
   * `slotId`, so an inline date never reaches `bookings.startDate`, and
   * `generatePaymentScheduleForBooking` would go on reading the product row.
   * Measuring checkout from a date the Booking will not record is the same
   * two-plans-from-one-policy divergence this issue is about, arrived at from
   * the other side. Honouring it means persisting it on the Booking first.
   */
  it("does not measure from a departure date the Booking will never record", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: "2026-08-16",
      selection: { departureDate: "2026-09-20" },
    })

    expect(resolveArgs()).toEqual({ productId: "prod_1", departureSlotId: null })
    expect(scheduleInput().departureDate).toBe("2026-08-16")
  })

  // The line item is the only product-shaped thing a hosted provider renders,
  // so a shopper reading it must see the departure they are paying for — the
  // same one the amount was computed from, not a second answer.
  it("names the selected departure on the checkout line item", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: "2026-08-16",
      selection: { departureSlotId: "avsl_01k" },
      slotDates: { avsl_01k: "2026-09-20" },
    })

    expect(startArgs().description).toBe("Danube Delta tour — 20 September 2026")
  })
})

/**
 * The plan published on the Quote, which is the last surface before the shopper
 * accepts terms. Until voyant#4741 a deposit policy reached them only through
 * Commit's `payment_required` — after the review step and after they had
 * accepted a contract naming the full total — so they reviewed €378, agreed to
 * €378, and were charged €189.
 *
 * The plan is a projection: it must be the same derivation `prepare` charges
 * from, or quoting it just moves the disagreement earlier.
 */
describe("production Booking Session quoted payment plan", () => {
  const DEPOSIT_AND_BALANCE = [
    { amountCents: 18_900, currency: "EUR", scheduleType: "deposit", dueDate: "2026-08-16" },
    { amountCents: 18_900, currency: "EUR", scheduleType: "balance", dueDate: "2026-09-06" },
  ]

  beforeEach(() => {
    computePaymentSchedule.mockClear()
    resolveEffectivePaymentPolicy.mockClear()
  })

  it("states every instalment, not just what is due now", async () => {
    computePaymentSchedule.mockReturnValueOnce(DEPOSIT_AND_BALANCE)

    await expect(describePlan({ totalCents: 37_800 })).resolves.toEqual({
      policySource: "operator_default",
      currency: "EUR",
      totalCents: 37_800,
      dueNowCents: 18_900,
      entries: [
        { scheduleType: "deposit", amountCents: 18_900, currency: "EUR", dueDate: "2026-08-16" },
        { scheduleType: "balance", amountCents: 18_900, currency: "EUR", dueDate: "2026-09-06" },
      ],
    })
  })

  it("reports which layer of the cascade set the terms", async () => {
    computePaymentSchedule.mockReturnValueOnce(DEPOSIT_AND_BALANCE)
    resolveEffectivePaymentPolicy.mockReturnValueOnce({
      policy: { kind: "deposit" },
      source: "supplier",
    })

    await expect(describePlan({ totalCents: 37_800 })).resolves.toMatchObject({
      policySource: "supplier",
    })
  })

  // The whole point. `prepare` charges `entries[0]`; the Quote publishes the
  // same array from the same derivation, so the number the shopper agreed to
  // and the number the card is charged cannot come apart. €378 at 50%: the
  // shopper is quoted a €189 deposit and the card is asked for €189.
  it("promises exactly what Commit goes on to charge", async () => {
    computePaymentSchedule.mockReturnValueOnce(DEPOSIT_AND_BALANCE)
    const plan = await describePlan({ totalCents: 37_800 })

    computePaymentSchedule.mockReturnValueOnce(DEPOSIT_AND_BALANCE)
    const outcome = await prepare({ locale: "en-GB", departureDate: "2026-09-20" })

    expect(plan?.dueNowCents).toBe(18_900)
    expect(outcome).toMatchObject({
      kind: "required",
      paymentSession: { amountCents: plan?.dueNowCents },
    })
  })

  /**
   * The gate counts whole UTC days, so a Quote taken at 23:55 and committed at
   * 00:02 measures one day less to departure. On a departure sitting exactly
   * on `minDaysBeforeDepartureForDeposit` that flips the plan: the shopper is
   * shown a deposit and charged the full total. Payment policy is outside the
   * price fingerprint, so nothing rejects that Commit.
   *
   * Both sides therefore measure from the Quote's own instant, which is what
   * the published plan was derived from.
   */
  it("charges against the instant the Quote was stamped with, not Commit's clock", async () => {
    await prepare({
      locale: "en-GB",
      departureDate: "2026-09-20",
      quotedAt: new Date("2026-08-15T23:55:00Z"),
    })

    expect(computePaymentSchedule.mock.calls.at(-1)?.[0]).toMatchObject({
      today: new Date("2026-08-15T23:55:00Z"),
    })
  })

  // Same measurement as Commit, which voyant#4740 established has to be the
  // departure the shopper selected rather than the product row.
  it("measures from the departure the shopper selected", async () => {
    computePaymentSchedule.mockReturnValueOnce(DEPOSIT_AND_BALANCE)

    await describePlan({ totalCents: 37_800, slotDate: "2026-09-20" })

    expect(computePaymentSchedule.mock.calls.at(-1)?.[0]).toMatchObject({
      departureDate: "2026-09-20",
      totalCents: 37_800,
    })
  })

  // A Quote has nothing to protect: it states no plan and the storefront shows
  // no terms. `prepare` throws on the same condition because it is about to
  // take money against a product that is no longer there.
  it("states no plan for a product that has gone", async () => {
    await expect(describePlan({ totalCents: 37_800, context: null })).resolves.toBeNull()
  })

  it("states no plan for a target that is not a product", async () => {
    await expect(
      describePlan({ totalCents: 37_800, target: { kind: "trip_snapshot" } }),
    ).resolves.toBeNull()
  })
})

/** Build the production ports and ask them to describe a plan. */
async function describePlan(input: {
  totalCents: number
  slotDate?: string
  context?: unknown
  target?: { kind: string; productId?: string }
}) {
  const payments = createProductionBookingSessionPaymentPorts({
    db: {} as never,
    inventory: {
      loadProductPaymentPolicyContext: async () =>
        input.context === undefined
          ? {
              listingPolicy: null,
              categoryPolicy: null,
              supplierId: null,
              name: "Istanbul Bosphorus Heritage Day",
            }
          : (input.context as never),
      resolveSelectedDepartureDate: async () => input.slotDate ?? null,
    },
    distribution: { loadSupplierPaymentPolicy: async () => null },
    settings: { resolveOperatorDefaultPaymentPolicy: async () => null },
  })
  return payments.describePlan?.({
    session: {
      id: "bses_01k",
      target: input.target ?? { kind: "product", productId: "prod_1" },
      scope: { locale: "en-GB", market: "default" },
      statePayload: { configure: { departureSlotId: "avsl_01k" } },
    },
    pricing: { total: input.totalCents, currency: "EUR" },
    now: new Date("2026-08-16T00:00:00Z"),
  } as never)
}

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
  /** What the shopper selected, as it sits on the Session's `configure` step. */
  selection?: { departureSlotId?: string; departureDate?: string }
  /** Resolver answers keyed by slot id; anything else falls to the product row. */
  slotDates?: Record<string, string>
  name?: string
  personId?: string
  actorKind?: string
  ownerPrincipalId?: string
  omitContact?: boolean
  acceptedCheckoutHandoffs?: readonly ("redirect" | "embedded")[]
  refreshedCheckout?: Record<string, unknown>
  refreshedRedirectUrl?: string | null
  settlementPaymentSessionId?: string
  mandate?: { enabled: boolean; revision: string } | null
  contractAcceptedAt?: string
  /** The instant the Quote was stamped with; what the plan must measure from. */
  quotedAt?: Date
}) {
  resolveCalls.length = 0
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
        name: input.name ?? "Danube Delta tour",
      }),
      // Stands in for inventory's resolver with the same precedence it has:
      // the selected slot's date, then the product row. Nothing else.
      resolveSelectedDepartureDate: async (_db, resolve) => {
        resolveCalls.push(resolve)
        const slotDate = resolve.departureSlotId
          ? input.slotDates?.[resolve.departureSlotId]
          : undefined
        return slotDate ?? input.departureDate
      },
    },
    distribution: { loadSupplierPaymentPolicy: async () => null },
    settings: { resolveOperatorDefaultPaymentPolicy: async () => null },
    resolvePaymentAdapter: () => ({ id: "test" }) as never,
    ...(input.mandate === undefined
      ? {}
      : { resolveStoredInstrumentMandate: async () => input.mandate ?? null }),
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
        ...(input.selection ? { configure: input.selection } : {}),
        ...(input.contractAcceptedAt
          ? { contractAcceptance: { acceptedAt: input.contractAcceptedAt } }
          : {}),
        billing: {
          contact: input.omitContact
            ? {}
            : {
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
      quotedAt: input.quotedAt ?? new Date("2026-08-05T00:00:00Z"),
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

/** What the payment policy was measured against. */
function scheduleInput() {
  const call = computePaymentSchedule.mock.calls.at(-1)
  if (!call) throw new Error("the payment schedule was never computed")
  return call[0] as { departureDate: string | null; totalCents: number; today: Date }
}

/** What the port asked inventory to resolve the departure from. */
function resolveArgs() {
  const call = resolveCalls.at(-1)
  if (!call) throw new Error("the departure was never resolved")
  return call
}

function startArgs() {
  const call = startPaymentAdapterCardPayment.mock.calls.at(-1)
  if (!call) throw new Error("the card-payment starter was never called")
  return call[1] as {
    description?: string
    locale?: string
    customerReference?: string
    storeInstrument?: { merchantInitiated: boolean; agreementReference?: string }
    billing?: Record<string, unknown>
    acceptedCheckoutHandoffs?: readonly ("redirect" | "embedded")[]
  }
}
