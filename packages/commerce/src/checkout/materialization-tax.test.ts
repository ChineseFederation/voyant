import { computeBookingItemTaxLine, resolveBookingSellTaxRate } from "@voyant-travel/finance"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MaterializationSnapshot } from "./materialization.js"
import { materializeBookingItemTaxLine } from "./materialization-tax.js"

vi.mock("@voyant-travel/finance", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    // Force "no tax policy" so the snapshot-fallback path is exercised.
    resolveBookingSellTaxRate: vi.fn().mockResolvedValue(null),
    computeBookingItemTaxLine: vi.fn().mockReturnValue(null),
  }
})

function snapshot(overrides: Partial<MaterializationSnapshot> = {}): MaterializationSnapshot {
  return {
    id: "snap_1",
    entity_module: "products",
    entity_id: "prod_1",
    source_kind: "demo",
    source_provider: null,
    source_ref: null,
    frozen_payload: null,
    pricing_base_amount: null,
    pricing_taxes: null,
    pricing_fees: null,
    pricing_surcharges: null,
    pricing_currency: "EUR",
    ...overrides,
  }
}

const booking = { sellCurrency: "EUR" } as never

/**
 * The chainable stub the existing cases use, with the locked-row select made
 * configurable so a test can say what pricing treatment the row carries.
 */
function stubDb(item: Record<string, unknown>, inserted: Array<Record<string, unknown>>) {
  const db = {
    transaction: async (callback: (tx: unknown) => unknown) => callback(db),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({ for: async () => [item] }),
        }),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: async () => {
          inserted.push(v)
        },
      }),
    }),
  }
  return db as never
}

beforeEach(() => {
  vi.clearAllMocks()
  // Back to "no tax policy configured" between cases, so a test that installs
  // a matching rule cannot leak it into the next one.
  vi.mocked(resolveBookingSellTaxRate).mockResolvedValue(null as never)
  vi.mocked(computeBookingItemTaxLine).mockReturnValue(null as never)
})

describe("materializeBookingItemTaxLine", () => {
  it("writes a snapshot-fallback tax line when no policy line resolves", async () => {
    const inserted: Array<Record<string, unknown>> = []
    const db = {
      transaction: async (callback: (tx: unknown) => unknown) => callback(db),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => ({ for: async () => [{ id: "item_1" }] }),
          }),
        }),
      }),
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          onConflictDoNothing: async () => {
            inserted.push(v)
          },
        }),
      }),
    } as never

    await materializeBookingItemTaxLine(
      db,
      booking,
      "item_1",
      11900,
      snapshot({ pricing_taxes: "1900" }),
      {
        resolveBookingTaxSettings: vi.fn(),
      },
    )

    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      bookingItemId: "item_1",
      code: "snapshot/tax",
      amountCents: 1900,
      includedInPrice: true,
    })
  })

  it("writes nothing when there is no policy line and no snapshot tax", async () => {
    const inserted: Array<Record<string, unknown>> = []
    const db = {
      transaction: async (callback: (tx: unknown) => unknown) => callback(db),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => ({ for: async () => [{ id: "item_1" }] }),
          }),
        }),
      }),
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          onConflictDoNothing: async () => {
            inserted.push(v)
          },
        }),
      }),
    } as never

    await materializeBookingItemTaxLine(db, booking, "item_1", 10000, snapshot(), {
      resolveBookingTaxSettings: vi.fn(),
    })

    expect(inserted).toHaveLength(0)
  })
})

/**
 * An insurance premium is set by the insurer and is commonly exempt from the
 * VAT the rest of the cart carries. If the operator's tax policy — or the
 * snapshot's own tax figure — reaches it, the booking total stops agreeing
 * with the policy document the traveller is holding.
 */
describe("materializeBookingItemTaxLine — pass-through lines", () => {
  const passThroughItem = (taxTreatmentCode: string | null) => ({
    id: "item_1",
    pricingTreatment: "pass_through" as const,
    taxTreatmentCode,
  })

  it("writes an explicit zero-rated row for an exempt treatment", async () => {
    const inserted: Array<Record<string, unknown>> = []
    const db = stubDb(passThroughItem("insurance/exempt"), inserted)

    await materializeBookingItemTaxLine(db, booking, "item_1", 4500, snapshot(), {
      resolveBookingTaxSettings: vi.fn(),
    })

    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      bookingItemId: "item_1",
      code: "insurance/exempt",
      amountCents: 0,
      rateBasisPoints: 0,
      includedInPrice: true,
      currency: "EUR",
    })
  })

  it("never resolves the operator's tax policy for a pass-through line", async () => {
    // A default policy rule that would otherwise match every line.
    vi.mocked(resolveBookingSellTaxRate).mockResolvedValue({ rateBasisPoints: 1900 } as never)
    vi.mocked(computeBookingItemTaxLine).mockReturnValue({
      code: "policy/vat",
      name: "VAT",
      scope: "included",
      currency: "EUR",
      amountCents: 855,
      rateBasisPoints: 1900,
      includedInPrice: true,
      sortOrder: 0,
    } as never)

    const inserted: Array<Record<string, unknown>> = []
    const db = stubDb(passThroughItem("insurance/exempt"), inserted)

    await materializeBookingItemTaxLine(db, booking, "item_1", 4500, snapshot(), {
      resolveBookingTaxSettings: vi.fn(),
    })

    expect(resolveBookingSellTaxRate).not.toHaveBeenCalled()
    expect(computeBookingItemTaxLine).not.toHaveBeenCalled()
    expect(inserted.map((row) => row.code)).toEqual(["insurance/exempt"])
  })

  it("never falls back to the snapshot tax line for a pass-through line", async () => {
    const inserted: Array<Record<string, unknown>> = []
    const db = stubDb(passThroughItem(null), inserted)

    // The snapshot carries a tax figure, which is exactly what the standard
    // path would fall back to. A pass-through line must not inherit it.
    await materializeBookingItemTaxLine(
      db,
      booking,
      "item_1",
      4500,
      snapshot({ pricing_taxes: "1900" }),
      { resolveBookingTaxSettings: vi.fn() },
    )

    expect(inserted).toHaveLength(0)
  })

  it("refuses a treatment it cannot price rather than guessing", async () => {
    const inserted: Array<Record<string, unknown>> = []
    const db = stubDb(passThroughItem("insurance/standard_rate"), inserted)

    await expect(
      materializeBookingItemTaxLine(db, booking, "item_1", 4500, snapshot(), {
        resolveBookingTaxSettings: vi.fn(),
      }),
    ).rejects.toThrow(/unsupported pass-through tax treatment/)
    expect(inserted).toHaveLength(0)
  })
})
