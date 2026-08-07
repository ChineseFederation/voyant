import { describe, expect, it } from "vitest"

import {
  cancellationPolicySnapshotV1Schema,
  updatePolicyRuleSchema,
  updatePolicySchema,
} from "./validation.js"

describe("policy update validation", () => {
  it("does not apply create defaults to partial policy updates", () => {
    expect(updatePolicySchema.parse({ description: "Updated" })).toEqual({
      description: "Updated",
    })
  })

  it("does not apply create defaults to partial policy rule updates", () => {
    expect(updatePolicyRuleSchema.parse({ label: "Updated" })).toEqual({
      label: "Updated",
    })
  })
})

describe("cancellation policy snapshots", () => {
  it("requires immutable policy-version identity and normalized rules", () => {
    const snapshot = {
      schemaVersion: 1,
      policyId: "pol_cancel",
      policyVersionId: "polv_sale",
      version: 2,
      capturedAt: "2026-08-07T10:00:00.000Z",
      rules: [
        {
          id: "rule_1",
          daysBeforeDeparture: 30,
          refundPercent: 8000,
          refundType: "cash",
          flatAmountCents: null,
          currency: "EUR",
          label: "30 days",
        },
      ],
    }
    expect(cancellationPolicySnapshotV1Schema.parse(snapshot)).toEqual(snapshot)
    expect(() =>
      cancellationPolicySnapshotV1Schema.parse({ ...snapshot, policyVersionId: "" }),
    ).toThrow()
  })
})
