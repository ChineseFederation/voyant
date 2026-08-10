import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { inspectToolProtocolFieldInventory } from "../lib/tool-protocol-field-inventory.mjs"

const observed = [
  { id: "@voyant-travel/example:create_thing:input.idempotencyKey", serverResolved: false },
]
const classified = {
  frameworkControls: [
    {
      field: "_voyant",
      ownership: "server-issued-continuation",
      rationale: "Carries confirmation and an approval id issued by the platform.",
    },
  ],
  entries: [
    {
      id: observed[0].id,
      ownership: "caller-owned-command-identity",
      rationale: "The caller chooses the stable identity of this retryable business command.",
    },
  ],
}

describe("tool protocol field inventory", () => {
  it("accepts an exact classified inventory", () => {
    assert.deepEqual(inspectToolProtocolFieldInventory(observed, classified), {
      diagnostics: [],
      total: 1,
    })
  })

  it("fails closed when a new field is not classified", () => {
    const result = inspectToolProtocolFieldInventory(observed, {
      frameworkControls: classified.frameworkControls,
      entries: [],
    })
    assert.match(result.diagnostics[0], /unclassified caller-facing protocol field/)
  })

  it("rejects stale entries and missing rationale", () => {
    const result = inspectToolProtocolFieldInventory([], {
      frameworkControls: classified.frameworkControls,
      entries: [{ id: observed[0].id, ownership: "server-owned", rationale: "short" }],
    })
    assert.ok(result.diagnostics.some((message) => message.includes("stale inventory entry")))
  })

  it("rejects a server-owned key even when someone classifies it", () => {
    const result = inspectToolProtocolFieldInventory([{ ...observed[0], serverResolved: true }], {
      frameworkControls: classified.frameworkControls,
      entries: [
        {
          ...classified.entries[0],
          ownership: "server-owned",
        },
      ],
    })
    assert.ok(result.diagnostics.some((message) => message.includes("must not be advertised")))
  })
})
