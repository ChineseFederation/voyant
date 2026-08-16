import { bookingSelectionV1 } from "@voyant-travel/catalog-contracts/booking-engine/contracts"
import { describe, expect, it } from "vitest"

import { type ContractSourceContext, resolveContractVariables } from "./resolve-contract-variables"

/** Minimal valid draft; the schema fills the rest with defaults. */
function makeDraft() {
  return bookingSelectionV1.parse({
    entity: { module: "products", id: "cdmi_demo_dynamic_pkg_20260629", sourceKind: "owned" },
  })
}

function bookingSource(vars: Record<string, unknown>) {
  return (vars.booking as { source: Record<string, unknown> }).source
}

describe("resolveContractVariables — booking.source provenance", () => {
  it("carries sourced provenance + supplier into the contract for connected inventory (voyant#2619)", () => {
    const source: ContractSourceContext = {
      kind: "marketplace:demo",
      connectionId: "srccon_demo_tours",
      ref: "demo-dynamic-pkg-20260629",
      supplier: { id: "sup_demo_tours", name: "Demo Tours" },
    }

    const vars = resolveContractVariables(makeDraft(), {
      entityModule: "products",
      entityId: "cdmi_demo_dynamic_pkg_20260629",
      source,
    })

    expect(bookingSource(vars)).toEqual({
      kind: "marketplace:demo",
      connectionId: "srccon_demo_tours",
      ref: "demo-dynamic-pkg-20260629",
      supplier: { id: "sup_demo_tours", name: "Demo Tours" },
    })
  })

  it("keeps the owned arm (kind=owned, blank supplier) when no source is resolved", () => {
    const vars = resolveContractVariables(makeDraft(), {
      entityModule: "products",
      entityId: "prod_owned_1",
    })

    expect(bookingSource(vars)).toEqual({
      kind: "owned",
      connectionId: "",
      ref: "",
      supplier: { id: "", name: "" },
    })
  })

  it("treats an explicit owned provenance as the owned arm and blanks any supplier", () => {
    const vars = resolveContractVariables(makeDraft(), {
      entityModule: "products",
      entityId: "prod_owned_1",
      source: { kind: "owned", supplier: { name: "In-house" } },
    })

    expect(bookingSource(vars)).toEqual({
      kind: "owned",
      connectionId: "",
      ref: "",
      supplier: { id: "", name: "" },
    })
  })
})

/**
 * The contract states what the shopper is agreeing to pay, so it has to state
 * what will actually be charged. Under a deposit policy the document used to
 * name a single total while the card was charged the deposit, because nothing
 * carried the plan to the acceptance step (voyant#4741).
 *
 * The Quote now publishes the server's plan, and that is the one the document
 * must render — a schedule the storefront computed for itself agrees only for
 * as long as both sides stay in step.
 */
describe("resolveContractVariables — payment plan", () => {
  const PLAN = {
    policySource: "supplier" as const,
    currency: "EUR",
    totalCents: 37_800,
    dueNowCents: 18_900,
    entries: [
      {
        scheduleType: "deposit" as const,
        amountCents: 18_900,
        currency: "EUR",
        dueDate: "2026-08-16",
      },
      {
        scheduleType: "balance" as const,
        amountCents: 18_900,
        currency: "EUR",
        dueDate: "2026-09-06",
      },
    ],
  }

  const BASE = { entityModule: "products", entityId: "prod_owned_1" }

  /** The deposit / balance / policy-source block lives under `booking`. */
  function bookingVars(vars: Record<string, unknown>) {
    return vars.booking as Record<string, unknown>
  }

  it("renders the deposit and balance the server quoted", () => {
    const vars = resolveContractVariables(makeDraft(), { ...BASE, paymentPlan: PLAN })

    expect(bookingVars(vars)).toMatchObject({
      depositAmountCents: 18_900,
      depositDueDate: "2026-08-16",
      balanceAmountCents: 18_900,
      balanceDueDate: "2026-09-06",
      paymentPolicy: { source: "supplier" },
    })
  })

  it("states what is due now, which is not the booking total", () => {
    const vars = resolveContractVariables(makeDraft(), { ...BASE, paymentPlan: PLAN })

    expect((vars.payment as Record<string, unknown>).dueNowCents).toBe(18_900)
  })

  it("carries every instalment through to the template", () => {
    const vars = resolveContractVariables(makeDraft(), { ...BASE, paymentPlan: PLAN })

    expect((vars.payment as { schedule: unknown[] }).schedule).toEqual([
      {
        index: 1,
        type: "deposit",
        amountCents: 18_900,
        currency: "EUR",
        dueDate: "2026-08-16",
        status: "pending",
      },
      {
        index: 2,
        type: "balance",
        amountCents: 18_900,
        currency: "EUR",
        dueDate: "2026-09-06",
        status: "pending",
      },
    ])
  })

  // The server's answer is the one that will be charged, so it outranks a
  // locally computed one rather than merging with it.
  it("prefers the quoted plan over a schedule the host computed itself", () => {
    const vars = resolveContractVariables(makeDraft(), {
      ...BASE,
      paymentPlan: PLAN,
      paymentSchedule: [
        { scheduleType: "full", amountCents: 37_800, currency: "EUR", dueDate: "2026-08-16" },
      ],
      paymentPolicySource: "operator_default",
    })

    expect(bookingVars(vars)).toMatchObject({
      depositAmountCents: 18_900,
      paymentPolicy: { source: "supplier" },
    })
  })

  // Additive: a host quoting against a deployment that publishes no plan keeps
  // the behaviour it had.
  it("falls back to a host-computed schedule when the quote carried no plan", () => {
    const vars = resolveContractVariables(makeDraft(), {
      ...BASE,
      paymentSchedule: [
        { scheduleType: "deposit", amountCents: 5_000, currency: "EUR", dueDate: "2026-08-16" },
      ],
      paymentPolicySource: "listing",
    })

    expect(bookingVars(vars)).toMatchObject({
      depositAmountCents: 5_000,
      paymentPolicy: { source: "listing" },
    })
  })

  // A contract with no schedule at all still owes the total, so `dueNowCents`
  // must not render as a blank or a zero next to a real price.
  it("owes the total when nothing states a plan", () => {
    const vars = resolveContractVariables(makeDraft(), {
      ...BASE,
      pricing: {
        currency: "EUR",
        lines: [],
        taxes: [],
        subtotal: 37_800,
        taxTotal: 0,
        total: 37_800,
      },
    })

    expect((vars.payment as Record<string, unknown>).dueNowCents).toBe(37_800)
  })
})
