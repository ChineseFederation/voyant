import { handleApiError } from "@voyant-travel/hono"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"

import { noDepositPolicy, type PaymentPolicy } from "../../src/payment-policy.js"
import {
  type BookingScheduleRoutesOptions,
  createBookingScheduleAdminRoutes,
  createBookingScheduleApiExtension,
  createPaymentPolicyPublicRoutes,
  generatePaymentScheduleForBooking,
} from "../../src/payment-schedule/routes.js"

/**
 * A tiny chainable drizzle stub. Every query-builder method returns the same
 * chain, and the terminal reads (`.limit()` / `.orderBy()`) drain a per-test
 * `readQueue` in call order so `await db.select()...limit(1)` resolves to the
 * configured row set. `insert`/`update`/`delete` are counted for assertions.
 */
function makeDbStub() {
  const calls = {
    inserts: [] as unknown[],
    updates: 0,
    deletes: 0,
  }
  // Sequence of read results returned by `.limit()` / `.orderBy()` in call order.
  // generatePaymentScheduleForBooking reads: [booking], [existingSchedule].
  // regenerate reads additionally: [before], [rows], [updatedBooking].
  let readIndex = 0
  const readQueue: unknown[][] = []

  const chain: Record<string, unknown> = {}
  const passthrough = () => chain
  for (const m of ["select", "from", "where", "set", "values", "returning"]) {
    chain[m] = vi.fn(passthrough)
  }
  chain.update = vi.fn(() => {
    calls.updates++
    return chain
  })
  chain.insert = vi.fn((table: unknown) => {
    calls.inserts.push(table)
    return chain
  })
  chain.delete = vi.fn(() => {
    calls.deletes++
    return chain
  })
  const resolveRead = () => {
    const next = readQueue[readIndex] ?? []
    readIndex++
    return Promise.resolve(next)
  }
  chain.limit = vi.fn(resolveRead)
  chain.orderBy = vi.fn(resolveRead)

  return {
    db: chain as never,
    calls,
    setReadQueue(rows: unknown[][]) {
      readQueue.length = 0
      readQueue.push(...rows)
      readIndex = 0
    },
    get readIndex() {
      return readIndex
    },
  }
}

function baseOptions(
  overrides: Partial<BookingScheduleRoutesOptions> = {},
): BookingScheduleRoutesOptions {
  const policy: PaymentPolicy = noDepositPolicy
  return {
    resolveDb: () => ({}) as never,
    resolveOperatorDefaultPaymentPolicy: vi.fn(async () => policy),
    resolveSupplierPolicy: vi.fn(async () => null),
    resolveCategoryPolicy: vi.fn(async () => null),
    resolveListingPolicy: vi.fn(async () => null),
    resolveListingPolicyForEntity: vi.fn(async () => null),
    resolveCategoryPolicyForEntity: vi.fn(async () => null),
    resolveSupplierPolicyForEntity: vi.fn(async () => null),
    stampPolicySourceOnBooking: vi.fn(async () => {}),
    readPolicySourceFromInternalNotes: vi.fn(() => "operator_default"),
    ...overrides,
  }
}

describe("generatePaymentScheduleForBooking", () => {
  it("is idempotent — returns early when a schedule already exists", async () => {
    const stub = makeDbStub()
    // reads: [booking], [existingSchedule] → existing present
    stub.setReadQueue([
      [{ id: "bk_1", sellAmountCents: 10_000, sellCurrency: "RON", startDate: "2026-09-01" }],
      [{ id: "bps_existing" }],
    ])
    const options = baseOptions()

    await generatePaymentScheduleForBooking(stub.db, "bk_1", options)

    // Never wrote an activity-log row (returned before generating).
    expect(stub.calls.inserts).toHaveLength(0)
    expect(options.stampPolicySourceOnBooking).not.toHaveBeenCalled()
  })

  it("delegates to the injected cascade resolvers + stamps source + logs", async () => {
    const stub = makeDbStub()
    // reads: [booking], [existingSchedule empty], then applyComputedPaymentSchedule's
    // internal reads. We give booking + empty schedule, the rest default to [].
    stub.setReadQueue([
      [{ id: "bk_2", sellAmountCents: 20_000, sellCurrency: "RON", startDate: "2026-09-01" }],
      [],
    ])
    const options = baseOptions()

    // The real `financeService.applyComputedPaymentSchedule` runs against the
    // stub db (deletes + inserts resolve to []), so the orchestration completes.
    // Assert every injected cascade resolver was consulted for the booking.
    await generatePaymentScheduleForBooking(stub.db, "bk_2", options)

    expect(options.resolveOperatorDefaultPaymentPolicy).toHaveBeenCalled()
    expect(options.resolveSupplierPolicy).toHaveBeenCalledWith(stub.db, "bk_2")
    expect(options.resolveCategoryPolicy).toHaveBeenCalledWith(stub.db, "bk_2")
    expect(options.resolveListingPolicy).toHaveBeenCalledWith(stub.db, "bk_2")
    expect(options.stampPolicySourceOnBooking).toHaveBeenCalled()
  })

  it("bills an accepted proposal on the terms it stated", async () => {
    const stub = makeDbStub()
    // reads: [booking], [existingSchedule empty], [booking origin].
    stub.setReadQueue([
      [{ id: "bk_3", sellAmountCents: 100_000, sellCurrency: "EUR", startDate: "2026-09-01" }],
      [],
      [
        {
          bookingId: "bk_3",
          originSource: "accepted_proposal_version",
          proposalVersionId: "prvr_1",
        },
      ],
    ])
    const halfNow: PaymentPolicy = {
      deposit: { kind: "percent", percent: 50 },
      minDaysBeforeDepartureForDeposit: 30,
      balanceDueDaysBeforeDeparture: 30,
      balanceDueMinDaysFromNow: 7,
    }
    const options = baseOptions({
      resolveProposalVersionPolicy: vi.fn(async () => halfNow),
    })

    await generatePaymentScheduleForBooking(stub.db, "bk_3", options)

    // Keyed by the Proposal Version, not the booking: finance walks
    // `booking_origins` itself so the injected reader stays inside proposals.
    expect(options.resolveProposalVersionPolicy).toHaveBeenCalledWith(stub.db, "prvr_1")
    expect(options.stampPolicySourceOnBooking).toHaveBeenCalledWith(stub.db, "bk_3", "proposal")
  })

  it("ignores the proposal layer for a booking that came from somewhere else", async () => {
    const stub = makeDbStub()
    stub.setReadQueue([
      [{ id: "bk_4", sellAmountCents: 100_000, sellCurrency: "EUR", startDate: "2026-09-01" }],
      [],
      [{ bookingId: "bk_4", originSource: "direct_b2c", proposalVersionId: null }],
    ])
    const options = baseOptions({
      resolveProposalVersionPolicy: vi.fn(async () => null),
    })

    await generatePaymentScheduleForBooking(stub.db, "bk_4", options)

    expect(options.resolveProposalVersionPolicy).not.toHaveBeenCalled()
    expect(options.stampPolicySourceOnBooking).toHaveBeenCalledWith(
      stub.db,
      "bk_4",
      "operator_default",
    )
  })

  it("reads no origin at all when no proposals module is composed", async () => {
    // Measured as a delta rather than an absolute count: the point is that the
    // origin lookup is the ONLY read the proposal layer adds, and that an
    // unwired deployment does not pay for it. An absolute number would also
    // pin `applyComputedPaymentSchedule`'s internals, which are not the claim.
    const booking = [
      { id: "bk_5", sellAmountCents: 100_000, sellCurrency: "EUR", startDate: "2026-09-01" },
    ]
    const origin = [
      { bookingId: "bk_5", originSource: "accepted_proposal_version", proposalVersionId: "prvr_5" },
    ]

    const unwired = makeDbStub()
    unwired.setReadQueue([booking, []])
    await generatePaymentScheduleForBooking(unwired.db, "bk_5", baseOptions())

    const wired = makeDbStub()
    wired.setReadQueue([booking, [], origin])
    await generatePaymentScheduleForBooking(
      wired.db,
      "bk_5",
      baseOptions({ resolveProposalVersionPolicy: vi.fn(async () => null) }),
    )

    expect(wired.readIndex).toBe(unwired.readIndex + 1)
  })
})

describe("createBookingScheduleApiExtension", () => {
  it("describes both injected booking schedule route surfaces", () => {
    const extension = createBookingScheduleApiExtension(baseOptions())

    expect(extension).toMatchObject({
      extension: { name: "booking-schedule", module: "bookings" },
      publicPath: "payment-policy",
      anonymous: true,
    })
    expect(extension.lazyAdminRoutes).toBeTypeOf("function")
    expect(extension.lazyPublicRoutes).toBeTypeOf("function")
  })
})

describe("createPaymentPolicyPublicRoutes — POST /resolve", () => {
  it("returns the resolved policy + source", async () => {
    const stub = makeDbStub()
    const options = baseOptions({ resolveDb: () => stub.db })
    const app = new Hono().route("/", createPaymentPolicyPublicRoutes(options))

    const res = await app.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entityModule: "products", entityId: "prod_1" }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { policy: unknown; source: string } }
    expect(json.data.policy).toEqual(noDepositPolicy)
    expect(json.data.source).toBe("operator_default")
    expect(options.resolveListingPolicyForEntity).toHaveBeenCalled()
    expect(options.resolveCategoryPolicyForEntity).toHaveBeenCalled()
    expect(options.resolveSupplierPolicyForEntity).toHaveBeenCalled()
  })

  it("rejects an invalid body with 400", async () => {
    const stub = makeDbStub()
    const options = baseOptions({ resolveDb: () => stub.db })
    // The route now validates the body via `@hono/zod-openapi` + the shared
    // `openApiValidationHook`, which throws a RequestValidationError mapped to a
    // 400 by `handleApiError` (the same error boundary createApp installs).
    const app = new Hono().route("/", createPaymentPolicyPublicRoutes(options))
    app.onError(handleApiError)

    const res = await app.request("/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entityModule: "products" }), // missing entityId
    })

    expect(res.status).toBe(400)
  })
})

describe("createBookingScheduleAdminRoutes — POST /:bookingId/payment-schedule/regenerate", () => {
  it("returns 400 on an invalid request body", async () => {
    const stub = makeDbStub()
    const options = baseOptions({ resolveDb: () => stub.db })
    const app = new Hono().route("/", createBookingScheduleAdminRoutes(options))

    const res = await app.request("/bk_bad/payment-schedule/regenerate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // customerPaymentPolicy present but malformed → zod parse fails → 400.
      body: JSON.stringify({ customerPaymentPolicy: { deposit: { kind: "nope" } } }),
    })

    expect(res.status).toBe(400)
  })

  it("delegates schedule generation through generatePaymentScheduleForBooking (idempotent path)", async () => {
    const stub = makeDbStub()
    // reads in order:
    //   regenerate (no customerPaymentPolicy key) → skips the override block
    //   generatePaymentScheduleForBooking: [booking], [existingSchedule present]
    //   final rows: [scheduleRows], [updatedBooking]
    stub.setReadQueue([
      [{ id: "bk_3", sellAmountCents: 30_000, sellCurrency: "RON", startDate: "2026-09-01" }],
      [{ id: "bps_existing" }],
      [], // scheduleRows
      [{ customerPaymentPolicy: null, internalNotes: "" }],
    ])
    const options = baseOptions({ resolveDb: () => stub.db })
    const app = new Hono().route("/", createBookingScheduleAdminRoutes(options))

    const res = await app.request("/bk_3/payment-schedule/regenerate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      data: { schedule: unknown[]; bookingPolicy: unknown; cascadeSource: string }
    }
    expect(json.data.cascadeSource).toBe("operator_default")
    // Idempotent: no activity-log insert because the schedule already existed.
    expect(stub.calls.inserts).toHaveLength(0)
    expect(options.readPolicySourceFromInternalNotes).toHaveBeenCalled()
  })
})
