// agent-quality: file-size exception -- owner: finance; existing coverage file stays co-located until a dedicated split preserves behavior and tests.
/**
 * Per-departure / per-product profitability read model (RFC §8):
 *  - revenue = issued customer invoices, split across a booking's departures by
 *    booked sell amount; credit notes net it down, proforma/draft/void excluded
 *  - actual cost = departure/product-targeted supplier_cost_allocations
 *  - planned cost = booking_items.totalCostAmountCents; variance = planned − actual
 *  - rows are emitted per currency and never summed across currencies
 */

import { bookingItems, bookings, bookingTravelers } from "@voyant-travel/bookings/schema"
import { sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { exchangeRatesRef } from "../../src/markets-ref.js"
import { invoices } from "../../src/schema.js"
import { financeService } from "../../src/service.js"
import { supplierInvoicesService } from "../../src/service-supplier-invoices.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

// Seeding a scenario here means real inserts across bookings, invoices and
// several supplier invoices, which comfortably outruns the 5s default. A test
// that trips that limit does not stop its in-flight queries, so its writes land
// after the next test's `cleanupTestDb` and corrupt an unrelated assertion —
// give the bodies the same headroom the hooks already have.
vi.setConfig({ testTimeout: 60_000 })

let seq = 0
const next = () => {
  seq += 1
  return seq
}

async function seedSupplierCost(
  // biome-ignore lint/suspicious/noExplicitAny: test db typing -- owner: finance; existing suppression is intentional pending typed cleanup.
  db: any,
  opts: {
    currency: string
    serviceType: "transport" | "flight" | "guide" | "other"
    amountCents: number
    costCategoryId?: string
    target: { targetType: "departure"; departureId: string } | { targetType: "unattributed" }
    /**
     * Allocate less than the invoice total. `validateAllocations` permits this
     * and stores nothing for the leftover, so the remainder only exists as
     * arithmetic on the invoice.
     */
    allocateCents?: number
  },
) {
  const created = await supplierInvoicesService.create(db, {
    supplierId: "supp_test",
    supplierInvoiceNo: `SINV-PROF-${String(next()).padStart(5, "0")}`,
    currency: opts.currency,
    issueDate: "2026-06-01",
    status: "approved",
    lines: [
      {
        description: opts.serviceType,
        serviceType: opts.serviceType,
        costCategoryId: opts.costCategoryId ?? null,
        quantity: 1,
        unitAmountCents: opts.amountCents,
        taxAmountCents: 0,
        totalAmountCents: opts.amountCents,
        sortOrder: 0,
      },
    ],
  })
  const id = created?.id as string
  const lineId = created?.lines?.[0]?.id as string
  const allocateCents = opts.allocateCents ?? opts.amountCents
  if (allocateCents > 0) {
    await supplierInvoicesService.setAllocations(db, id, {
      allocations: [
        opts.target.targetType === "departure"
          ? {
              targetType: "departure",
              departureId: opts.target.departureId,
              supplierInvoiceLineId: lineId,
              amountCents: allocateCents,
            }
          : {
              targetType: "unattributed",
              supplierInvoiceLineId: lineId,
              amountCents: allocateCents,
            },
      ],
    })
  }
  return id
}

describe.skipIf(!DB_AVAILABLE)("profitability read model", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test db typing -- owner: finance; existing suppression is intentional pending typed cleanup.
  let db: any

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
  })

  beforeEach(async () => {
    seq = 0
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    // `supplier_invoices.supplierId` is validated against `suppliers` whenever
    // that table exists, so every supplier invoice below needs a real row.
    await db.execute(
      sql`insert into suppliers (id, name, type) values ('supp_test', 'Test Supplier', 'other')`,
    )
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  async function seedBaseScenario() {
    // B1: one item on D1 (EUR). B2: two items split across D1 + D2 (EUR).
    await db.insert(bookings).values([
      {
        id: "book_b1",
        bookingNumber: "BKG-B1",
        status: "confirmed",
        sellCurrency: "EUR",
        startDate: "2026-07-01",
      },
      {
        id: "book_b2",
        bookingNumber: "BKG-B2",
        status: "confirmed",
        sellCurrency: "EUR",
        startDate: "2026-07-01",
      },
    ])
    await db.insert(bookingItems).values([
      {
        bookingId: "book_b1",
        title: "Tour P1",
        status: "confirmed",
        availabilitySlotId: "avsl_d1",
        productId: "prod_p1",
        productNameSnapshot: "Tour P1",
        departureLabelSnapshot: "P1 · Jul 1",
        startsAt: new Date("2026-07-01T09:00:00Z"),
        quantity: 1,
        sellCurrency: "EUR",
        totalSellAmountCents: 100000,
        costCurrency: "EUR",
        totalCostAmountCents: 60000,
      },
      {
        bookingId: "book_b2",
        title: "Tour P1",
        status: "confirmed",
        availabilitySlotId: "avsl_d1",
        productId: "prod_p1",
        productNameSnapshot: "Tour P1",
        departureLabelSnapshot: "P1 · Jul 1",
        startsAt: new Date("2026-07-01T09:00:00Z"),
        quantity: 1,
        sellCurrency: "EUR",
        totalSellAmountCents: 50000,
        costCurrency: "EUR",
        totalCostAmountCents: 30000,
      },
      {
        bookingId: "book_b2",
        title: "Tour P1",
        status: "confirmed",
        availabilitySlotId: "avsl_d2",
        productId: "prod_p1",
        productNameSnapshot: "Tour P1",
        departureLabelSnapshot: "P1 · Jul 8",
        startsAt: new Date("2026-07-08T09:00:00Z"),
        quantity: 1,
        sellCurrency: "EUR",
        totalSellAmountCents: 50000,
        costCurrency: "EUR",
        totalCostAmountCents: 30000,
      },
    ])
    await db.insert(invoices).values([
      {
        invoiceNumber: "INV-B1",
        invoiceType: "invoice",
        status: "issued",
        bookingId: "book_b1",
        currency: "EUR",
        totalCents: 100000,
        paidCents: 0,
        balanceDueCents: 100000,
        issueDate: "2026-06-15",
        dueDate: "2026-06-30",
      },
      {
        invoiceNumber: "INV-B2",
        invoiceType: "invoice",
        status: "issued",
        bookingId: "book_b2",
        currency: "EUR",
        totalCents: 100000,
        paidCents: 0,
        balanceDueCents: 100000,
        issueDate: "2026-06-15",
        dueDate: "2026-06-30",
      },
    ])
    // Cost categories drive the breakdown (configurable; replaces fixed service types).
    const transportCat = await financeService.costCategories.create(db, { name: "Transport" })
    const guideCat = await financeService.costCategories.create(db, { name: "Guides" })
    // Actual supplier costs: D1 70000 EUR, D2 40000 EUR, D1 20000 RON, plus 5000 EUR unattributed.
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "transport",
      costCategoryId: transportCat.id,
      amountCents: 70000,
      target: { targetType: "departure", departureId: "avsl_d1" },
    })
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "guide",
      costCategoryId: guideCat.id,
      amountCents: 40000,
      target: { targetType: "departure", departureId: "avsl_d2" },
    })
    await seedSupplierCost(db, {
      currency: "RON",
      serviceType: "transport",
      costCategoryId: transportCat.id,
      amountCents: 20000,
      target: { targetType: "departure", departureId: "avsl_d1" },
    })
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "other",
      amountCents: 5000,
      target: { targetType: "unattributed" },
    })
  }

  it("computes per-departure P&L with proportional revenue split and per-currency rows", async () => {
    await seedBaseScenario()
    const report = await financeService.getDepartureProfitability(db, {})

    const d1Eur = report.rows.find((r) => r.departureId === "avsl_d1" && r.currency === "EUR")
    expect(d1Eur).toMatchObject({
      revenueCents: 150000, // B1 100000 + B2 split 50% of 100000
      actualCostCents: 70000,
      plannedCostCents: 90000, // 60000 + 30000
      profitCents: 80000,
      varianceCents: 20000,
      productName: "Tour P1",
      departureDate: "2026-07-01",
    })
    expect(d1Eur?.marginPercent).toBeCloseTo(53.3, 1)

    const d2Eur = report.rows.find((r) => r.departureId === "avsl_d2" && r.currency === "EUR")
    expect(d2Eur).toMatchObject({
      revenueCents: 50000,
      actualCostCents: 40000,
      plannedCostCents: 30000,
      profitCents: 10000,
      varianceCents: -10000,
    })
    expect(d2Eur?.marginPercent).toBeCloseTo(20, 1)

    // RON cost on D1 is its own row — never summed with the EUR figures.
    const d1Ron = report.rows.find((r) => r.departureId === "avsl_d1" && r.currency === "RON")
    expect(d1Ron).toMatchObject({
      revenueCents: 0,
      actualCostCents: 20000,
      profitCents: -20000,
      marginPercent: null,
    })

    expect(report.unattributed).toContainEqual({ currency: "EUR", amountCents: 5000 })
    // Every seeded invoice is allocated in full, so there is no remainder — the
    // explicitly-unattributed 5000 EUR must not leak into this figure.
    expect(report.unallocated).toEqual([])
    // Breakdown is by configurable cost category name.
    expect(report.costByServiceType).toContainEqual({
      serviceType: "Transport",
      currency: "EUR",
      amountCents: 70000,
    })
    expect(report.costByServiceType).toContainEqual({
      serviceType: "Guides",
      currency: "EUR",
      amountCents: 40000,
    })
  })

  it("rolls up profitability per product across departures", async () => {
    await seedBaseScenario()
    const report = await financeService.getProductProfitability(db, {})

    const p1Eur = report.rows.find((r) => r.productId === "prod_p1" && r.currency === "EUR")
    expect(p1Eur).toMatchObject({
      departureCount: 2,
      revenueCents: 200000, // 150000 + 50000
      actualCostCents: 110000, // 70000 + 40000
      plannedCostCents: 120000,
      profitCents: 90000,
      varianceCents: 10000,
    })
    expect(p1Eur?.marginPercent).toBeCloseTo(45, 1)

    const p1Ron = report.rows.find((r) => r.productId === "prod_p1" && r.currency === "RON")
    expect(p1Ron).toMatchObject({ actualCostCents: 20000, revenueCents: 0, departureCount: 1 })
  })

  it("excludes proforma/draft/void invoices and nets credit notes", async () => {
    await db.insert(bookings).values({
      id: "book_c",
      bookingNumber: "BKG-C",
      status: "confirmed",
      sellCurrency: "EUR",
      startDate: "2026-07-01",
    })
    await db.insert(bookingItems).values({
      bookingId: "book_c",
      title: "Tour C",
      status: "confirmed",
      availabilitySlotId: "avsl_c",
      productId: "prod_c",
      startsAt: new Date("2026-07-01T09:00:00Z"),
      quantity: 1,
      sellCurrency: "EUR",
      totalSellAmountCents: 100000,
      costCurrency: "EUR",
      totalCostAmountCents: 50000,
    })
    await db.insert(invoices).values([
      {
        invoiceNumber: "INV-C-ISSUED",
        invoiceType: "invoice",
        status: "issued",
        bookingId: "book_c",
        currency: "EUR",
        totalCents: 100000,
        paidCents: 0,
        balanceDueCents: 100000,
        issueDate: "2026-06-15",
        dueDate: "2026-06-30",
      },
      {
        invoiceNumber: "INV-C-DRAFT",
        invoiceType: "invoice",
        status: "draft",
        bookingId: "book_c",
        currency: "EUR",
        totalCents: 999900,
        paidCents: 0,
        balanceDueCents: 999900,
        issueDate: "2026-06-15",
        dueDate: "2026-06-30",
      },
      {
        invoiceNumber: "INV-C-VOID",
        invoiceType: "invoice",
        status: "void",
        bookingId: "book_c",
        currency: "EUR",
        totalCents: 999900,
        paidCents: 0,
        balanceDueCents: 0,
        issueDate: "2026-06-15",
        dueDate: "2026-06-30",
      },
      {
        invoiceNumber: "INV-C-PROFORMA",
        invoiceType: "proforma",
        status: "issued",
        bookingId: "book_c",
        currency: "EUR",
        totalCents: 999900,
        paidCents: 0,
        balanceDueCents: 999900,
        issueDate: "2026-06-15",
        dueDate: "2026-06-30",
      },
      {
        invoiceNumber: "CN-C",
        invoiceType: "credit_note",
        status: "issued",
        bookingId: "book_c",
        currency: "EUR",
        totalCents: 30000,
        paidCents: 0,
        balanceDueCents: 0,
        issueDate: "2026-06-20",
        dueDate: "2026-06-20",
      },
    ])

    const report = await financeService.getDepartureProfitability(db, {})
    const row = report.rows.find((r) => r.departureId === "avsl_c" && r.currency === "EUR")
    // 100000 issued − 30000 credit note; draft/void/proforma ignored.
    expect(row?.revenueCents).toBe(70000)
  })

  it("filters departures by date range and currency", async () => {
    await seedBaseScenario()
    const onlyD2 = await financeService.getDepartureProfitability(db, { from: "2026-07-05" })
    expect(onlyD2.rows.every((r) => r.departureId === "avsl_d2")).toBe(true)

    const onlyRon = await financeService.getDepartureProfitability(db, { currency: "RON" })
    expect(onlyRon.rows.every((r) => r.currency === "RON")).toBe(true)
    expect(onlyRon.rows.length).toBeGreaterThan(0)
  })

  it("rolls up into the accounting base (RON), converting legacy residuals at the fallback rate", async () => {
    await seedBaseScenario()
    // 1 RON = 0.2 EUR, so EUR→RON = 5. fx_rate_sets lives in @voyant-travel/commerce
    // (seed via raw SQL). The scenario's supplier costs were created BEFORE this
    // rate existed, so EUR rows have no base snapshot → they take the fallback.
    await db.execute(
      sql`insert into fx_rate_sets (id, base_currency, effective_at) values ('fxrs_test', 'EUR', now())`,
    )
    await db.insert(exchangeRatesRef).values({
      fxRateSetId: "fxrs_test",
      baseCurrency: "RON",
      quoteCurrency: "EUR",
      rateDecimal: "0.2",
      createdAt: new Date("2026-06-01T00:00:00Z"),
    })

    // No base currency is passed — the rollup is always the operator accounting
    // base (default RON). RON costs were snapshotted at create (rate 1); EUR rows
    // are residual and convert at EUR→RON = 5.
    const report = await financeService.getDepartureProfitability(db, {})
    expect(report.base?.currency).toBe("RON")
    expect(report.base?.unconvertibleCurrencies).toEqual([])

    // D1 actual = 20000 RON (snapshot) + 70000 EUR × 5 = 370000 RON.
    const d1 = report.base?.rows.find((r) => r.departureId === "avsl_d1")
    expect(d1).toMatchObject({
      currency: "RON",
      revenueCents: 750000, // 150000 EUR × 5
      actualCostCents: 370000, // 20000 RON + 70000 EUR × 5
      plannedCostCents: 450000, // 90000 EUR × 5
      profitCents: 380000,
      varianceCents: 80000,
    })

    expect(report.base?.costByServiceType).toContainEqual({
      serviceType: "Transport",
      currency: "RON",
      amountCents: 370000, // 20000 RON snapshot + 70000 EUR × 5
    })
    expect(report.base?.unattributedCents).toBe(25000) // 5000 EUR × 5
  })

  it("flags unconvertible currencies but still counts base snapshots", async () => {
    await seedBaseScenario()
    // No EUR→RON rate anywhere → EUR residuals are unconvertible and dropped, but
    // the RON supplier cost was snapshotted at create and still counts.
    const report = await financeService.getDepartureProfitability(db, {})
    expect(report.base?.currency).toBe("RON")
    expect(report.base?.unconvertibleCurrencies.sort()).toEqual(["EUR"])

    const d1 = report.base?.rows.find((r) => r.departureId === "avsl_d1")
    expect(d1?.actualCostCents).toBe(20000) // RON snapshot survives
    expect(d1?.revenueCents).toBe(0) // EUR revenue dropped (no rate)
  })

  it("snapshots AP base at the issue-date rate, immune to later rate changes", async () => {
    // Rate effective on the issue date: EUR→RON = 5.
    await db.execute(
      sql`insert into fx_rate_sets (id, base_currency, effective_at) values ('fxrs_issue', 'RON', now())`,
    )
    await db.insert(exchangeRatesRef).values({
      fxRateSetId: "fxrs_issue",
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      rateDecimal: "5",
      observedAt: new Date("2026-06-01T00:00:00Z"),
      createdAt: new Date("2026-06-01T00:00:00Z"),
    })

    // Create a EUR supplier cost on the issue date → snapshots base at rate 5.
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "transport",
      amountCents: 100000,
      target: { targetType: "departure", departureId: "avsl_fx" },
    })

    const created = await supplierInvoicesService.list(db, {
      sortBy: "issueDate",
      sortDir: "desc",
      limit: 50,
      offset: 0,
    })
    const invoice = created.data[0]
    expect(invoice?.baseCurrency).toBe("RON")
    expect(invoice?.baseTotalCents).toBe(500000) // 100000 EUR × 5

    // A LATER, different rate must not change the recorded snapshot.
    await db.execute(
      sql`insert into fx_rate_sets (id, base_currency, effective_at) values ('fxrs_late', 'RON', now())`,
    )
    await db.insert(exchangeRatesRef).values({
      fxRateSetId: "fxrs_late",
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      rateDecimal: "10",
      observedAt: new Date("2026-09-01T00:00:00Z"),
      createdAt: new Date("2026-09-01T00:00:00Z"),
    })

    const report = await financeService.getDepartureProfitability(db, {})
    const row = report.base?.rows.find((r) => r.departureId === "avsl_fx")
    // 500000 (issue-date snapshot), NOT 1,000,000 (latest rate).
    expect(row?.actualCostCents).toBe(500000)
  })

  it("surfaces an under-allocated invoice's remainder, distinct from explicit unattributed cost", async () => {
    await seedBaseScenario()
    // 100000 EUR invoiced, only 60000 allocated to D1: 40000 is unaccounted for
    // and, before this figure existed, silently inflated D1's margin.
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "transport",
      amountCents: 100000,
      allocateCents: 60000,
      target: { targetType: "departure", departureId: "avsl_d1" },
    })

    const report = await financeService.getDepartureProfitability(db, {})

    // Only the allocated part is attributed to the departure.
    const d1Eur = report.rows.find((r) => r.departureId === "avsl_d1" && r.currency === "EUR")
    expect(d1Eur?.actualCostCents).toBe(130000) // 70000 fully allocated + 60000 partial

    // The remainder surfaces on its own, and does NOT merge with the 5000 EUR
    // that was deliberately allocated to `unattributed`.
    expect(report.unallocated).toEqual([{ currency: "EUR", amountCents: 40000 }])
    expect(report.unattributed).toContainEqual({ currency: "EUR", amountCents: 5000 })

    // The product rollup reports the same two figures.
    const products = await financeService.getProductProfitability(db, {})
    expect(products.unallocated).toEqual([{ currency: "EUR", amountCents: 40000 }])
    expect(products.unattributed).toContainEqual({ currency: "EUR", amountCents: 5000 })
  })

  it("counts an invoice with no allocations at all as fully unallocated", async () => {
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "other",
      amountCents: 25000,
      allocateCents: 0,
      target: { targetType: "unattributed" },
    })

    const report = await financeService.getDepartureProfitability(db, {})
    expect(report.unallocated).toEqual([{ currency: "EUR", amountCents: 25000 }])
    expect(report.unattributed).toEqual([])
  })

  it("keeps remainders in separate per-currency buckets and filters with the rest", async () => {
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "transport",
      amountCents: 100000,
      allocateCents: 60000,
      target: { targetType: "departure", departureId: "avsl_d1" },
    })
    await seedSupplierCost(db, {
      currency: "RON",
      serviceType: "guide",
      amountCents: 50000,
      allocateCents: 12500,
      target: { targetType: "departure", departureId: "avsl_d1" },
    })

    const report = await financeService.getDepartureProfitability(db, {})
    expect([...report.unallocated].sort((a, b) => a.currency.localeCompare(b.currency))).toEqual([
      { currency: "EUR", amountCents: 40000 },
      { currency: "RON", amountCents: 37500 },
    ])

    // The currency filter applies to the remainder exactly as to every other
    // per-currency figure — RON amounts are never folded into a EUR view.
    const onlyRon = await financeService.getDepartureProfitability(db, { currency: "RON" })
    expect(onlyRon.unallocated).toEqual([{ currency: "RON", amountCents: 37500 }])
  })

  it("excludes void and soft-deleted invoices from the remainder", async () => {
    const voidedId = await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "other",
      amountCents: 80000,
      allocateCents: 0,
      target: { targetType: "unattributed" },
    })
    const deletedId = await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "other",
      amountCents: 90000,
      allocateCents: 0,
      target: { targetType: "unattributed" },
    })
    await supplierInvoicesService.update(db, voidedId, { status: "void" })
    await supplierInvoicesService.softDelete(db, deletedId)

    const report = await financeService.getDepartureProfitability(db, {})
    expect(report.unallocated).toEqual([])
  })

  it("converts the remainder at the invoice's own issue-date rate, not the latest one", async () => {
    // EUR→RON = 5 on the issue date, so a EUR invoice snapshots its base then.
    await db.execute(
      sql`insert into fx_rate_sets (id, base_currency, effective_at) values ('fxrs_rem', 'RON', now())`,
    )
    await db.insert(exchangeRatesRef).values({
      fxRateSetId: "fxrs_rem",
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      rateDecimal: "5",
      observedAt: new Date("2026-06-01T00:00:00Z"),
      createdAt: new Date("2026-06-01T00:00:00Z"),
    })

    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "transport",
      amountCents: 100000,
      allocateCents: 60000,
      target: { targetType: "departure", departureId: "avsl_rem" },
    })

    // A later, different rate must not re-value the snapshotted remainder.
    await db.execute(
      sql`insert into fx_rate_sets (id, base_currency, effective_at) values ('fxrs_rem_late', 'RON', now())`,
    )
    await db.insert(exchangeRatesRef).values({
      fxRateSetId: "fxrs_rem_late",
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      rateDecimal: "10",
      observedAt: new Date("2026-09-01T00:00:00Z"),
      createdAt: new Date("2026-09-01T00:00:00Z"),
    })

    const report = await financeService.getDepartureProfitability(db, {})
    expect(report.unallocated).toEqual([{ currency: "EUR", amountCents: 40000 }])
    // 40000 EUR pro-rated from the issue-date snapshot = 200000 RON, not 400000.
    expect(report.base?.unallocatedCents).toBe(200000)
    expect(report.base?.unattributedCents).toBe(0)
  })

  it("converts a legacy remainder with no base snapshot at the fallback rate", async () => {
    // Invoice created with no rate anywhere → no base snapshot (residual).
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "transport",
      amountCents: 100000,
      allocateCents: 60000,
      target: { targetType: "departure", departureId: "avsl_legacy" },
    })
    // The rate only shows up afterwards, so the residual converts at it.
    await db.execute(
      sql`insert into fx_rate_sets (id, base_currency, effective_at) values ('fxrs_legacy', 'EUR', now())`,
    )
    await db.insert(exchangeRatesRef).values({
      fxRateSetId: "fxrs_legacy",
      baseCurrency: "RON",
      quoteCurrency: "EUR",
      rateDecimal: "0.2",
      createdAt: new Date("2026-06-01T00:00:00Z"),
    })

    const report = await financeService.getDepartureProfitability(db, {})
    expect(report.base?.unconvertibleCurrencies).toEqual([])
    expect(report.base?.unallocatedCents).toBe(200000) // 40000 EUR × 5
  })

  it("splits a departure's revenue and cost across its travellers (equal)", async () => {
    await db.insert(bookings).values({
      id: "book_t1",
      bookingNumber: "BKG-T1",
      status: "confirmed",
      sellCurrency: "EUR",
      startDate: "2026-07-01",
    })
    await db.insert(bookingItems).values({
      bookingId: "book_t1",
      title: "Tour T",
      status: "confirmed",
      availabilitySlotId: "avsl_t",
      productId: "prod_t",
      startsAt: new Date("2026-07-01T09:00:00Z"),
      quantity: 3,
      sellCurrency: "EUR",
      totalSellAmountCents: 120000,
      costCurrency: "EUR",
      totalCostAmountCents: 60000,
    })
    await db.insert(invoices).values({
      invoiceNumber: "INV-T1",
      invoiceType: "invoice",
      status: "issued",
      bookingId: "book_t1",
      currency: "EUR",
      totalCents: 120000,
      paidCents: 0,
      balanceDueCents: 120000,
      issueDate: "2026-06-15",
      dueDate: "2026-06-30",
    })
    await db.insert(bookingTravelers).values([
      { bookingId: "book_t1", firstName: "Alice", lastName: "A", participantType: "traveler" },
      { bookingId: "book_t1", firstName: "Bob", lastName: "B", participantType: "traveler" },
      { bookingId: "book_t1", firstName: "Cara", lastName: "C", participantType: "traveler" },
      // Non-traveller participant — excluded from the split.
      { bookingId: "book_t1", firstName: "Dan", lastName: "D", participantType: "other" },
    ])
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "transport",
      amountCents: 90000,
      target: { targetType: "departure", departureId: "avsl_t" },
    })

    const report = await financeService.getTravelerProfitability(db, {
      departureId: "avsl_t",
      currency: "EUR",
    })
    expect(report.travelerCount).toBe(3)
    expect(report.rows).toHaveLength(3)
    // 120000 revenue / 3 = 40000; 90000 actual / 3 = 30000; 60000 planned / 3 = 20000.
    for (const row of report.rows) {
      expect(row).toMatchObject({
        revenueCents: 40000,
        actualCostCents: 30000,
        plannedCostCents: 20000,
        profitCents: 10000,
        varianceCents: -10000,
      })
      expect(row.marginPercent).toBeCloseTo(25, 1)
    }
  })
})
