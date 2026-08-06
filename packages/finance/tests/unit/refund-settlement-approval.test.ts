import { evaluateActionLedgerCapabilityAccess } from "@voyant-travel/action-ledger"
import { describe, expect, it } from "vitest"

import {
  FINANCE_REFUND_CAPABILITY,
  FINANCE_REFUND_SETTLEMENT_CAPABILITY,
  refundSettlementNeedsApproval,
} from "../../src/refund-authorization.js"

function accessFor(input: { callerType?: string; scopes?: readonly string[] }) {
  return evaluateActionLedgerCapabilityAccess({
    definition: FINANCE_REFUND_SETTLEMENT_CAPABILITY,
    actor: "someone",
    callerType: input.callerType ?? "user",
    scopes: input.scopes ?? ["finance:refund"],
    isInternalRequest: false,
  })
}

describe("refund settlement approval", () => {
  it("keeps the grant, risk and irreversibility of finance:refund", () => {
    // Spread from the accounting leg on purpose: a deployment that has decided
    // who may refund has decided this too, and the two cannot drift.
    expect(FINANCE_REFUND_SETTLEMENT_CAPABILITY.requiredGrants).toEqual(
      FINANCE_REFUND_CAPABILITY.requiredGrants,
    )
    expect(FINANCE_REFUND_SETTLEMENT_CAPABILITY.risk).toBe(FINANCE_REFUND_CAPABILITY.risk)
    expect(FINANCE_REFUND_SETTLEMENT_CAPABILITY.reversible).toBe(false)
    expect(FINANCE_REFUND_SETTLEMENT_CAPABILITY.ledgerPolicy).toBe("required")
  })

  it("carries its own capability id, because the graph keys one per action", () => {
    expect(FINANCE_REFUND_SETTLEMENT_CAPABILITY.id).not.toBe(FINANCE_REFUND_CAPABILITY.id)
    expect(FINANCE_REFUND_SETTLEMENT_CAPABILITY.id).toBe("finance:refund-settlement")
  })

  it("does not send a member of staff holding the grant round an approval loop", () => {
    // They are the approver. A second click that approves their own refund is
    // not a control, and the screen explaining it is pure confusion.
    const access = accessFor({ callerType: "user" })
    expect(access.allowed).toBe(true)
    expect(refundSettlementNeedsApproval(access, "user")).toBe(false)
  })

  it("still requires approval for an agent, whatever grant it carries", () => {
    const access = accessFor({ callerType: "agent" })
    expect(access.allowed).toBe(true)
    // The point of the approval is that a *person* signed off on money leaving.
    expect(refundSettlementNeedsApproval(access, "agent")).toBe(true)
  })

  it("does not require approval for an api token or an internal caller", () => {
    expect(refundSettlementNeedsApproval(accessFor({ callerType: "api_key" }), "api_key")).toBe(
      false,
    )
    expect(refundSettlementNeedsApproval(accessFor({ callerType: "internal" }), "internal")).toBe(
      false,
    )
  })

  it("asks for no approval at all when the caller was denied", () => {
    // Nothing to approve — the answer is 403, not a pending request.
    const denied = evaluateActionLedgerCapabilityAccess({
      definition: FINANCE_REFUND_SETTLEMENT_CAPABILITY,
      actor: "someone",
      callerType: "agent",
      scopes: [],
      isInternalRequest: false,
    })
    expect(denied.allowed).toBe(false)
    expect(refundSettlementNeedsApproval(denied, "agent")).toBe(false)
  })

  it("leaves the accounting leg's own policy alone", () => {
    // Issuing the credit note is unchanged: `required` for everyone.
    expect(FINANCE_REFUND_CAPABILITY.approvalPolicy).toBe("required")
    expect(FINANCE_REFUND_SETTLEMENT_CAPABILITY.approvalPolicy).toBe("conditional")
  })
})
