import { describe, expect, it, vi } from "vitest"
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
