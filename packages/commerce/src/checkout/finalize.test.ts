import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildCheckoutFinalizeDeps, finalizeCheckout } from "./finalize.js"

const mocks = vi.hoisted(() => ({
  completePaymentSession: vi.fn(),
  convertProformaToInvoice: vi.fn(),
  ensureFinalization: vi.fn(),
  getDelivery: vi.fn(),
  getFinalization: vi.fn(),
  issueInvoiceFromBooking: vi.fn(),
  runCheckoutFinalize: vi.fn(),
  settleCoveredBookingPaymentSchedules: vi.fn(),
  updateDelivery: vi.fn(),
  updateFinalization: vi.fn(),
  withLock: vi.fn(),
}))

const tables = vi.hoisted(() => ({
  bookings: { id: "bookings.id", status: "bookings.status" },
  invoices: {
    id: "invoices.id",
    bookingId: "invoices.bookingId",
    invoiceType: "invoices.invoiceType",
    status: "invoices.status",
    createdAt: "invoices.createdAt",
  },
  paymentSessions: {
    id: "paymentSessions.id",
    bookingId: "paymentSessions.bookingId",
    status: "paymentSessions.status",
    invoiceId: "paymentSessions.invoiceId",
  },
}))

vi.mock("@voyant-travel/bookings", () => ({ bookingsService: {} }))
vi.mock("@voyant-travel/bookings/schema", () => ({
  bookingItems: { bookingId: "bookingItems.bookingId" },
  bookings: tables.bookings,
}))
vi.mock("@voyant-travel/catalog/booking-engine", () => ({
  runCheckoutFinalize: mocks.runCheckoutFinalize,
}))
vi.mock("@voyant-travel/finance", () => ({
  convertProformaToInvoice: mocks.convertProformaToInvoice,
  financeService: { completePaymentSession: mocks.completePaymentSession },
  invoices: tables.invoices,
  issueInvoiceFromBooking: mocks.issueInvoiceFromBooking,
  settleCoveredBookingPaymentSchedules: mocks.settleCoveredBookingPaymentSchedules,
}))
vi.mock("@voyant-travel/finance/schema", () => ({ paymentSessions: tables.paymentSessions }))
vi.mock("./finalization-store.js", () => ({
  ensureCheckoutFinalization: mocks.ensureFinalization,
  getCheckoutFinalization: mocks.getFinalization,
  getCheckoutFinalizationDelivery: mocks.getDelivery,
  updateCheckoutFinalization: mocks.updateFinalization,
  updateCheckoutFinalizationDelivery: mocks.updateDelivery,
  withCheckoutFinalizationLock: mocks.withLock,
}))

type Authority = {
  bookingId: string
  triggerPaymentSessionId: string
  invoiceId: string | null
  paymentId: string | null
  confirmedAt: Date | null
  paymentRevision: number
  contractId: string | null
  contractAttachmentId: string | null
  finalPaymentRenderVersion: number
  finalPaymentRenderKey: string | null
  revision: number
}

type Delivery = {
  paymentSessionId: string
  bookingId: string
  paymentLinkedAt: Date | null
  completedAt: Date | null
}

const authorities = new Map<string, Authority>()
const deliveries = new Map<string, Delivery>()
const lockTails = new Map<string, Promise<void>>()

interface SelectQuery {
  from(): SelectQuery
  limit(): Promise<Array<Record<string, unknown>>>
  orderBy(): SelectQuery
  then(resolve: (rows: unknown[]) => unknown): Promise<unknown>
  where(): SelectQuery
}

interface UpdateQuery {
  set(next: Record<string, unknown>): UpdateQuery
  then(resolve: (rows: unknown[]) => unknown): Promise<unknown>
  where(): UpdateQuery
}

function ensureState(identity: { bookingId: string; paymentSessionId: string }) {
  if (!authorities.has(identity.bookingId)) {
    authorities.set(identity.bookingId, {
      bookingId: identity.bookingId,
      triggerPaymentSessionId: identity.paymentSessionId,
      invoiceId: null,
      paymentId: null,
      confirmedAt: new Date(),
      paymentRevision: 0,
      contractId: null,
      contractAttachmentId: null,
      finalPaymentRenderVersion: 0,
      finalPaymentRenderKey: null,
      revision: 0,
    })
  }
  if (!deliveries.has(identity.paymentSessionId)) {
    deliveries.set(identity.paymentSessionId, {
      ...identity,
      paymentLinkedAt: null,
      completedAt: null,
    })
  }
}

function installCheckpointStore() {
  mocks.ensureFinalization.mockImplementation(async (_db, identity) => ensureState(identity))
  mocks.getFinalization.mockImplementation(async (_db, bookingId) => authorities.get(bookingId))
  mocks.getDelivery.mockImplementation(async (_db, sessionId) => deliveries.get(sessionId))
  mocks.updateFinalization.mockImplementation(async (_db, identity, revision, patch) => {
    const state = authorities.get(identity.bookingId)
    if (!state || state.revision !== revision) throw new Error("stale fence")
    Object.assign(state, patch, { revision: revision + 1 })
    return state
  })
  mocks.updateDelivery.mockImplementation(async (_db, identity, patch) => {
    const delivery = deliveries.get(identity.paymentSessionId)
    if (!delivery) throw new Error("missing delivery")
    Object.assign(delivery, patch)
  })
  mocks.withLock.mockImplementation(async (db, identity, operation) => {
    ensureState(identity)
    const prior = lockTails.get(identity.bookingId) ?? Promise.resolve()
    let release = () => {}
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    lockTails.set(
      identity.bookingId,
      prior.then(() => current),
    )
    await prior
    try {
      return await operation(db, authorities.get(identity.bookingId))
    } finally {
      release()
    }
  })
}

function databaseWithPaidSessions(sessions: Array<Record<string, unknown>>) {
  const query = () => {
    const chain: SelectQuery = {
      from: () => chain,
      limit: async () => sessions,
      orderBy: () => chain,
      // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally thenable.
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve(sessions.map((s) => ({ ...s }))).then(resolve),
      where: () => chain,
    }
    return chain
  }
  const update = () => {
    let patch: Record<string, unknown> = {}
    const chain: UpdateQuery = {
      set: (next: Record<string, unknown>) => {
        patch = next
        return chain
      },
      // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally thenable.
      then: (resolve: (rows: unknown[]) => unknown) => {
        const session = sessions.find((candidate) => candidate.invoiceId === null)
        if (session) Object.assign(session, patch)
        return Promise.resolve([]).then(resolve)
      },
      where: () => chain,
    }
    return chain
  }
  return { select: vi.fn(query), update: vi.fn(update) } as never
}

function databaseWithSelectResults(...results: Array<Array<Record<string, unknown>>>) {
  const queue = [...results]
  return {
    select: vi.fn(() => {
      const rows = queue.shift() ?? []
      const chain: SelectQuery = {
        from: () => chain,
        limit: async () => rows,
        orderBy: () => chain,
        // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are intentionally thenable.
        then: (resolve: (selected: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
        where: () => chain,
      }
      return chain
    }),
  } as never
}

describe("finalizeCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorities.clear()
    deliveries.clear()
    lockTails.clear()
    installCheckpointStore()
  })

  it("requires a payment-session identity and records delivery completion", async () => {
    const db = {} as never
    const eventBus = {} as never
    const input = { bookingId: "booking_1", paymentSessionId: "session_1" }

    await finalizeCheckout({ db, eventBus, input })

    expect(mocks.runCheckoutFinalize).toHaveBeenCalledWith(
      input,
      expect.objectContaining({ db, eventBus }),
    )
    expect(deliveries.get("session_1")?.completedAt).toBeInstanceOf(Date)
  })

  it("checkpoints only the final invoice explicitly linked by the triggering payment session", async () => {
    const identity = { bookingId: "booking_1", paymentSessionId: "session_1" }
    ensureState(identity)
    const db = databaseWithSelectResults(
      [{ invoiceId: "invoice_explicit" }],
      [{ id: "invoice_explicit" }],
    )
    const deps = buildCheckoutFinalizeDeps(db, {} as never, identity)

    await expect(deps.issueInvoice({ bookingId: "booking_1" })).resolves.toEqual({
      invoiceId: "invoice_explicit",
    })
    expect(mocks.issueInvoiceFromBooking).not.toHaveBeenCalled()
    expect(authorities.get("booking_1")?.invoiceId).toBe("invoice_explicit")
  })

  it("serializes distinct payment sessions on one booking authority without duplicate invoice or link", async () => {
    const sessions = [
      paidSession("session_1", "provider_payment_1"),
      paidSession("session_2", "provider_payment_2"),
    ]
    const db = databaseWithPaidSessions(sessions)
    const eventBus = {} as never
    const firstIdentity = { bookingId: "booking_1", paymentSessionId: "session_1" }
    const secondIdentity = { bookingId: "booking_1", paymentSessionId: "session_2" }
    ensureState(firstIdentity)
    ensureState(secondIdentity)
    const first = buildCheckoutFinalizeDeps(db, eventBus, firstIdentity)
    const second = buildCheckoutFinalizeDeps(db, eventBus, secondIdentity)
    mocks.convertProformaToInvoice.mockResolvedValue({
      status: "ok",
      invoice: { id: "invoice_from_proforma" },
    })
    mocks.completePaymentSession.mockImplementation(async (_db, sessionId) => {
      const session = sessions.find((candidate) => candidate.id === sessionId)
      if (!session) return null
      session.invoiceId = "invoice_from_proforma"
      session.paymentId = `payment_${sessionId}`
      return session
    })

    const [firstInvoice, secondInvoice] = await Promise.all([
      first.issueInvoice({ bookingId: "booking_1", convertedFromInvoiceId: "proforma_1" }),
      second.issueInvoice({ bookingId: "booking_1", convertedFromInvoiceId: "proforma_1" }),
    ])
    expect(firstInvoice).toEqual({ invoiceId: "invoice_from_proforma" })
    expect(secondInvoice).toEqual(firstInvoice)
    expect(mocks.convertProformaToInvoice).toHaveBeenCalledOnce()
    expect(mocks.issueInvoiceFromBooking).not.toHaveBeenCalled()

    await Promise.all([
      first.linkPaymentToInvoice?.({
        bookingId: "booking_1",
        invoiceId: "invoice_from_proforma",
        paymentSessionId: "session_1",
      }),
      second.linkPaymentToInvoice?.({
        bookingId: "booking_1",
        invoiceId: "invoice_from_proforma",
        paymentSessionId: "session_2",
      }),
    ])
    expect(mocks.completePaymentSession).toHaveBeenCalledTimes(2)
    expect(authorities.get("booking_1")?.paymentRevision).toBe(1)

    expect(authorities.get("booking_1")).toMatchObject({
      invoiceId: "invoice_from_proforma",
    })
  })
})

function paidSession(id: string, providerPaymentId: string) {
  return {
    id,
    bookingId: "booking_1",
    status: "paid",
    invoiceId: null as string | null,
    paymentId: null as string | null,
    amountCents: 6_250,
    currency: "EUR",
    paymentMethod: "credit_card",
    paymentInstrumentId: null,
    providerSessionId: `provider_${id}`,
    providerPaymentId,
    externalReference: null,
    completedAt: new Date("2026-07-21T10:00:00.000Z"),
  }
}
