import { describe, expect, it } from "vitest"

import {
  type CommercialDecisionInput,
  type CommercialPriceAvailabilityAdapter,
  type CommercialSnapshotRepository,
  createCommercialDecisionEvaluator,
  recordCommercialSnapshot,
} from "./index.js"

const operatedInput: CommercialDecisionInput = {
  item: {
    kind: "catalog-item",
    id: "catalog_item_operated_tour",
    source: "operated",
    vertical: "tour",
  },
  date: "2026-09-18",
  party: {
    pax: 2,
    adults: 2,
  },
  currency: "EUR",
  buyer: {
    actorType: "customer",
    segmentIds: ["retail"],
  },
  channel: {
    id: "channel_direct",
    kind: "direct",
  },
  market: {
    id: "market_ro",
    code: "RO",
    currency: "EUR",
  },
  promotionCodes: ["EARLY10"],
  requestedAt: "2026-06-13T09:00:00.000Z",
  idempotencyKey: "proposal-version:prvr_v1:item:catalog_item_operated_tour",
}

const operatedInventoryAdapter: CommercialPriceAvailabilityAdapter = {
  id: "operated-inventory",
  kind: "operated-inventory",
  supports(input) {
    return input.item.kind === "catalog-item" && input.item.source === "operated"
  },
  evaluate(input) {
    return {
      status: "available",
      validUntil: "2026-06-13T09:15:00.000Z",
      pricing: {
        currency: input.currency,
        subtotal: {
          amountMinor: 24000,
          currency: input.currency,
        },
        discountTotal: {
          amountMinor: 2400,
          currency: input.currency,
        },
        total: {
          amountMinor: 21600,
          currency: input.currency,
        },
        components: [
          {
            kind: "base",
            label: "Adult",
            quantity: 2,
            amount: {
              amountMinor: 24000,
              currency: input.currency,
            },
            ruleId: "price_rule_adult",
          },
          {
            kind: "discount",
            label: "Early booking",
            amount: {
              amountMinor: -2400,
              currency: input.currency,
            },
            ruleId: "promotion_early10",
          },
        ],
        priceRuleIds: ["price_rule_adult"],
      },
      promotions: {
        requestedCodes: input.promotionCodes,
        applied: [
          {
            id: "promotion_early10",
            code: "EARLY10",
            status: "applied",
            discount: {
              amountMinor: 2400,
              currency: input.currency,
            },
            ruleId: "promotion_early10",
          },
        ],
        rejected: [],
        totalDiscount: {
          amountMinor: 2400,
          currency: input.currency,
        },
      },
      availability: {
        status: "limited",
        capacityRemaining: 6,
        allocationRef: "slot_2026_09_18",
      },
      sellability: {
        status: "allowed",
        policyIds: ["sellability_policy_public"],
      },
      traces: [
        {
          id: "trace_market_rule_ro",
          source: "markets",
          outcome: "applied",
          code: "market_rule_applied",
          ruleId: "market_rule_ro",
        },
        {
          id: "trace_price_rule_adult",
          source: "pricing",
          outcome: "applied",
          code: "price_rule_applied",
          ruleId: "price_rule_adult",
        },
        {
          id: "trace_promotion_early10",
          source: "promotions",
          outcome: "applied",
          code: "promotion_applied",
          ruleId: "promotion_early10",
        },
      ],
      handles: [
        {
          providerId: "inventory",
          handle: "slot_2026_09_18",
        },
      ],
    }
  },
}

const sourcedAdapter: CommercialPriceAvailabilityAdapter = {
  id: "cruise-source",
  kind: "source",
  supports(input) {
    return input.item.kind === "vertical-item" && input.item.vertical === "cruise"
  },
  evaluate(input) {
    return {
      status: "available",
      validUntil: "2026-06-13T09:05:00.000Z",
      pricing: {
        currency: input.currency,
        subtotal: {
          amountMinor: 180000,
          currency: input.currency,
        },
        taxTotal: {
          amountMinor: 12000,
          currency: input.currency,
        },
        total: {
          amountMinor: 192000,
          currency: input.currency,
        },
        components: [
          {
            kind: "base",
            label: "Cabin fare",
            amount: {
              amountMinor: 180000,
              currency: input.currency,
            },
            ruleId: "fare_offer_abc",
          },
          {
            kind: "tax",
            label: "Port taxes",
            amount: {
              amountMinor: 12000,
              currency: input.currency,
            },
          },
        ],
        fx: {
          sourceCurrency: "USD",
          requestedCurrency: "EUR",
          rate: "0.920000",
          rateSetId: "fx_2026_06_13",
          provider: {
            providerId: "treasury",
          },
          quotedAt: "2026-06-13T09:00:00.000Z",
        },
      },
      fx: {
        sourceCurrency: "USD",
        requestedCurrency: "EUR",
        rate: "0.920000",
        rateSetId: "fx_2026_06_13",
        provider: {
          providerId: "treasury",
        },
        quotedAt: "2026-06-13T09:00:00.000Z",
      },
      promotions: {
        requestedCodes: input.promotionCodes,
        applied: [],
        rejected: [
          {
            code: "EARLY10",
            status: "rejected",
            reason: "not_source_eligible",
            ruleId: "promotion_early10",
          },
        ],
      },
      availability: {
        status: "available",
        capacityRemaining: 3,
      },
      sellability: {
        status: "allowed",
        policyIds: ["source_policy_public"],
      },
      traces: [
        {
          id: "trace_live_offer",
          source: "adapter",
          outcome: "applied",
          code: "live_offer_resolved",
          refs: {
            offerRef: "offer_abc",
          },
        },
        {
          id: "trace_fx",
          source: "fx",
          outcome: "applied",
          code: "fx_rate_applied",
          ruleId: "fx_2026_06_13",
        },
      ],
      handles: [
        {
          providerId: "cruise-provider",
          sourceId: "source_cruise",
          externalRef: "offer_abc",
          handle: "live_quote_123",
        },
      ],
    }
  },
}

describe("commercial decision Interface", () => {
  it("evaluates an operated item through the operated inventory adapter", async () => {
    const evaluator = createCommercialDecisionEvaluator({
      adapters: [operatedInventoryAdapter],
    })

    const decision = await evaluator.evaluateCommercialDecision(operatedInput)

    expect(decision.status).toBe("buyable")
    expect(decision.buyable).toBe(true)
    expect(decision.pricing?.total).toEqual({
      amountMinor: 21600,
      currency: "EUR",
    })
    expect(decision.promotions.applied).toHaveLength(1)
    expect(decision.availability?.capacityRemaining).toBe(6)
    expect(decision.sellability?.policyIds).toEqual(["sellability_policy_public"])
    expect(decision.traces.map((trace) => trace.code)).toEqual([
      "adapter_selected",
      "market_rule_applied",
      "price_rule_applied",
      "promotion_applied",
    ])
    expect(decision.handles).toEqual([
      {
        adapterId: "operated-inventory",
        adapterKind: "operated-inventory",
      },
      {
        adapterId: "operated-inventory",
        adapterKind: "operated-inventory",
        providerId: "inventory",
        handle: "slot_2026_09_18",
      },
    ])
  })

  it("evaluates a sourced vertical item through a source adapter and records snapshots separately", async () => {
    const evaluator = createCommercialDecisionEvaluator({
      adapters: [operatedInventoryAdapter],
    })
    evaluator.registerPriceAvailabilityAdapter(sourcedAdapter)

    const input: CommercialDecisionInput = {
      ...operatedInput,
      item: {
        kind: "vertical-item",
        id: "cruise_sailing_2026_11_02",
        vertical: "cruise",
        source: "sourced",
        sourceRef: {
          sourceId: "source_cruise",
          externalRef: "sailing_2026_11_02",
        },
      },
      idempotencyKey: "proposal-version:prvr_v1:item:cruise_sailing_2026_11_02",
    }

    const writes: Array<Parameters<CommercialSnapshotRepository["recordCommercialSnapshot"]>[0]> =
      []
    const repository: CommercialSnapshotRepository = {
      async recordCommercialSnapshot(write) {
        writes.push(write)
        return {
          snapshotId: `commercial_snapshot_${writes.length}`,
          decisionId: write.decision.decisionId,
          target: write.target,
          idempotencyKey: write.idempotencyKey,
          recordedAt: "2026-06-13T09:01:00.000Z",
        }
      },
    }

    const decision = await evaluator.evaluateCommercialDecision(input)

    expect(writes).toHaveLength(0)
    expect(decision.status).toBe("buyable")
    expect(decision.pricing?.total.amountMinor).toBe(192000)
    expect(decision.fx).toMatchObject({
      sourceCurrency: "USD",
      requestedCurrency: "EUR",
      rateSetId: "fx_2026_06_13",
    })
    expect(decision.promotions.rejected).toEqual([
      {
        code: "EARLY10",
        status: "rejected",
        reason: "not_source_eligible",
        ruleId: "promotion_early10",
      },
    ])
    expect(decision.traces.map((trace) => trace.code)).toContain("live_offer_resolved")
    expect(decision.handles).toContainEqual({
      adapterId: "cruise-source",
      adapterKind: "source",
      providerId: "cruise-provider",
      sourceId: "source_cruise",
      externalRef: "offer_abc",
      handle: "live_quote_123",
    })

    const snapshot = await recordCommercialSnapshot(
      decision,
      {
        kind: "proposal-version",
        id: "proposal_version_1",
      },
      repository,
    )

    expect(writes).toHaveLength(1)
    expect(snapshot).toMatchObject({
      snapshotId: "commercial_snapshot_1",
      decisionId: decision.decisionId,
      idempotencyKey: "proposal-version:prvr_v1:item:cruise_sailing_2026_11_02",
    })
  })
})
