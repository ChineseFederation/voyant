import { describe, expect, it, vi } from "vitest"

import { resolveAvailabilityPresentationEntityId } from "../src/catalog-runtime-extension.js"

describe("availability presentation identity", () => {
  it("maps a sourced live offer reference to the canonical catalog entity", async () => {
    const readBySource = vi.fn(async () => ({ entity_id: "acc_canonical" }))
    const result = await resolveAvailabilityPresentationEntityId({
      db: {} as never,
      registry: {
        resolveByConnection: () => ({ kind: "voyant-connect" }),
      } as never,
      candidate: {
        candidateRef: "stay_offer",
        entity_module: "accommodations",
        entity_id: "hotel_source_ref",
        selection: {},
        source: { kind: "sourced", connectionId: "conn_1" },
        price: { amount: "100.00", currency: "EUR" },
      },
      readBySource: readBySource as never,
    })

    expect(result).toBe("acc_canonical")
    expect(readBySource).toHaveBeenCalledWith(
      {},
      {
        entityModule: "accommodations",
        sourceKind: "voyant-connect",
        sourceConnectionId: "conn_1",
        sourceRef: "hotel_source_ref",
      },
    )
  })

  it("keeps owned and unmapped candidates on their canonical input id", async () => {
    const readBySource = vi.fn()
    const base = {
      candidateRef: "stay_offer",
      entity_module: "accommodations",
      entity_id: "acc_owned",
      selection: {},
      price: { amount: "100.00", currency: "EUR" },
    }
    await expect(
      resolveAvailabilityPresentationEntityId({
        db: {} as never,
        registry: {} as never,
        candidate: { ...base, source: { kind: "owned", module: "accommodations" } },
        readBySource: readBySource as never,
      }),
    ).resolves.toBe("acc_owned")
    expect(readBySource).not.toHaveBeenCalled()
  })
})
