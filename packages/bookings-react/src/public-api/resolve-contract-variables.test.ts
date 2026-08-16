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
