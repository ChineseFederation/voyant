/**
 * The periodic return on contracts in progress and unperformed services, end to
 * end over real Postgres (voyant#4704).
 *
 * The dataset is a modelled view across three grains — booking, booking item and
 * payment — so a fixture-driven unit test would only prove the compiler works.
 * What has to be true is that the SQL selects the right contracts and nets the
 * right money, and only a database can say so.
 *
 * The scenario is the worked month from the issue, including each edge case it
 * asked to have encoded rather than rediscovered.
 */

import { bookingItems, bookings } from "@voyant-travel/bookings/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { financeUnperformedServicesDataset } from "../../src/reporting-unperformed-services.js"
import { invoices, payments } from "../../src/schema.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

/** The operator reports in lei and applies a 2% currency-risk commission. */
const REPORTING_CURRENCY = "RON"
/** BNR's EUR/RON quote for the period, with the margin already folded in. */
const APPLIED_RATE = 5.352144

const PERIOD = { periodStart: "2026-08-01", periodEnd: "2026-08-31" }

const lei = (eurCents: number) => Math.round(eurCents * APPLIED_RATE)

describe.skipIf(!DB_AVAILABLE)("unperformed services report", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>
  let rateSetId: string

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
    rateSetId = await seedRateSet()
    await seedScenario()
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  async function seedRateSet() {
    const id = newId("fx_rate_sets")
    await db.execute(sql`
      INSERT INTO fx_rate_sets (id, source, base_currency, effective_at, observed_at)
      VALUES (${id}, 'bnr', ${REPORTING_CURRENCY}, '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z')
    `)
    await db.execute(sql`
      INSERT INTO exchange_rates (
        id, fx_rate_set_id, base_currency, quote_currency,
        rate_decimal, inverse_rate_decimal, effective_rate_decimal, commission_bps, observed_at
      ) VALUES (
        ${newId("exchange_rates")}, ${id}, 'EUR', ${REPORTING_CURRENCY},
        '5.24720000', '0.19057800', '5.35214400', 200, '2026-08-01T00:00:00Z'
      )
    `)
    return id
  }

  /** One contract, its invoice, and optionally a collection against it. */
  async function seedContract(input: {
    number: string
    confirmedAt: string
    serviceDate: string
    sellCents: number
    status?: "confirmed" | "cancelled"
    /** Omit to leave the contract unstamped — no document has converted it. */
    stamped?: boolean
    payments?: Array<{ date: string; cents: number; status: "completed" | "refunded" }>
    /** Money paid back the way the product actually records it. */
    refundSettlements?: Array<{ date: string; cents: number; status: "settled" | "pending" }>
  }) {
    const bookingId = newId("bookings")
    await db.insert(bookings).values({
      id: bookingId,
      bookingNumber: input.number,
      status: input.status ?? "confirmed",
      sellCurrency: "EUR",
      sellAmountCents: input.sellCents,
      confirmedAt: new Date(`${input.confirmedAt}T10:00:00Z`),
      contactFirstName: "Ada",
      contactLastName: input.number,
    })
    await db.insert(bookingItems).values({
      id: newId("booking_items"),
      bookingId,
      title: "Package",
      itemType: "unit",
      status: input.status === "cancelled" ? "cancelled" : "confirmed",
      quantity: 1,
      sellCurrency: "EUR",
      totalSellAmountCents: input.sellCents,
      serviceDate: input.serviceDate,
    })

    const invoiceId = newId("invoices")
    const stamped = input.stamped ?? true
    await db.insert(invoices).values({
      id: invoiceId,
      invoiceNumber: `INV-${input.number}`,
      bookingId,
      status: "issued",
      currency: "EUR",
      subtotalCents: input.sellCents,
      totalCents: input.sellCents,
      balanceDueCents: input.sellCents,
      issueDate: input.confirmedAt,
      dueDate: input.confirmedAt,
      ...(stamped
        ? {
            baseCurrency: REPORTING_CURRENCY,
            fxRateSetId: rateSetId,
            baseSubtotalCents: lei(input.sellCents),
            baseTotalCents: lei(input.sellCents),
          }
        : {}),
    })

    const paymentIds: string[] = []
    for (const payment of input.payments ?? []) {
      const paymentId = newId("payments")
      paymentIds.push(paymentId)
      await db.insert(payments).values({
        id: paymentId,
        invoiceId,
        amountCents: payment.cents,
        currency: "EUR",
        paymentMethod: "bank_transfer",
        paymentDate: payment.date,
        status: payment.status,
        reportingCurrency: REPORTING_CURRENCY,
        reportingAmountCents: lei(payment.cents),
        reportingFxRateSetId: rateSetId,
      })
    }
    for (const settlement of input.refundSettlements ?? []) {
      await db.execute(sql`
        INSERT INTO refund_settlements (
          id, payment_id, invoice_id, booking_id, method, status,
          amount_cents, currency, settled_at
        ) VALUES (
          ${newId("refund_settlements")}, ${paymentIds[0] ?? null}, ${invoiceId}, ${bookingId},
          'bank_transfer', ${settlement.status},
          ${settlement.cents}, 'EUR',
          ${settlement.status === "settled" ? `${settlement.date}T12:00:00Z` : null}
        )
      `)
    }
    return bookingId
  }

  async function seedScenario() {
    // Runs after the period — squarely in progress.
    await seedContract({
      number: "C1",
      confirmedAt: "2026-07-10",
      serviceDate: "2026-10-05",
      sellCents: 200_000,
      payments: [{ date: "2026-07-20", cents: 60_000, status: "completed" }],
    })
    // Collected in full before the period ends: still in progress, but its money
    // is no longer an advance against a balance.
    await seedContract({
      number: "C2",
      confirmedAt: "2026-08-02",
      serviceDate: "2026-09-15",
      sellCents: 100_000,
      payments: [{ date: "2026-08-03", cents: 100_000, status: "completed" }],
    })
    // Ran inside the period, then cancelled and fully refunded. Contributes a
    // contract and its value, and zero advances.
    await seedContract({
      number: "C3",
      confirmedAt: "2026-06-01",
      serviceDate: "2026-08-20",
      sellCents: 50_000,
      status: "cancelled",
      payments: [
        { date: "2026-06-05", cents: 50_000, status: "completed" },
        { date: "2026-08-25", cents: 50_000, status: "refunded" },
      ],
    })
    // Finished before the period began — out of scope.
    await seedContract({
      number: "OUT-PERFORMED",
      confirmedAt: "2026-05-01",
      serviceDate: "2026-06-30",
      sellCents: 999_000,
      payments: [{ date: "2026-05-02", cents: 999_000, status: "completed" }],
    })
    // Concluded after the period ended — out of scope even though it runs later.
    await seedContract({
      number: "OUT-LATE",
      confirmedAt: "2026-09-15",
      serviceDate: "2026-11-01",
      sellCents: 888_000,
    })
  }

  async function run(select: string[], parameters: Record<string, string> = PERIOD) {
    return financeUnperformedServicesDataset.execute(
      { db, grantedScopes: ["finance:read"] },
      {
        query: {
          dataset: { id: "finance.unperformed-services", version: 1 },
          select: select.map((field) => ({ kind: "field" as const, field })),
          filters: [],
          groupBy: [],
          orderBy: [{ by: "bookingNumber", direction: "ascending" as const }],
        },
        parameters,
        maximumRows: 100,
      },
    )
  }

  it("counts contracts concluded by period end whose services are not finished by it", async () => {
    const result = await run(["bookingNumber"])
    expect(result.rows.map((row) => row.bookingNumber)).toEqual(["C1", "C2", "C3"])
  })

  it("values contracts at the rate their own documents were stamped with", async () => {
    const result = await run(["bookingNumber", "fxRateApplied", "contractValueReportingCents"])
    const byNumber = new Map(result.rows.map((row) => [row.bookingNumber, row]))

    // 2000.00 EUR × 5.352144 = 10704.29 RON, at the applied rate — not the
    // published 5.2472, which would be 10494.40 and is not what was invoiced.
    expect(byNumber.get("C1")?.fxRateApplied).toBeCloseTo(APPLIED_RATE, 6)
    expect(byNumber.get("C1")?.contractValueReportingCents).toBe(lei(200_000))
    expect(byNumber.get("C2")?.contractValueReportingCents).toBe(lei(100_000))
  })

  it("reports both readings of an advance, and they differ", async () => {
    const result = await run([
      "bookingNumber",
      "advancesStrictReportingCents",
      "collectionsTotalReportingCents",
    ])
    const byNumber = new Map(result.rows.map((row) => [row.bookingNumber, row]))

    // C1 owes a balance, so its deposit is an advance under both readings.
    expect(byNumber.get("C1")?.advancesStrictReportingCents).toBe(lei(60_000))
    expect(byNumber.get("C1")?.collectionsTotalReportingCents).toBe(lei(60_000))

    // C2 is collected in full: money on a running contract, but not money
    // against a balance still owed. This is the difference the issue warns is
    // material, and why both ship labelled instead of the platform choosing.
    expect(byNumber.get("C2")?.advancesStrictReportingCents).toBe(0)
    expect(byNumber.get("C2")?.collectionsTotalReportingCents).toBe(lei(100_000))
  })

  it("nets a cancelled, refunded departure to zero advances while keeping its value", async () => {
    const result = await run([
      "bookingNumber",
      "status",
      "contractValueReportingCents",
      "collectionsTotalReportingCents",
    ])
    const cancelled = result.rows.find((row) => row.bookingNumber === "C3")

    expect(cancelled?.status).toBe("cancelled")
    expect(cancelled?.contractValueReportingCents).toBe(lei(50_000))
    expect(cancelled?.collectionsTotalReportingCents).toBe(0)
  })

  it("counts collections up to period end, not after it", async () => {
    // C3's refund lands on 2026-08-25. Cut the period short and the refund has
    // not happened yet, so its collection still stands.
    const result = await run(["bookingNumber", "collectionsTotalReportingCents"], {
      periodStart: "2026-08-01",
      periodEnd: "2026-08-10",
    })
    const cancelled = result.rows.find((row) => row.bookingNumber === "C3")
    expect(cancelled?.collectionsTotalReportingCents).toBe(lei(50_000))
  })

  it("derives the balance the return exists to measure", async () => {
    const result = await run(["bookingNumber", "balanceReportingCents"])
    const byNumber = new Map(result.rows.map((row) => [row.bookingNumber, row]))

    expect(byNumber.get("C1")?.balanceReportingCents).toBe(lei(200_000) - lei(60_000))
    expect(byNumber.get("C2")?.balanceReportingCents).toBe(0)
  })

  it("reports an unstamped contract as unconverted rather than converting it now", async () => {
    await seedContract({
      number: "C4-UNSTAMPED",
      confirmedAt: "2026-08-05",
      serviceDate: "2026-12-01",
      sellCents: 70_000,
      stamped: false,
    })

    const result = await run(["bookingNumber", "contractValueReportingCents"])
    const unstamped = result.rows.find((row) => row.bookingNumber === "C4-UNSTAMPED")

    // No document has converted this contract, so there is no authoritative
    // figure. Looking a rate up now is precisely what voyant#4703 exists to
    // stop, so the row is null and the total says it is short.
    expect(unstamped?.contractValueReportingCents).toBeNull()
    expect(result.warnings.join(" ")).toContain("no stamped reporting-currency value")
  })

  it("flags a fiscal invoice with no collection recorded against it", async () => {
    // A fiscal invoice, unlike a proforma, means the money was taken. A gap
    // against recorded payments is a missing payment record — surfaced so the
    // operator can fix it, rather than counted as collected on its say-so or
    // silently ignored.
    await seedContract({
      number: "C5-INVOICED",
      confirmedAt: "2026-08-06",
      serviceDate: "2026-11-20",
      sellCents: 30_000,
    })

    const result = await run([
      "bookingNumber",
      "collectionsTotalReportingCents",
      "invoicedNotCollectedReportingCents",
    ])
    const flagged = result.rows.find((row) => row.bookingNumber === "C5-INVOICED")

    expect(flagged?.collectionsTotalReportingCents).toBe(0)
    expect(flagged?.invoicedNotCollectedReportingCents).toBe(lei(30_000))

    // A contract whose payments match its invoice is not flagged.
    const settled = result.rows.find((row) => row.bookingNumber === "C2")
    expect(settled?.invoicedNotCollectedReportingCents).toBe(0)
  })

  it("nets a refund recorded the way the product records it", async () => {
    // The refund workflow writes a settled `refund_settlements` row and leaves
    // the payment `completed`. Netting only payments marked `refunded` would
    // report this contract as fully collected — the exact case the return
    // exists to get right, and the one the original fixture papered over by
    // hand-inserting a synthetic refunded payment.
    await seedContract({
      number: "C6-SETTLED-REFUND",
      confirmedAt: "2026-07-01",
      serviceDate: "2026-09-10",
      sellCents: 80_000,
      payments: [{ date: "2026-07-02", cents: 80_000, status: "completed" }],
      refundSettlements: [{ date: "2026-08-12", cents: 80_000, status: "settled" }],
    })

    const result = await run(["bookingNumber", "collectionsTotalReportingCents"])
    const refunded = result.rows.find((row) => row.bookingNumber === "C6-SETTLED-REFUND")
    expect(refunded?.collectionsTotalReportingCents).toBe(0)
  })

  it("ignores a refund that has not settled, and one settled after period end", async () => {
    await seedContract({
      number: "C7-PENDING-REFUND",
      confirmedAt: "2026-07-01",
      serviceDate: "2026-09-10",
      sellCents: 40_000,
      payments: [{ date: "2026-07-02", cents: 40_000, status: "completed" }],
      refundSettlements: [{ date: "2026-08-12", cents: 40_000, status: "pending" }],
    })
    await seedContract({
      number: "C8-LATE-REFUND",
      confirmedAt: "2026-07-01",
      serviceDate: "2026-09-10",
      sellCents: 40_000,
      payments: [{ date: "2026-07-02", cents: 40_000, status: "completed" }],
      refundSettlements: [{ date: "2026-09-20", cents: 40_000, status: "settled" }],
    })

    const result = await run(["bookingNumber", "collectionsTotalReportingCents"])
    const byNumber = new Map(result.rows.map((row) => [row.bookingNumber, row]))
    // Money that has not moved is still collected.
    expect(byNumber.get("C7-PENDING-REFUND")?.collectionsTotalReportingCents).toBe(lei(40_000))
    // And a refund after period end had not happened yet at period end.
    expect(byNumber.get("C8-LATE-REFUND")?.collectionsTotalReportingCents).toBe(lei(40_000))
  })

  it("does not inflate the invoiced figure for an installment-paid contract", async () => {
    // Joining invoices to payments fans the invoice out once per payment. Summed
    // naively, a three-installment contract counts its invoice three times and
    // invents a collection gap twice its value.
    await seedContract({
      number: "C9-INSTALMENTS",
      confirmedAt: "2026-07-05",
      serviceDate: "2026-10-10",
      sellCents: 90_000,
      payments: [
        { date: "2026-07-06", cents: 30_000, status: "completed" },
        { date: "2026-07-20", cents: 30_000, status: "completed" },
        { date: "2026-08-04", cents: 30_000, status: "completed" },
      ],
    })

    const result = await run([
      "bookingNumber",
      "collectionsTotalReportingCents",
      "invoicedNotCollectedReportingCents",
    ])
    const instalments = result.rows.find((row) => row.bookingNumber === "C9-INSTALMENTS")

    expect(instalments?.collectionsTotalReportingCents).toBe(lei(30_000) * 3)
    // Fully collected across three payments: no gap.
    expect(instalments?.invoicedNotCollectedReportingCents).toBe(0)
  })

  it("warns on an aggregate total, where a null row is invisible", async () => {
    // This is the shape the KPI widgets use. `sum` skips nulls and the compiler
    // coalesces an all-null sum to zero, so inspecting the returned rows for a
    // null can never detect the shortfall here — the relation has to be asked.
    const result = await financeUnperformedServicesDataset.execute(
      { db, grantedScopes: ["finance:read"] },
      {
        query: {
          dataset: { id: "finance.unperformed-services", version: 1 },
          select: [
            { kind: "field" as const, field: "reportingCurrency" },
            {
              kind: "aggregate" as const,
              operation: "sum" as const,
              field: "contractValueReportingCents",
              as: "contractValueReportingCents",
            },
          ],
          filters: [],
          groupBy: [{ field: "reportingCurrency" }],
          orderBy: [],
        },
        parameters: PERIOD,
        maximumRows: 100,
      },
    )

    // The unstamped contract seeded earlier contributes nothing to the sum and
    // no null row to inspect, so the total is short and only the warning says so.
    expect(result.rows.every((row) => row.contractValueReportingCents !== null)).toBe(true)
    expect(result.warnings.join(" ")).toMatch(/contracts have no stamped reporting-currency value/)
  })

  it("does not warn on a figure stamping cannot shorten", async () => {
    const result = await financeUnperformedServicesDataset.execute(
      { db, grantedScopes: ["finance:read"] },
      {
        query: {
          dataset: { id: "finance.unperformed-services", version: 1 },
          select: [{ kind: "aggregate" as const, operation: "count" as const, as: "contracts" }],
          filters: [],
          groupBy: [],
          orderBy: [],
        },
        parameters: PERIOD,
        maximumRows: 100,
      },
    )
    // A contract count is complete whether or not the contract is stamped.
    expect(result.warnings).toEqual([])
  })

  it("refuses a period it was not given", async () => {
    await expect(run(["bookingNumber"], { periodStart: "2026-08-01" })).rejects.toThrow(
      /periodEnd is required/,
    )
    await expect(
      run(["bookingNumber"], { periodStart: "2026-08-31", periodEnd: "2026-08-01" }),
    ).rejects.toThrow(/must not precede/)
  })
})
