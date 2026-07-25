import type {
  PaymentAdapter,
  PaymentAdapterRuntimeContext,
  PaymentCallbackEvent,
  PaymentCallbackRequest,
  PaymentInitiationInput,
  PaymentInitiationResult,
  PaymentMoney,
  PaymentOperationInput,
  PaymentOperationResult,
  PaymentProcessorIdentity,
  PaymentSessionState,
  PaymentStatusInput,
  PaymentStatusResult,
} from "./index.js"
import { isPaymentAdapterError, paymentAdapterRuntimePort } from "./index.js"

export interface PaymentOperationConformanceFixture {
  input: PaymentOperationInput
  /** Defaults to `input`. */
  duplicateInput?: PaymentOperationInput
  /** Defaults to `input` with a changed reason and the same idempotency key. */
  conflictingInput?: PaymentOperationInput
  /**
   * Maximum capturable/refundable amount. Defaults to the initiation amount.
   * Use this when the prepared operation targets a different amount.
   */
  amountLimit?: PaymentMoney
}

export interface PaymentStatusConformanceFixture {
  input: PaymentStatusInput
  /** Defaults to `input`. */
  duplicateInput?: PaymentStatusInput
}

export type PaymentOperationConformanceInput =
  | PaymentOperationInput
  | PaymentOperationConformanceFixture
export type PaymentStatusConformanceInput = PaymentStatusInput | PaymentStatusConformanceFixture

export interface PaymentAdapterConformanceHarness {
  adapter: PaymentAdapter
  context: PaymentAdapterRuntimeContext
  initiation: PaymentInitiationInput
  /** A semantically identical retry. Defaults to `initiation`. */
  duplicateInitiation?: PaymentInitiationInput
  signedCallback: PaymentCallbackRequest
  duplicateCallback: PaymentCallbackRequest
  /** Required at runtime because callback verification is mandatory. */
  replayCallback?: PaymentCallbackRequest
  unsignedCallback: PaymentCallbackRequest
  /** Required at runtime because callback verification is mandatory. */
  invalidSignatureCallback?: PaymentCallbackRequest
  /** Required at runtime because callback verification is mandatory. */
  malformedCallback?: PaymentCallbackRequest
  /**
   * A separate manual-capture initiation. Required when capture is declared.
   * It may stop at redirect/processing/authorized, but must never report paid.
   */
  manualCaptureInitiation?: PaymentInitiationInput
  authorize?: PaymentOperationConformanceInput
  capture?: PaymentOperationConformanceInput
  void?: PaymentOperationConformanceInput
  refund?: PaymentOperationConformanceInput
  status?: PaymentStatusConformanceInput
}

export interface PaymentAdapterConformanceResult {
  name: string
  passed: boolean
  error?: unknown
}

type ConformanceCase = {
  name: string
  run(): Promise<void> | void
}

export async function runPaymentAdapterConformance(
  harness: PaymentAdapterConformanceHarness,
): Promise<PaymentAdapterConformanceResult[]> {
  const cases = buildCases(harness)
  const results: PaymentAdapterConformanceResult[] = []
  for (const testCase of cases) {
    try {
      await testCase.run()
      results.push({ name: testCase.name, passed: true })
    } catch (error) {
      results.push({ name: testCase.name, passed: false, error })
    }
  }
  return results
}

function buildCases(harness: PaymentAdapterConformanceHarness): ConformanceCase[] {
  return [
    {
      name: "declares a valid adapter port",
      run: () => assertAdapterPort(harness.adapter),
    },
    { name: "uses valid minor-unit money", run: () => assertMoney(harness.initiation.money) },
    { name: "initiates idempotently", run: () => assertInitiation(harness) },
    {
      name: "rejects initiation idempotency-key reuse with a different payload",
      run: () => assertInitiationConflict(harness),
    },
    { name: "rejects invalid minor-unit money", run: () => assertInvalidMoney(harness) },
    {
      name: "maps a signed callback to a canonical state",
      run: () => assertSignedCallback(harness),
    },
    {
      name: "preserves semantic duplicate callback identity",
      run: () => assertDuplicateCallback(harness),
    },
    { name: "rejects unsigned callbacks", run: () => assertUnsignedCallback(harness) },
    {
      name: "rejects invalid-signature callbacks",
      run: () => assertRejectedCallback(harness, "invalidSignatureCallback", "invalid_signature"),
    },
    {
      name: "rejects malformed callbacks",
      run: () => assertRejectedCallback(harness, "malformedCallback", "malformed"),
    },
    {
      name: "rejects replayed callbacks",
      run: () => assertRejectedCallback(harness, "replayCallback", "replay"),
    },
    { name: "reports typed health diagnostics", run: () => assertHealth(harness) },
    {
      name: "honors declared authorize capability",
      run: () => assertOptionalOperation(harness, "authorize"),
    },
    {
      name: "honors declared capture capability",
      run: () => assertOptionalOperation(harness, "capture"),
    },
    {
      name: "honors declared void capability",
      run: () => assertOptionalOperation(harness, "void"),
    },
    {
      name: "honors declared refund capability",
      run: () => assertOptionalOperation(harness, "refund"),
    },
    {
      name: "honors declared status capability",
      run: () => assertStatus(harness),
    },
    { name: "honors manual capture", run: () => assertManualCapture(harness) },
    {
      name: "enforces partial capture bounds",
      run: () => assertPartialOperationBound(harness, "capture"),
    },
    {
      name: "enforces partial refund bounds",
      run: () => assertPartialOperationBound(harness, "refund"),
    },
  ]
}

async function assertAdapterPort(adapter: PaymentAdapter) {
  paymentAdapterRuntimePort.test(adapter)
  if (!adapter.label || adapter.label.trim() !== adapter.label) {
    throw new Error("Payment adapter must declare a stable non-empty label.")
  }
  if (!["sandbox", "test", "live"].includes(adapter.mode)) {
    throw new Error("Payment adapter must declare a valid mode.")
  }
  const capabilities = [
    "hostedCheckout",
    "redirectCheckout",
    "authorize",
    "capture",
    "void",
    "refund",
    "status",
    "callbackSignatureVerification",
    "idempotencyKeys",
    "retrySafeInitiation",
  ] as const
  for (const capability of capabilities) {
    const declared = adapter.capabilities[capability]
    if (typeof declared !== "boolean") {
      throw new Error(`Payment adapter capability ${capability} must be boolean.`)
    }
  }
  if (!adapter.capabilities.idempotencyKeys || !adapter.capabilities.retrySafeInitiation) {
    throw new Error("Payment adapters must declare idempotent, retry-safe initiation.")
  }
}

function assertMoney(money: PaymentMoney) {
  if (!Number.isSafeInteger(money.amountMinor) || money.amountMinor <= 0) {
    throw new Error("Money amounts must be positive safe-integer minor units.")
  }
  if (!/^[A-Z]{3}$/.test(money.currency)) {
    throw new Error("Money currency must be an ISO 4217 uppercase code.")
  }
}

async function assertInitiation(harness: PaymentAdapterConformanceHarness) {
  if (
    harness.duplicateInitiation &&
    harness.duplicateInitiation.idempotencyKey !== harness.initiation.idempotencyKey
  ) {
    throw new Error("Duplicate initiation fixture must reuse the idempotency key.")
  }
  const first = await harness.adapter.initiate(harness.context, harness.initiation)
  const duplicate = await harness.adapter.initiate(
    harness.context,
    harness.duplicateInitiation ?? harness.initiation,
  )
  if (first.idempotencyKey !== harness.initiation.idempotencyKey) {
    throw new Error("Initiation result must echo the canonical idempotency key.")
  }
  if (duplicate.idempotencyKey !== first.idempotencyKey) {
    throw new Error("Duplicate initiation must preserve idempotency identity.")
  }
  assertInitiationResult(harness.adapter, first)
  assertInitiationResult(harness.adapter, duplicate)
  assertSame(
    initiationIdentity(first),
    initiationIdentity(duplicate),
    "Duplicate initiation must preserve canonical result identity.",
  )
}

async function assertInitiationConflict(harness: PaymentAdapterConformanceHarness) {
  await harness.adapter.initiate(harness.context, harness.initiation)
  const conflicting: PaymentInitiationInput = {
    ...harness.initiation,
    description:
      harness.initiation.description === "conformance-conflict"
        ? "conformance-conflict-2"
        : "conformance-conflict",
  }
  await expectAdapterRejection(
    () => harness.adapter.initiate(harness.context, conflicting),
    "IDEMPOTENCY_KEY_REUSED",
  )
}

async function assertInvalidMoney(harness: PaymentAdapterConformanceHarness) {
  const invalidMoney: PaymentMoney[] = [
    { ...harness.initiation.money, amountMinor: 0 },
    { ...harness.initiation.money, amountMinor: -1 },
    { ...harness.initiation.money, amountMinor: 1.5 },
    { ...harness.initiation.money, amountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { ...harness.initiation.money, currency: harness.initiation.money.currency.toLowerCase() },
  ]
  for (const [index, money] of invalidMoney.entries()) {
    const input: PaymentInitiationInput = {
      ...harness.initiation,
      paymentSessionId: `${harness.initiation.paymentSessionId}:invalid-money:${index}`,
      idempotencyKey: `${harness.initiation.idempotencyKey}:invalid-money:${index}`,
      money,
    }
    await expectAdapterRejection(
      () => harness.adapter.initiate(harness.context, input),
      "INVALID_REQUEST",
    )
  }
  for (const operation of ["authorize", "capture", "void", "refund"] as const) {
    if (!harness.adapter.capabilities[operation]) continue
    const fixtureInput = harness[operation]
    const method = harness.adapter[operation]
    if (!fixtureInput || typeof method !== "function") continue
    const fixture = normalizeOperationFixture(fixtureInput)
    for (const [index, money] of invalidMoney.entries()) {
      const input: PaymentOperationInput = {
        ...fixture.input,
        idempotencyKey: `${fixture.input.idempotencyKey}:invalid-money:${index}`,
        money,
      }
      await expectAdapterRejection(
        () => method.call(harness.adapter, harness.context, input),
        "INVALID_REQUEST",
      )
    }
  }
}

async function assertSignedCallback(harness: PaymentAdapterConformanceHarness) {
  const result = await harness.adapter.verifyCallback(harness.context, harness.signedCallback)
  if (!result.verified) throw new Error(`Signed callback rejected: ${result.reason}`)
  assertCallbackEvent(result.event)
}

async function assertDuplicateCallback(harness: PaymentAdapterConformanceHarness) {
  const first = await harness.adapter.verifyCallback(harness.context, harness.signedCallback)
  const duplicate = await harness.adapter.verifyCallback(harness.context, harness.duplicateCallback)
  if (!first.verified || !duplicate.verified) {
    throw new Error("Duplicate callback replay should verify and map to the same canonical event.")
  }
  assertCallbackEvent(first.event)
  assertCallbackEvent(duplicate.event)
  assertSame(
    callbackIdentity(first.event),
    callbackIdentity(duplicate.event),
    "Duplicate callbacks must preserve the complete canonical event identity.",
  )
}

async function assertUnsignedCallback(harness: PaymentAdapterConformanceHarness) {
  const result = await harness.adapter.verifyCallback(harness.context, harness.unsignedCallback)
  if (result.verified || result.reason !== "missing_signature") {
    throw new Error("Unsigned callbacks must fail with missing_signature.")
  }
}

async function assertRejectedCallback(
  harness: PaymentAdapterConformanceHarness,
  fixtureName: "invalidSignatureCallback" | "malformedCallback" | "replayCallback",
  reason: "invalid_signature" | "malformed" | "replay",
) {
  const request = harness[fixtureName]
  if (!request) {
    throw new Error(
      `Adapter declares callback verification but no ${fixtureName} fixture was supplied.`,
    )
  }
  const result = await harness.adapter.verifyCallback(harness.context, request)
  if (result.verified || result.reason !== reason) {
    throw new Error(`${fixtureName} must fail closed with ${reason}.`)
  }
}

async function assertHealth(harness: PaymentAdapterConformanceHarness) {
  const health = await harness.adapter.health(harness.context)
  if (!health || typeof health !== "object") {
    throw new Error("Health diagnostics must be an object.")
  }
  if (!["ok", "degraded", "down"].includes(health.status)) {
    throw new Error("Health status must be ok, degraded, or down.")
  }
  if (!isIsoTimestamp(health.checkedAt)) {
    throw new Error("Health diagnostics must include an ISO checkedAt timestamp.")
  }
  if (health.message !== undefined && typeof health.message !== "string") {
    throw new Error("Health diagnostic message must be a string.")
  }
  if (health.details !== undefined && !isRecord(health.details)) {
    throw new Error("Health diagnostic details must be a record.")
  }
}

async function assertOptionalOperation(
  harness: PaymentAdapterConformanceHarness,
  operation: "authorize" | "capture" | "void" | "refund",
) {
  if (!harness.adapter.capabilities[operation]) return
  const fixtureInput = harness[operation]
  const method = harness.adapter[operation]
  if (!fixtureInput || typeof method !== "function") {
    throw new Error(`Adapter declares ${operation} but no conformance input/method was supplied.`)
  }
  const fixture = normalizeOperationFixture(fixtureInput)
  assertOperationInput(fixture.input)
  const first = await method.call(harness.adapter, harness.context, fixture.input)
  assertOperationResult(operation, fixture.input, first)

  const duplicateInput = fixture.duplicateInput ?? fixture.input
  if (duplicateInput.idempotencyKey !== fixture.input.idempotencyKey) {
    throw new Error(`${operation} duplicate fixture must reuse the idempotency key.`)
  }
  const duplicate = await method.call(harness.adapter, harness.context, duplicateInput)
  assertOperationResult(operation, duplicateInput, duplicate)
  assertSame(
    operationIdentity(first),
    operationIdentity(duplicate),
    `Duplicate ${operation} must preserve canonical result identity.`,
  )

  const conflictingInput = fixture.conflictingInput ?? {
    ...fixture.input,
    reason:
      fixture.input.reason === "conformance-conflict"
        ? "conformance-conflict-2"
        : "conformance-conflict",
  }
  if (conflictingInput.idempotencyKey !== fixture.input.idempotencyKey) {
    throw new Error(`${operation} conflicting fixture must reuse the idempotency key.`)
  }
  await expectAdapterRejection(
    () => method.call(harness.adapter, harness.context, conflictingInput),
    "IDEMPOTENCY_KEY_REUSED",
  )
}

async function assertStatus(harness: PaymentAdapterConformanceHarness) {
  if (!harness.adapter.capabilities.status) return
  if (!harness.status || typeof harness.adapter.status !== "function") {
    throw new Error("Adapter declares status but no conformance input/method was supplied.")
  }
  const fixture = normalizeStatusFixture(harness.status)
  const first = await harness.adapter.status(harness.context, fixture.input)
  const duplicate = await harness.adapter.status(
    harness.context,
    fixture.duplicateInput ?? fixture.input,
  )
  assertStatusResult(fixture.input, first)
  assertStatusResult(fixture.duplicateInput ?? fixture.input, duplicate)
  assertSame(
    statusReferences(first),
    statusReferences(duplicate),
    "Repeated status calls must preserve processor identity and references.",
  )
  if (!isMonotonicState(first.nextState, duplicate.nextState)) {
    throw new Error("Repeated status calls must not regress payment state.")
  }
}

async function assertManualCapture(harness: PaymentAdapterConformanceHarness) {
  if (!harness.adapter.capabilities.capture) return
  const input = harness.manualCaptureInitiation
  if (!input) {
    throw new Error("Adapter declares capture but no manualCaptureInitiation fixture was supplied.")
  }
  if (input.captureMode !== "manual") {
    throw new Error("Manual capture fixture must set captureMode to manual.")
  }
  await assertMoney(input.money)
  const first = await harness.adapter.initiate(harness.context, input)
  const duplicate = await harness.adapter.initiate(harness.context, input)
  assertInitiationResult(harness.adapter, first)
  assertInitiationResult(harness.adapter, duplicate)
  if (first.nextState === "paid" || duplicate.nextState === "paid") {
    throw new Error("Manual-capture initiation must not report payment as paid.")
  }
  assertSame(
    initiationIdentity(first),
    initiationIdentity(duplicate),
    "Manual-capture initiation must be idempotent.",
  )
}

async function assertPartialOperationBound(
  harness: PaymentAdapterConformanceHarness,
  operation: "capture" | "refund",
) {
  if (!harness.adapter.capabilities[operation]) return
  const fixtureInput = harness[operation]
  const method = harness.adapter[operation]
  if (!fixtureInput || typeof method !== "function") {
    throw new Error(`Adapter declares ${operation} but no conformance input/method was supplied.`)
  }
  const fixture = normalizeOperationFixture(fixtureInput)
  const limit = fixture.amountLimit ?? harness.initiation.money
  await assertMoney(limit)
  if (fixture.input.money) {
    await assertMoney(fixture.input.money)
    if (
      fixture.input.money.currency !== limit.currency ||
      fixture.input.money.amountMinor > limit.amountMinor
    ) {
      throw new Error(`${operation} fixture must be within its declared amount limit.`)
    }
  }
  const overLimit: PaymentOperationInput = {
    ...fixture.input,
    idempotencyKey: `${fixture.input.idempotencyKey}:over-limit`,
    money: { amountMinor: limit.amountMinor + 1, currency: limit.currency },
  }
  await expectAdapterRejection(
    () => method.call(harness.adapter, harness.context, overLimit),
    "INVALID_REQUEST",
  )
  const otherCurrency = limit.currency === "USD" ? "EUR" : "USD"
  const currencyMismatch: PaymentOperationInput = {
    ...fixture.input,
    idempotencyKey: `${fixture.input.idempotencyKey}:currency-mismatch`,
    money: { amountMinor: limit.amountMinor, currency: otherCurrency },
  }
  await expectAdapterRejection(
    () => method.call(harness.adapter, harness.context, currencyMismatch),
    "INVALID_REQUEST",
  )
}

function assertInitiationResult(adapter: PaymentAdapter, result: PaymentInitiationResult) {
  assertState(result.nextState)
  assertNonEmpty(result.idempotencyKey, "Initiation result idempotency key")
  assertIdentity(result.processorIdentity)
  if (!result.checkout) return
  let url: URL
  try {
    url = new URL(result.checkout.url)
  } catch {
    throw new Error("Hosted checkout redirects must be absolute HTTP(S) URLs.")
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Hosted checkout redirects must be absolute HTTP(S) URLs.")
  }
  if (result.checkout.kind === "hosted_checkout" && !adapter.capabilities.hostedCheckout) {
    throw new Error("Adapter returned hosted checkout without declaring the capability.")
  }
  if (result.checkout.kind === "redirect" && !adapter.capabilities.redirectCheckout) {
    throw new Error("Adapter returned redirect checkout without declaring the capability.")
  }
  if (
    !["hosted_checkout", "redirect"].includes(result.checkout.kind) ||
    (result.checkout.expiresAt != null && !isIsoTimestamp(result.checkout.expiresAt))
  ) {
    throw new Error("Adapter returned malformed hosted checkout diagnostics.")
  }
}

function assertCallbackEvent(event: PaymentCallbackEvent) {
  assertNonEmpty(event.eventId, "Callback event id")
  assertNonEmpty(event.paymentSessionId, "Callback payment session id")
  assertNonEmpty(event.idempotencyKey, "Callback idempotency key")
  assertState(event.nextState)
  if (!isIsoTimestamp(event.occurredAt)) {
    throw new Error("Callback occurredAt must be an ISO timestamp.")
  }
  assertIdentity(event.processorIdentity)
  if (event.money) assertMoney(event.money)
}

function assertOperationInput(input: PaymentOperationInput) {
  assertNonEmpty(input.paymentSessionId, "Operation payment session id")
  assertNonEmpty(input.idempotencyKey, "Operation idempotency key")
  assertIdentity(input.processorIdentity)
  if (input.money) assertMoney(input.money)
}

function assertOperationResult(
  operation: string,
  input: PaymentOperationInput,
  result: PaymentOperationResult,
) {
  if (!result || !["accepted", "declined", "pending", "failed"].includes(result.status)) {
    throw new Error(`${operation} returned an invalid operation status.`)
  }
  if (result.nextState !== undefined) assertState(result.nextState)
  assertIdentity(result.processorIdentity)
  assertMappedIdentity(input.processorIdentity, result.processorIdentity, operation)
  if (
    result.retryAfterSeconds !== undefined &&
    (!Number.isSafeInteger(result.retryAfterSeconds) || result.retryAfterSeconds < 0)
  ) {
    throw new Error(`${operation} retryAfterSeconds must be a non-negative integer.`)
  }
}

function assertStatusResult(input: PaymentStatusInput, result: PaymentStatusResult) {
  if (!result || typeof result !== "object") throw new Error("Status must return a result.")
  assertState(result.nextState)
  assertIdentity(result.processorIdentity)
  assertMappedValue(input.processorSessionId, result.processorSessionId, "processor session id")
  assertMappedValue(input.processorPaymentId, result.processorPaymentId, "processor payment id")
  assertMappedIdentity(input.processorIdentity, result.processorIdentity, "status")
  if (result.money) assertMoney(result.money)
}

function assertMappedValue(
  input: string | null | undefined,
  output: string | null | undefined,
  label: string,
) {
  if (input != null && output !== input) {
    throw new Error(`Adapter must preserve an existing ${label}.`)
  }
}

function assertMappedIdentity(
  input: PaymentProcessorIdentity | undefined,
  output: PaymentProcessorIdentity | undefined,
  label: string,
) {
  if (input && (!output || !same(input, output))) {
    throw new Error(`Adapter must preserve processor identity during ${label}.`)
  }
}

function assertIdentity(identity: PaymentProcessorIdentity | undefined) {
  if (!identity) return
  assertNonEmpty(identity.providerId, "Processor provider id")
  assertNonEmpty(identity.connectionId, "Processor connection id")
}

function normalizeOperationFixture(
  fixture: PaymentOperationConformanceInput,
): PaymentOperationConformanceFixture {
  return "input" in fixture ? fixture : { input: fixture }
}

function normalizeStatusFixture(
  fixture: PaymentStatusConformanceInput,
): PaymentStatusConformanceFixture {
  return "input" in fixture ? fixture : { input: fixture }
}

function initiationIdentity(result: PaymentInitiationResult) {
  return {
    processorSessionId: result.processorSessionId ?? null,
    processorPaymentId: result.processorPaymentId ?? null,
    processorIdentity: result.processorIdentity ?? null,
    checkout: result.checkout ?? null,
    nextState: result.nextState,
    idempotencyKey: result.idempotencyKey,
  }
}

function callbackIdentity(event: PaymentCallbackEvent) {
  return {
    eventId: event.eventId,
    paymentSessionId: event.paymentSessionId,
    nextState: event.nextState,
    occurredAt: event.occurredAt,
    processorSessionId: event.processorSessionId ?? null,
    processorPaymentId: event.processorPaymentId ?? null,
    processorIdentity: event.processorIdentity ?? null,
    money: event.money ?? null,
    idempotencyKey: event.idempotencyKey,
  }
}

function operationIdentity(result: PaymentOperationResult) {
  return {
    status: result.status,
    nextState: result.nextState ?? null,
    processorIdentity: result.processorIdentity ?? null,
    processorReference: result.processorReference ?? null,
    retryAfterSeconds: result.retryAfterSeconds ?? null,
  }
}

function statusReferences(result: PaymentStatusResult) {
  return {
    processorSessionId: result.processorSessionId ?? null,
    processorPaymentId: result.processorPaymentId ?? null,
    processorIdentity: result.processorIdentity ?? null,
  }
}

async function expectAdapterRejection(
  call: () => Promise<unknown>,
  code: "IDEMPOTENCY_KEY_REUSED" | "INVALID_REQUEST",
) {
  try {
    await call()
  } catch (error) {
    if (!isPaymentAdapterError(error)) {
      throw new Error(`Adapter must reject with a typed ${code} error.`, { cause: error })
    }
    if (error.code !== code || error.retryable) {
      throw new Error(`Adapter must reject with non-retryable ${code}.`, { cause: error })
    }
    return
  }
  throw new Error(`Adapter must fail closed with ${code}.`)
}

function assertState(state: PaymentSessionState) {
  if (
    ![
      "pending",
      "requires_redirect",
      "processing",
      "authorized",
      "paid",
      "failed",
      "cancelled",
      "expired",
    ].includes(state)
  ) {
    throw new Error("Adapter returned an invalid payment state.")
  }
}

function isMonotonicState(from: PaymentSessionState, to: PaymentSessionState) {
  const allowed: Record<PaymentSessionState, readonly PaymentSessionState[]> = {
    pending: [
      "pending",
      "requires_redirect",
      "processing",
      "authorized",
      "paid",
      "failed",
      "cancelled",
      "expired",
    ],
    requires_redirect: [
      "requires_redirect",
      "processing",
      "authorized",
      "paid",
      "failed",
      "cancelled",
      "expired",
    ],
    processing: ["processing", "authorized", "paid", "failed", "cancelled", "expired"],
    authorized: ["authorized", "paid", "failed", "cancelled", "expired"],
    paid: ["paid"],
    failed: ["failed"],
    cancelled: ["cancelled"],
    expired: ["expired"],
  }
  return allowed[from].includes(to)
}

function assertNonEmpty(value: string, label: string) {
  if (!value || value.trim() !== value) throw new Error(`${label} must be stable and non-empty.`)
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false
  const timestamp = Date.parse(value)
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function assertSame(left: unknown, right: unknown, message: string) {
  if (!same(left, right)) throw new Error(message)
}

function same(left: unknown, right: unknown) {
  return stableSerialize(left) === stableSerialize(right)
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}
