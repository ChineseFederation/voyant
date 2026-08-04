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
    target:
      | { targetType: "departure"; departureId: string }
      | { targetType: "product"; productId: string }
      | { targetType: "unattributed" }
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
          : opts.target.targetType === "product"
            ? {
                targetType: "product",
                productId: opts.target.productId,
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

  // -------------------------------------------------------------------------
  // Version-bound planned cost from the frozen day-service contract (item 11).
  // The prior suite exercised only the booking_items FALLBACK; this seeds a real
  // product_versions row, a slot bound to it, and a materialized operation line,
  // and proves the resolver costs from the FROZEN snapshot — immune to edits of
  // the live product_day_services row.
  // -------------------------------------------------------------------------
  async function seedVersionBoundScenario() {
    // A frozen snapshot whose one day service declares a per-night planned cost
    // of 10000/night. The departure has 3 nights, so planned cost = 30000 EUR.
    const snapshot = {
      id: "prod_pv",
      itineraries: [
        {
          id: "pit_1",
          productId: "prod_pv",
          isDefault: true,
          days: [
            {
              id: "pday_1",
              itineraryId: "pit_1",
              dayNumber: 1,
              services: [
                {
                  id: "pds_1",
                  dayId: "pday_1",
                  serviceType: "guide",
                  name: "Frozen guide",
                  plannedCost: {
                    version: 1,
                    basis: "per_night",
                    driver: "nights",
                    quantity: 1,
                    rateCents: 10000,
                    currency: "EUR",
                    fxRates: null,
                    resolvedAt: null,
                  },
                },
              ],
            },
          ],
        },
      ],
    }
    // Live product chain. The live day-service cost (99999) is deliberately WRONG
    // — if the resolver ever read it instead of the frozen block, planned cost
    // would jump, and the assertions below would catch it.
    await db.execute(
      sql`insert into products (id, name, sell_currency) values ('prod_pv', 'Version Tour', 'EUR')`,
    )
    await db.execute(
      sql`insert into product_itineraries (id, product_id, name) values ('pit_1', 'prod_pv', 'Default')`,
    )
    await db.execute(
      sql`insert into product_days (id, itinerary_id, day_number) values ('pday_1', 'pit_1', 1)`,
    )
    await db.execute(
      sql`insert into product_day_services (id, day_id, service_type, name, cost_currency, cost_amount_cents)
          values ('pds_1', 'pday_1', 'guide', 'Live guide', 'EUR', 99999)`,
    )
    await db.execute(
      sql`insert into product_versions (id, product_id, version_number, snapshot, author_id)
          values ('pv_1', 'prod_pv', 1, ${JSON.stringify(snapshot)}::jsonb, 'staff_test')`,
    )
    // Slot bound to the version, 3 nights, capacity 20 with 5 consumed.
    await db.execute(
      sql`insert into availability_slots
            (id, product_id, product_version_id, date_local, starts_at, timezone, status, unlimited, initial_pax, remaining_pax, nights)
          values
            ('avsl_pv', 'prod_pv', 'pv_1', '2026-07-01', '2026-07-01T09:00:00Z', 'UTC', 'open', false, 20, 15, 3)`,
    )
    // Materialized operation line keyed (slot_id, source_day_service_id).
    await db.execute(
      sql`insert into departure_service_operations
            (id, slot_id, product_version_id, source_day_id, source_day_service_id, day_number, date_local, timezone, name)
          values
            ('dso_1', 'avsl_pv', 'pv_1', 'pday_1', 'pds_1', 1, '2026-07-01', 'UTC', 'Frozen guide')`,
    )
    // A booking on the slot with a booking_items planned cost of 77777 — the
    // fallback figure that MUST be ignored for a version-bound departure.
    await db.insert(bookings).values({
      id: "book_pv",
      bookingNumber: "BKG-PV",
      status: "confirmed",
      sellCurrency: "EUR",
      startDate: "2026-07-01",
      pax: 5,
    })
    await db.insert(bookingItems).values({
      bookingId: "book_pv",
      title: "Version Tour",
      status: "confirmed",
      availabilitySlotId: "avsl_pv",
      productId: "prod_pv",
      productNameSnapshot: "Version Tour",
      startsAt: new Date("2026-07-01T09:00:00Z"),
      quantity: 1,
      sellCurrency: "EUR",
      totalSellAmountCents: 100000,
      costCurrency: "EUR",
      totalCostAmountCents: 77777,
    })
    await db.insert(invoices).values({
      invoiceNumber: "INV-PV",
      invoiceType: "invoice",
      status: "issued",
      bookingId: "book_pv",
      currency: "EUR",
      totalCents: 100000,
      paidCents: 0,
      balanceDueCents: 100000,
      issueDate: "2026-06-15",
      dueDate: "2026-06-30",
    })
  }

  it("resolves planned cost from the frozen Product Version, not booking_items or the live day service", async () => {
    await seedVersionBoundScenario()
    const report = await financeService.getDepartureProfitability(db, {})
    const row = report.rows.find((r) => r.departureId === "avsl_pv" && r.currency === "EUR")

    // 10000/night × 3 nights = 30000 — the FROZEN block, not 77777 (booking_items)
    // and not 99999 (the live product_day_services row).
    expect(row?.plannedCostCents).toBe(30000)
    expect(row?.plannedCostCents).not.toBe(77777)
    expect(row?.plannedCostCents).not.toBe(99999)

    // Version-bound, so this departure is NOT named as a fallback.
    expect(report.plannedCostCaveat?.fallbackDepartureIds).not.toContain("avsl_pv")
    expect(report.plannedCostCaveat?.versionResolvedCount).toBeGreaterThanOrEqual(1)

    // Load factor from authored capacity: 5 booked of 20 = 25%.
    expect(row?.loadFactorPercent).toBeCloseTo(25, 1)

    // Break-even: the frozen fixed cost (per-night, no per-pax term) is 30000, and
    // with a positive contribution margin it breaks even exactly at that cost.
    expect(row?.breakEvenRevenueCents).toBe(30000)
  })

  it("keeps version-bound planned cost frozen when the live product_day_services row is edited", async () => {
    await seedVersionBoundScenario()
    const before = await financeService.getDepartureProfitability(db, {})
    const beforeRow = before.rows.find((r) => r.departureId === "avsl_pv" && r.currency === "EUR")
    expect(beforeRow?.plannedCostCents).toBe(30000)

    // Edit the LIVE day service well away from the frozen figure.
    await db.execute(
      sql`update product_day_services set cost_amount_cents = 88888, cost_currency = 'USD' where id = 'pds_1'`,
    )

    const after = await financeService.getDepartureProfitability(db, {})
    const afterRow = after.rows.find((r) => r.departureId === "avsl_pv" && r.currency === "EUR")
    // Unchanged: the resolver reads the frozen snapshot, never the mutable row.
    expect(afterRow?.plannedCostCents).toBe(30000)
  })

  // -------------------------------------------------------------------------
  // Rollup exactness (item 10). Σ departure rows + product-only allocations +
  // unattributed + unallocated == the product rollup, per currency AND in the
  // accounting base — any difference enumerated explicitly, never tolerated.
  // -------------------------------------------------------------------------
  const PRODUCT_ONLY_EUR = 15000
  const UNATTRIBUTED_EUR = 5000
  const UNALLOCATED_EUR = 20000
  const COMMITTED_EUR = 25000

  async function seedRollupScenario() {
    await db.insert(bookings).values([
      {
        id: "book_r1",
        bookingNumber: "BKG-R1",
        status: "confirmed",
        sellCurrency: "EUR",
        startDate: "2026-07-01",
      },
      {
        id: "book_r2",
        bookingNumber: "BKG-R2",
        status: "confirmed",
        sellCurrency: "EUR",
        startDate: "2026-07-01",
      },
    ])
    await db.insert(bookingItems).values([
      {
        bookingId: "book_r1",
        title: "Rollup Tour",
        status: "confirmed",
        availabilitySlotId: "avsl_r1",
        productId: "prod_r",
        productNameSnapshot: "Rollup Tour",
        startsAt: new Date("2026-07-01T09:00:00Z"),
        quantity: 1,
        sellCurrency: "EUR",
        totalSellAmountCents: 100000,
        costCurrency: "EUR",
        totalCostAmountCents: 60000,
      },
      {
        bookingId: "book_r2",
        title: "Rollup Tour",
        status: "confirmed",
        availabilitySlotId: "avsl_r2",
        productId: "prod_r",
        productNameSnapshot: "Rollup Tour",
        startsAt: new Date("2026-07-08T09:00:00Z"),
        quantity: 1,
        sellCurrency: "EUR",
        totalSellAmountCents: 100000,
        costCurrency: "EUR",
        totalCostAmountCents: 40000,
      },
    ])
    await db.insert(invoices).values([
      {
        invoiceNumber: "INV-R1",
        invoiceType: "invoice",
        status: "issued",
        bookingId: "book_r1",
        currency: "EUR",
        totalCents: 100000,
        paidCents: 0,
        balanceDueCents: 100000,
        issueDate: "2026-06-15",
        dueDate: "2026-06-30",
      },
      {
        invoiceNumber: "INV-R2",
        invoiceType: "invoice",
        status: "issued",
        bookingId: "book_r2",
        currency: "EUR",
        totalCents: 100000,
        paidCents: 0,
        balanceDueCents: 100000,
        issueDate: "2026-06-15",
        dueDate: "2026-06-30",
      },
    ])
    // Departure-targeted actual costs (fully allocated).
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "transport",
      amountCents: 60000,
      target: { targetType: "departure", departureId: "avsl_r1" },
    })
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "guide",
      amountCents: 40000,
      target: { targetType: "departure", departureId: "avsl_r2" },
    })
    // A product-only allocation (cost attributed to the product, not a departure).
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "other",
      amountCents: PRODUCT_ONLY_EUR,
      target: { targetType: "product", productId: "prod_r" },
    })
    // Deliberately unattributed cost.
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "other",
      amountCents: UNATTRIBUTED_EUR,
      target: { targetType: "unattributed" },
    })
    // Under-allocated invoice: 50000 total, 30000 to avsl_r1 → 20000 remainder.
    await seedSupplierCost(db, {
      currency: "EUR",
      serviceType: "transport",
      amountCents: 50000,
      allocateCents: 30000,
      target: { targetType: "departure", departureId: "avsl_r1" },
    })
    // Confirmed supplier commitment on book_r1 (25000) plus an UNconfirmed one
    // that must be excluded from committed cost entirely.
    await db.execute(
      sql`insert into booking_supplier_statuses (id, booking_id, service_name, status, cost_currency, cost_amount_cents, confirmed_at)
          values ('bss_conf', 'book_r1', 'Confirmed coach', 'confirmed', 'EUR', ${COMMITTED_EUR}, now())`,
    )
    await db.execute(
      sql`insert into booking_supplier_statuses (id, booking_id, service_name, status, cost_currency, cost_amount_cents, confirmed_at)
          values ('bss_pending', 'book_r1', 'Pending flight', 'pending', 'EUR', 999999, null)`,
    )
  }

  const sumBy = <T>(rows: T[], pick: (r: T) => number): number =>
    rows.reduce((s, r) => s + pick(r), 0)

  it("proves the product rollup equals Σ departures + product-only + unattributed + unallocated, per currency", async () => {
    await seedRollupScenario()
    const dep = await financeService.getDepartureProfitability(db, {})
    const prod = await financeService.getProductProfitability(db, {})

    const depEur = dep.rows.filter((r) => r.currency === "EUR")
    const prodEur = prod.rows.filter((r) => r.currency === "EUR")

    // Revenue / planned / committed roll up verbatim (no product-level source).
    expect(sumBy(prodEur, (r) => r.revenueCents)).toBe(sumBy(depEur, (r) => r.revenueCents))
    expect(sumBy(prodEur, (r) => r.plannedCostCents)).toBe(sumBy(depEur, (r) => r.plannedCostCents))
    expect(sumBy(prodEur, (r) => r.committedCostCents)).toBe(
      sumBy(depEur, (r) => r.committedCostCents),
    )

    // Committed reflects ONLY the confirmed status, attributed to avsl_r1's booking.
    expect(sumBy(depEur, (r) => r.committedCostCents)).toBe(COMMITTED_EUR)

    // Actual cost: the product rollup is departures PLUS product-only allocations.
    // Enumerate the difference explicitly rather than tolerate it.
    const prodActual = sumBy(prodEur, (r) => r.actualCostCents)
    const depActual = sumBy(depEur, (r) => r.actualCostCents)
    expect(prodActual - depActual).toBe(PRODUCT_ONLY_EUR)

    // Full AP partition: everything recorded lands in exactly one bucket.
    const unattributedEur = dep.unattributed.find((u) => u.currency === "EUR")?.amountCents ?? 0
    const unallocatedEur = dep.unallocated.find((u) => u.currency === "EUR")?.amountCents ?? 0
    expect(unattributedEur).toBe(UNATTRIBUTED_EUR)
    expect(unallocatedEur).toBe(UNALLOCATED_EUR)
    // Total recorded AP (60000+40000+30000 departure + 15000 product + 5000 unattributed + 20000 remainder = 170000).
    const totalRecorded = depActual + PRODUCT_ONLY_EUR + unattributedEur + unallocatedEur
    expect(totalRecorded).toBe(170000)
    // The product report reports the same two unaccounted buckets.
    expect(prod.unattributed.find((u) => u.currency === "EUR")?.amountCents ?? 0).toBe(
      UNATTRIBUTED_EUR,
    )
    expect(prod.unallocated.find((u) => u.currency === "EUR")?.amountCents ?? 0).toBe(
      UNALLOCATED_EUR,
    )
  })

  it("proves the same rollup identity in the accounting base currency", async () => {
    await seedRollupScenario()
    // EUR→RON = 5, seeded after the costs so EUR rows take the fallback rate.
    await db.execute(
      sql`insert into fx_rate_sets (id, base_currency, effective_at) values ('fxrs_rollup', 'EUR', now())`,
    )
    await db.insert(exchangeRatesRef).values({
      fxRateSetId: "fxrs_rollup",
      baseCurrency: "RON",
      quoteCurrency: "EUR",
      rateDecimal: "0.2",
      createdAt: new Date("2026-06-01T00:00:00Z"),
    })

    const dep = await financeService.getDepartureProfitability(db, {})
    const prod = await financeService.getProductProfitability(db, {})
    expect(dep.base?.currency).toBe("RON")
    expect(dep.base?.unconvertibleCurrencies).toEqual([])

    const depBase = dep.base?.rows ?? []
    const prodBase = prod.base?.rows ?? []

    // Revenue / planned / committed roll up verbatim in base too.
    expect(sumBy(prodBase, (r) => r.revenueCents)).toBe(sumBy(depBase, (r) => r.revenueCents))
    expect(sumBy(prodBase, (r) => r.plannedCostCents)).toBe(
      sumBy(depBase, (r) => r.plannedCostCents),
    )
    expect(sumBy(prodBase, (r) => r.committedCostCents)).toBe(
      sumBy(depBase, (r) => r.committedCostCents),
    )

    // Actual: product rollup − departures == product-only allocation × the rate.
    const prodActual = sumBy(prodBase, (r) => r.actualCostCents)
    const depActual = sumBy(depBase, (r) => r.actualCostCents)
    expect(prodActual - depActual).toBe(PRODUCT_ONLY_EUR * 5)

    // The two unaccounted buckets convert at the same rate on both reports.
    expect(dep.base?.unattributedCents).toBe(UNATTRIBUTED_EUR * 5)
    expect(dep.base?.unallocatedCents).toBe(UNALLOCATED_EUR * 5)
    expect(prod.base?.unattributedCents).toBe(UNATTRIBUTED_EUR * 5)
    expect(prod.base?.unallocatedCents).toBe(UNALLOCATED_EUR * 5)
    // Committed base = 25000 × 5.
    expect(sumBy(depBase, (r) => r.committedCostCents)).toBe(COMMITTED_EUR * 5)
  })
})
