import { describe, expect, it } from "vitest"

import {
  nextStatusForBalance,
  recomputeTotalsFromLines,
  SupplierInvoiceServiceError,
  supplierInvoicesService,
  validateAllocations,
  validateSupplierInvoiceLines,
} from "../../src/service-supplier-invoices.js"

describe("supplier invoice payable invariants", () => {
  it("rejects missing supplier ids before writing", async () => {
    await expect(
      supplierInvoicesService.create({} as never, {
        supplierId: " ",
        supplierInvoiceNo: "SUP-1",
        currency: "EUR",
        issueDate: "2026-06-01",
        totalCents: 100,
      }),
    ).rejects.toMatchObject({
      code: "invalid_payable_state",
      message: "supplierId is required for supplier invoices",
    })
  })

  it("rejects supplier ids that are not present when the suppliers table exists", async () => {
    let executeCount = 0
    const db = {
      execute: async () => {
        executeCount += 1
        return executeCount === 1 ? [{ table_exists: true }] : []
      },
    }

    await expect(
      supplierInvoicesService.create(db as never, {
        supplierId: "supp_missing",
        supplierInvoiceNo: "SUP-1",
        currency: "EUR",
        issueDate: "2026-06-01",
        totalCents: 100,
      }),
    ).rejects.toMatchObject({
      code: "invalid_payable_state",
      message: "supplierId does not reference an existing supplier",
    })
  })

  it("rejects negative header totals before writing", async () => {
    await expect(
      supplierInvoicesService.create({} as never, {
        supplierId: "sup_123",
        supplierInvoiceNo: "SUP-1",
        currency: "EUR",
        issueDate: "2026-06-01",
        totalCents: -1,
      }),
    ).rejects.toMatchObject({
      code: "invalid_payable_state",
      message: "totalCents must be greater than or equal to 0",
    })
  })

  it("rejects negative line amounts", () => {
    expect(() =>
      validateSupplierInvoiceLines([
        {
          description: "Coach",
          serviceType: "transport",
          quantity: 1,
          unitAmountCents: -1,
          taxAmountCents: 0,
          totalAmountCents: 0,
          sortOrder: 0,
        },
      ]),
    ).toThrow(SupplierInvoiceServiceError)
  })

  it("rejects line totals that do not equal quantity × unit amount plus tax", () => {
    expect(() =>
      validateSupplierInvoiceLines([
        {
          description: "Guide",
          serviceType: "guide",
          quantity: 2,
          unitAmountCents: 45000,
          taxAmountCents: 19000,
          totalAmountCents: 100000,
          sortOrder: 0,
        },
      ]),
    ).toThrow("line 1 total amount must equal quantity × unit amount plus tax (109000)")
  })

  it("rejects supplied header totals that conflict with line-derived totals", async () => {
    await expect(
      supplierInvoicesService.create({} as never, {
        supplierId: "sup_123",
        supplierInvoiceNo: "SUP-1",
        currency: "EUR",
        issueDate: "2026-06-01",
        totalCents: 1000,
        lines: [
          {
            description: "Guide",
            serviceType: "guide",
            quantity: 2,
            unitAmountCents: 45000,
            taxAmountCents: 19000,
            totalAmountCents: 109000,
            sortOrder: 0,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "invalid_payable_state",
      message: "totalCents must match the totals derived from supplier invoice lines (109000)",
    })
  })
})

describe("recomputeTotalsFromLines", () => {
  it("derives subtotal/tax/total from line totals (total includes tax)", () => {
    const totals = recomputeTotalsFromLines([
      {
        description: "Coach",
        serviceType: "transport",
        quantity: 1,
        unitAmountCents: 480000,
        taxAmountCents: 0,
        totalAmountCents: 480000,
        sortOrder: 0,
      },
      {
        description: "Guide",
        serviceType: "guide",
        quantity: 2,
        unitAmountCents: 45000,
        taxAmountCents: 19000,
        totalAmountCents: 109000,
        sortOrder: 1,
      },
    ])
    expect(totals.totalCents).toBe(589000)
    expect(totals.taxCents).toBe(19000)
    expect(totals.subtotalCents).toBe(570000)
  })

  it("is zero for no lines", () => {
    expect(recomputeTotalsFromLines([])).toEqual({
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
    })
  })
})

describe("validateAllocations (§6.1 invariants)", () => {
  it("allows zero allocations (under-allocation is fine)", () => {
    expect(validateAllocations({ invoiceTotalCents: 1000, lines: [], allocations: [] })).toEqual({
      ok: true,
    })
  })

  it("rejects mixing whole-invoice and per-line allocations", () => {
    const result = validateAllocations({
      invoiceTotalCents: 1000,
      lines: [{ id: "sinl_1", totalAmountCents: 1000 }],
      allocations: [
        { supplierInvoiceLineId: null, amountCents: 400 },
        { supplierInvoiceLineId: "sinl_1", amountCents: 600 },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("mixed_allocation_modes")
  })

  it("rejects whole-invoice over-allocation", () => {
    const result = validateAllocations({
      invoiceTotalCents: 1000,
      lines: [],
      allocations: [
        { supplierInvoiceLineId: null, amountCents: 700 },
        { supplierInvoiceLineId: null, amountCents: 400 },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("over_allocated")
  })

  it("rejects negative allocations", () => {
    const result = validateAllocations({
      invoiceTotalCents: 1000,
      lines: [],
      allocations: [{ supplierInvoiceLineId: null, amountCents: -1 }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("invalid_payable_state")
  })

  it("allows whole-invoice allocation up to the total (split across departures)", () => {
    expect(
      validateAllocations({
        invoiceTotalCents: 1000,
        lines: [],
        allocations: [
          { supplierInvoiceLineId: null, amountCents: 600 },
          { supplierInvoiceLineId: null, amountCents: 400 },
        ],
      }),
    ).toEqual({ ok: true })
  })

  it("allows under-allocation (remainder derived as unallocated on read, not stored)", () => {
    expect(
      validateAllocations({
        invoiceTotalCents: 1000,
        lines: [],
        allocations: [{ supplierInvoiceLineId: null, amountCents: 600 }],
      }),
    ).toEqual({ ok: true })
  })

  it("rejects per-line over-allocation for a single line", () => {
    const result = validateAllocations({
      invoiceTotalCents: 1000,
      lines: [
        { id: "sinl_1", totalAmountCents: 600 },
        { id: "sinl_2", totalAmountCents: 400 },
      ],
      allocations: [
        { supplierInvoiceLineId: "sinl_1", amountCents: 300 },
        { supplierInvoiceLineId: "sinl_1", amountCents: 400 },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("over_allocated")
  })

  it("allows per-line allocations that split a line within its total", () => {
    expect(
      validateAllocations({
        invoiceTotalCents: 1000,
        lines: [{ id: "sinl_1", totalAmountCents: 600 }],
        allocations: [
          { supplierInvoiceLineId: "sinl_1", amountCents: 300 },
          { supplierInvoiceLineId: "sinl_1", amountCents: 300 },
        ],
      }),
    ).toEqual({ ok: true })
  })

  it("rejects allocations referencing an unknown line", () => {
    const result = validateAllocations({
      invoiceTotalCents: 1000,
      lines: [{ id: "sinl_1", totalAmountCents: 600 }],
      allocations: [{ supplierInvoiceLineId: "sinl_missing", amountCents: 100 }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("unknown_allocation_line")
  })
})

describe("nextStatusForBalance (§5.4 settlement flow)", () => {
  it("flips approved → paid when fully settled", () => {
    expect(nextStatusForBalance("approved", 1000, 1000)).toBe("paid")
    expect(nextStatusForBalance("approved", 1000, 1200)).toBe("paid")
  })

  it("flips approved → partially_paid on a part payment", () => {
    expect(nextStatusForBalance("approved", 1000, 400)).toBe("partially_paid")
  })

  it("reverts a paid/partial invoice to approved when payments are removed", () => {
    expect(nextStatusForBalance("paid", 1000, 0)).toBe("approved")
    expect(nextStatusForBalance("partially_paid", 1000, 0)).toBe("approved")
  })

  it("never auto-changes manual/terminal states (draft, disputed, void)", () => {
    expect(nextStatusForBalance("draft", 1000, 1000)).toBe("draft")
    expect(nextStatusForBalance("disputed", 1000, 1000)).toBe("disputed")
    expect(nextStatusForBalance("void", 1000, 1000)).toBe("void")
  })

  it("leaves a zero-total invoice with no payments unchanged", () => {
    expect(nextStatusForBalance("received", 0, 0)).toBe("received")
  })
})
