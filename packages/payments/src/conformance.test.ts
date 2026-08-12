import { describe, expect, it } from "vitest"
import {
  type PaymentAdapterConformanceHarness,
  runPaymentAdapterConformance,
} from "./conformance.js"
import {
  acceptedPaymentCheckoutHandoffs,
  PAYMENT_ADAPTER_CONTRACT_VERSION,
  type PaymentAdapter,
  type PaymentAdapterErrorCode,
  type PaymentAdapterRuntimeContext,
  type PaymentCallbackRequest,
  type PaymentHostedCheckout,
  type PaymentInitiationInput,
  type PaymentInstrumentReuse,
  type PaymentOperationInput,
  type PaymentOperationResult,
  type PaymentStatusInput,
} from "./index.js"

type BrokenBehavior =
  | "accept-conflicting-key"
  | "accept-invalid-money"
  | "accept-over-limit"
  | "change-duplicate-callback"
  | "change-duplicate-operation"
  | "drop-operation-identity"
  | "drop-status-identity"
  | "embed-without-capability"
  | "embed-without-client-secret"
  | "ignore-accepted-handoffs"
  | "malformed-health"
  | "manual-capture-pays"
  | "never-embeds"
  | "remap-status-identity"
  | "store-beyond-intent"
  | "store-malformed-instrument"
  | "store-unrequested"
  | "untyped-conflict-error"
  | "verify-invalid-callback"
  | "verify-malformed-callback"
  | "verify-replayed-callback"

/** What the fake adapter declares (and can serve) beyond the mandatory contract. */
type FakeAdapterOptions = { embeddedCheckout?: boolean; storeInstrument?: boolean }

const context: PaymentAdapterRuntimeContext = {
  env: {},
  now: () => new Date("2026-07-24T12:00:00.000Z"),
}

describe("payment adapter conformance", () => {
  it("passes a conforming adapter across the complete public contract", async () => {
    const results = await runPaymentAdapterConformance(createHarness())

    expect(results).not.toEqual([])
    expect(results.filter((result) => !result.passed)).toEqual([])
    expect(results.map((result) => result.name)).toEqual(
      expect.arrayContaining([
        "initiates idempotently",
        "rejects initiation idempotency-key reuse with a different payload",
        "rejects invalid minor-unit money",
        "rejects invalid-signature callbacks",
        "rejects malformed callbacks",
        "rejects replayed callbacks",
        "preserves semantic duplicate callback identity",
        "honors declared authorize capability",
        "honors declared capture capability",
        "honors declared void capability",
        "honors declared refund capability",
        "honors declared status capability",
        "honors manual capture",
        "enforces partial capture bounds",
        "enforces partial refund bounds",
        "reports typed health diagnostics",
        "honors declared embedded checkout capability",
        "serves a caller that can only redirect",
      ]),
    )
  })

  it("passes an embedded-capable adapter across both checkout arms", async () => {
    const results = await runPaymentAdapterConformance(
      createHarness(undefined, { embeddedCheckout: true }),
    )

    expect(results.filter((result) => !result.passed)).toEqual([])
    expect(results.map((result) => result.name)).toEqual(
      expect.arrayContaining([
        "honors declared embedded checkout capability",
        "serves a caller that can only redirect",
      ]),
    )
  })

  it("fails when a declared embedded capability has no fixture", async () => {
    const harness = createHarness(undefined, { embeddedCheckout: true })
    harness.embeddedInitiation = undefined

    expect(await failedCaseNames(harness)).toContain("honors declared embedded checkout capability")
  })

  it("skips the embedded case when the capability is not declared", async () => {
    const harness = createHarness()
    harness.embeddedInitiation = undefined

    expect(await failedCaseNames(harness)).not.toContain(
      "honors declared embedded checkout capability",
    )
  })

  it("fails when the embedded fixture does not accept the embedded handoff", async () => {
    const harness = createHarness(undefined, { embeddedCheckout: true })
    harness.embeddedInitiation = {
      ...(harness.embeddedInitiation as NonNullable<typeof harness.embeddedInitiation>),
      acceptedCheckoutHandoffs: ["redirect"],
    }

    expect(await failedCaseNames(harness)).toContain("honors declared embedded checkout capability")
  })

  it.each([
    ["never-embeds", "honors declared embedded checkout capability"],
    ["embed-without-client-secret", "honors declared embedded checkout capability"],
    ["ignore-accepted-handoffs", "serves a caller that can only redirect"],
  ] satisfies ReadonlyArray<
    readonly [BrokenBehavior, string]
  >)("catches a %s embedded-capable adapter", async (behavior, failedCase) => {
    const harness = createHarness(behavior, { embeddedCheckout: true })

    expect(await failedCaseNames(harness)).toContain(failedCase)
  })

  it("catches an adapter that embeds without declaring the capability", async () => {
    const harness = createHarness("embed-without-capability")

    expect(harness.adapter.capabilities.embeddedCheckout).toBe(false)
    expect(await failedCaseNames(harness)).toContain("initiates idempotently")
  })

  it("passes a storage-capable adapter that reports exactly what it was granted", async () => {
    const results = await runPaymentAdapterConformance(
      createHarness(undefined, { storeInstrument: true }),
    )

    expect(results.filter((result) => !result.passed)).toEqual([])
    expect(results.map((result) => result.name)).toEqual(
      expect.arrayContaining([
        "honors declared instrument-storage capability",
        "stores nothing when the caller asked for no storage",
      ]),
    )
  })

  it("fails when a declared storage capability has no fixture", async () => {
    const harness = createHarness(undefined, { storeInstrument: true })
    harness.storeInstrumentInitiation = undefined

    expect(await failedCaseNames(harness)).toContain(
      "honors declared instrument-storage capability",
    )
  })

  it("fails when the storage fixture carries no intent", async () => {
    const harness = createHarness(undefined, { storeInstrument: true })
    harness.storeInstrumentInitiation = {
      paymentSessionId: "payment-stored",
      money: { amountMinor: 1_000, currency: "EUR" },
      idempotencyKey: "init-stored",
    }

    expect(await failedCaseNames(harness)).toContain(
      "honors declared instrument-storage capability",
    )
  })

  it("skips the storage case when the capability is not declared", async () => {
    expect(await failedCaseNames(createHarness())).not.toContain(
      "honors declared instrument-storage capability",
    )
  })

  it.each([
    ["store-beyond-intent", "honors declared instrument-storage capability"],
    ["store-malformed-instrument", "honors declared instrument-storage capability"],
  ] as ReadonlyArray<
    [BrokenBehavior, string]
  >)("catches a %s storage-capable adapter", async (behavior, failedCase) => {
    const harness = createHarness(behavior, { storeInstrument: true })

    expect(await failedCaseNames(harness)).toContain(failedCase)
  })

  // The universal probe: an adapter that keeps instruments nobody asked it to
  // keep must fail even when it never declared the capability at all.
  it("catches an adapter that stores without being asked", async () => {
    expect(await failedCaseNames(createHarness("store-unrequested"))).toContain(
      "stores nothing when the caller asked for no storage",
    )
    expect(
      await failedCaseNames(createHarness("store-unrequested", { storeInstrument: true })),
    ).toContain("stores nothing when the caller asked for no storage")
  })

  it("fails when a declared operation has no method", async () => {
    const harness = createHarness()
    harness.adapter.capture = undefined

    expect(await failedCaseNames(harness)).toContain("declares a valid adapter port")
  })

  it("fails when a declared operation has no fixture", async () => {
    const harness = createHarness()
    harness.authorize = undefined

    expect(await failedCaseNames(harness)).toContain("honors declared authorize capability")
  })

  it("skips an optional operation fixture only when the capability is not declared", async () => {
    const harness = createHarness()
    harness.adapter.capabilities.authorize = false
    harness.adapter.authorize = undefined
    harness.authorize = undefined

    expect(await failedCaseNames(harness)).not.toContain("honors declared authorize capability")
  })

  it.each([
    ["accept-invalid-money", "rejects invalid minor-unit money"],
    ["accept-conflicting-key", "rejects initiation idempotency-key reuse with a different payload"],
    ["verify-invalid-callback", "rejects invalid-signature callbacks"],
    ["verify-malformed-callback", "rejects malformed callbacks"],
    ["verify-replayed-callback", "rejects replayed callbacks"],
    ["change-duplicate-callback", "preserves semantic duplicate callback identity"],
    ["change-duplicate-operation", "honors declared capture capability"],
    ["drop-operation-identity", "honors declared capture capability"],
    ["drop-status-identity", "honors declared status capability"],
    ["remap-status-identity", "honors declared status capability"],
    ["manual-capture-pays", "honors manual capture"],
    ["accept-over-limit", "enforces partial capture bounds"],
    ["malformed-health", "reports typed health diagnostics"],
    ["untyped-conflict-error", "rejects initiation idempotency-key reuse with a different payload"],
  ] satisfies ReadonlyArray<
    readonly [BrokenBehavior, string]
  >)("catches a %s adapter", async (behavior, failedCase) => {
    expect(await failedCaseNames(createHarness(behavior))).toContain(failedCase)
  })

  it("fails when a required callback fixture is missing", async () => {
    const harness = createHarness()
    harness.invalidSignatureCallback = undefined

    expect(await failedCaseNames(harness)).toContain("rejects invalid-signature callbacks")
  })
})

async function failedCaseNames(harness: PaymentAdapterConformanceHarness) {
  return (await runPaymentAdapterConformance(harness))
    .filter((result) => !result.passed)
    .map((result) => result.name)
}

function createHarness(
  behavior?: BrokenBehavior,
  options: FakeAdapterOptions = {},
): PaymentAdapterConformanceHarness {
  const identity = { providerId: "fake-pay", connectionId: "connection-1" }
  return {
    adapter: createFakeAdapter(behavior, options),
    context,
    embeddedInitiation: options.embeddedCheckout
      ? {
          paymentSessionId: "payment-embedded",
          money: { amountMinor: 1_000, currency: "EUR" },
          captureMode: "automatic",
          acceptedCheckoutHandoffs: ["embedded", "redirect"],
          idempotencyKey: "init-embedded",
        }
      : undefined,
    storeInstrumentInitiation: options.storeInstrument
      ? {
          paymentSessionId: "payment-stored",
          money: { amountMinor: 1_000, currency: "EUR" },
          captureMode: "automatic",
          idempotencyKey: "init-stored",
          storeInstrument: { merchantInitiated: true, agreementReference: "terms-v3" },
        }
      : undefined,
    initiation: {
      paymentSessionId: "payment-1",
      money: { amountMinor: 1_000, currency: "EUR" },
      description: "Conformance payment",
      captureMode: "automatic",
      idempotencyKey: "init-1",
    },
    signedCallback: callback("signed", '{"event":"paid"}'),
    duplicateCallback: callback("signed", '{"event":"paid","delivery":2}'),
    unsignedCallback: callback(undefined, '{"event":"paid"}'),
    invalidSignatureCallback: callback("invalid", '{"event":"paid"}'),
    malformedCallback: callback("signed", "{"),
    replayCallback: callback("replay", '{"event":"old"}'),
    manualCaptureInitiation: {
      paymentSessionId: "payment-manual",
      money: { amountMinor: 1_000, currency: "EUR" },
      captureMode: "manual",
      idempotencyKey: "init-manual",
    },
    authorize: operation("authorize-1", 1_000),
    capture: {
      input: operation("capture-1", 400),
      amountLimit: { amountMinor: 1_000, currency: "EUR" },
    },
    void: operation("void-1"),
    refund: {
      input: operation("refund-1", 250),
      amountLimit: { amountMinor: 1_000, currency: "EUR" },
    },
    status: {
      paymentSessionId: "payment-1",
      processorSessionId: "processor-session-1",
      processorPaymentId: "processor-payment-1",
      processorIdentity: identity,
    },
  }
}

function callback(signature: string | undefined, rawBody: string): PaymentCallbackRequest {
  return {
    headers: signature ? { "x-signature": signature } : {},
    rawBody,
    receivedAt: "2026-07-24T12:00:00.000Z",
  }
}

function operation(idempotencyKey: string, amountMinor?: number): PaymentOperationInput {
  return {
    paymentSessionId: "payment-1",
    processorSessionId: "processor-session-1",
    processorPaymentId: "processor-payment-1",
    processorIdentity: { providerId: "fake-pay", connectionId: "connection-1" },
    money: amountMinor === undefined ? undefined : { amountMinor, currency: "EUR" },
    idempotencyKey,
  }
}

function createFakeAdapter(
  behavior?: BrokenBehavior,
  options: FakeAdapterOptions = {},
): PaymentAdapter {
  const embeddedCheckout = options.embeddedCheckout === true
  const storeInstrument = options.storeInstrument === true
  const initiationKeys = new Map<string, { payload: string; result: unknown }>()
  const operationKeys = new Map<string, { payload: string; result: PaymentOperationResult }>()
  let operationSequence = 0

  const fail = (code: PaymentAdapterErrorCode, message: string): never => {
    if (behavior === "untyped-conflict-error" && code === "IDEMPOTENCY_KEY_REUSED") {
      throw new Error(message)
    }
    throw Object.assign(new Error(message), { code, retryable: false })
  }

  const validateMoney = (money: { amountMinor: number; currency: string }) => {
    if (behavior === "accept-invalid-money") return
    if (
      !Number.isSafeInteger(money.amountMinor) ||
      money.amountMinor <= 0 ||
      !/^[A-Z]{3}$/.test(money.currency)
    ) {
      fail("INVALID_REQUEST", "Invalid money")
    }
  }

  const redirectCheckout: PaymentHostedCheckout = {
    kind: "redirect",
    url: "https://payments.example/checkout",
  }

  const chooseCheckout = (
    acceptedCheckoutHandoffs: PaymentInitiationInput["acceptedCheckoutHandoffs"],
  ): PaymentHostedCheckout => {
    const forced =
      behavior === "ignore-accepted-handoffs" || behavior === "embed-without-capability"
    const wantsEmbedded =
      forced || acceptedPaymentCheckoutHandoffs({ acceptedCheckoutHandoffs })[0] === "embedded"
    const canEmbed =
      (embeddedCheckout || behavior === "embed-without-capability") && behavior !== "never-embeds"
    if (!wantsEmbedded || !canEmbed) return redirectCheckout
    return {
      kind: "embedded",
      clientSecret: behavior === "embed-without-client-secret" ? "" : "session-secret-1",
      publishableKey: "pk-test-fake-pay",
      providerAccountId: "acct-1",
    }
  }

  /**
   * What a conforming adapter reports back: exactly the reuses the caller
   * granted, and nothing at all when the caller granted none. Each broken
   * behavior breaks one of those two rules.
   */
  const storedInstrumentFor = (input: PaymentInitiationInput) => {
    const intent = input.storeInstrument
    if (behavior === "store-unrequested") {
      return { storedInstrument: { token: "pm-uninvited", authorizedReuses: [] as const } }
    }
    if (!intent || !storeInstrument) return {}
    if (behavior === "store-malformed-instrument") {
      return { storedInstrument: { token: "pm-1", authorizedReuses: [], last4: "12" } }
    }
    const authorizedReuses: PaymentInstrumentReuse[] =
      behavior === "store-beyond-intent"
        ? ["merchant_initiated", "shopper_reselect"]
        : [
            ...(intent.merchantInitiated ? (["merchant_initiated"] as const) : []),
            ...(intent.offerShopperReselect ? (["shopper_reselect"] as const) : []),
          ]
    return {
      storedInstrument: {
        token: "pm-1",
        authorizedReuses,
        status: "usable" as const,
        brand: "visa",
        last4: "4242",
        expMonth: 5,
        expYear: 2031,
      },
    }
  }

  const runOperation = (
    name: "authorize" | "capture" | "void" | "refund",
    input: PaymentOperationInput,
  ): PaymentOperationResult => {
    if (input.money) validateMoney(input.money)
    if (
      (name === "capture" || name === "refund") &&
      input.money &&
      (input.money.amountMinor > 1_000 || input.money.currency !== "EUR") &&
      behavior !== "accept-over-limit"
    ) {
      fail("INVALID_REQUEST", `${name} exceeds the available amount`)
    }

    const payload = stableJson({ ...input, idempotencyKey: undefined })
    const key = `${name}:${input.idempotencyKey}`
    const existing = operationKeys.get(key)
    if (existing) {
      if (existing.payload !== payload && behavior !== "accept-conflicting-key") {
        fail("IDEMPOTENCY_KEY_REUSED", "Idempotency key was reused")
      }
      if (behavior !== "change-duplicate-operation" || name !== "capture") {
        return existing.result
      }
    }

    operationSequence += 1
    const nextState = {
      authorize: "authorized",
      capture: "paid",
      void: "cancelled",
      refund: "paid",
    } as const
    const result: PaymentOperationResult = {
      status: "accepted",
      nextState: nextState[name],
      processorIdentity:
        behavior === "drop-operation-identity" && name === "capture"
          ? undefined
          : input.processorIdentity,
      processorReference: `${name}-reference-${operationSequence}`,
    }
    operationKeys.set(key, { payload, result })
    return result
  }

  return {
    id: "fake-pay",
    label: "Fake Pay",
    contractVersion: PAYMENT_ADAPTER_CONTRACT_VERSION,
    mode: "test",
    capabilities: {
      hostedCheckout: true,
      redirectCheckout: true,
      embeddedCheckout,
      authorize: true,
      capture: true,
      void: true,
      refund: true,
      status: true,
      callbackSignatureVerification: true,
      idempotencyKeys: true,
      retrySafeInitiation: true,
      storeInstrument,
    },
    async initiate(_context, input) {
      validateMoney(input.money)
      const payload = stableJson({ ...input, idempotencyKey: undefined })
      const existing = initiationKeys.get(input.idempotencyKey)
      if (existing) {
        if (existing.payload !== payload && behavior !== "accept-conflicting-key") {
          fail("IDEMPOTENCY_KEY_REUSED", "Idempotency key was reused")
        }
        return existing.result as Awaited<ReturnType<PaymentAdapter["initiate"]>>
      }
      const result = {
        processorSessionId: "processor-session-1",
        processorPaymentId: "processor-payment-1",
        processorIdentity: { providerId: "fake-pay", connectionId: "connection-1" },
        checkout: chooseCheckout(input.acceptedCheckoutHandoffs),
        nextState:
          input.captureMode === "manual" && behavior !== "manual-capture-pays"
            ? ("authorized" as const)
            : ("paid" as const),
        ...storedInstrumentFor(input),
        idempotencyKey: input.idempotencyKey,
      }
      initiationKeys.set(input.idempotencyKey, { payload, result })
      return result
    },
    async verifyCallback(_context, request) {
      const signature = request.headers["x-signature"]
      if (!signature) return { verified: false, reason: "missing_signature" }
      if (signature === "invalid" && behavior !== "verify-invalid-callback") {
        return { verified: false, reason: "invalid_signature" }
      }
      if (request.rawBody === "{" && behavior !== "verify-malformed-callback") {
        return { verified: false, reason: "malformed" }
      }
      if (signature === "replay" && behavior !== "verify-replayed-callback") {
        return { verified: false, reason: "replay" }
      }
      return {
        verified: true,
        event: {
          eventId:
            behavior === "change-duplicate-callback" && String(request.rawBody).includes("delivery")
              ? "event-2"
              : "event-1",
          paymentSessionId: "payment-1",
          nextState: "paid",
          occurredAt: "2026-07-24T11:59:00.000Z",
          processorSessionId: "processor-session-1",
          processorPaymentId: "processor-payment-1",
          processorIdentity: { providerId: "fake-pay", connectionId: "connection-1" },
          money: { amountMinor: 1_000, currency: "EUR" },
          idempotencyKey: "callback-event-1",
        },
      }
    },
    async health() {
      if (behavior === "malformed-health") {
        return { status: "ok", checkedAt: "not-a-date" }
      }
      return {
        status: "ok",
        checkedAt: "2026-07-24T12:00:00.000Z",
        message: "Fake processor is reachable",
        details: { latencyMs: 1 },
      }
    },
    async authorize(_context, input) {
      return runOperation("authorize", input)
    },
    async capture(_context, input) {
      return runOperation("capture", input)
    },
    async void(_context, input) {
      return runOperation("void", input)
    },
    async refund(_context, input) {
      return runOperation("refund", input)
    },
    async status(_context, input: PaymentStatusInput) {
      return {
        nextState: "paid",
        processorSessionId: input.processorSessionId,
        processorPaymentId: input.processorPaymentId,
        processorIdentity:
          behavior === "drop-status-identity"
            ? undefined
            : behavior === "remap-status-identity"
              ? { providerId: "other", connectionId: "other" }
              : input.processorIdentity,
        money: { amountMinor: 1_000, currency: "EUR" },
      }
    },
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}
