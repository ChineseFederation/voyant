import { describe, expect, it } from "vitest"

import type { OwnedBookingHandler } from "./owned-handler.js"
import { createOwnedBookingHandlerRegistry } from "./owned-handler.js"
import { createInMemoryBookingSessionRepository } from "./sessions-memory.js"
import {
  createProductionBookingSessionModule,
  normalizeProductSelection,
} from "./sessions-production.js"

const PRODUCT_TARGET = { kind: "product", productId: "prod_selection" } as const

function createProductionHarness(handler: OwnedBookingHandler) {
  const repository = createInMemoryBookingSessionRepository()
  const handlers = createOwnedBookingHandlerRegistry()
  handlers.register(handler)
  const module = createProductionBookingSessionModule({
    db: {
      transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation({}),
    } as never,
    repository,
    resolveOwnedHandlers: () => handlers,
  })
  return { module, repository }
}

async function createAnonymousSession(
  module: ReturnType<typeof createProductionBookingSessionModule>,
  selection: Record<string, unknown> = {},
) {
  const created = await module.createSession(
    {
      idempotencyKey: "create_product_session",
      target: PRODUCT_TARGET,
      selection,
    },
    { actorKind: "anonymous" },
  )
  if (created.kind !== "session_created") throw new Error("session not created")
  const access = { actorKind: "anonymous" as const, capability: created.capability?.token }
  return { created, access }
}

describe("normalizeProductSelection", () => {
  it("projects product selections to the server-owned booking session shape", () => {
    const normalized = normalizeProductSelection(PRODUCT_TARGET, {
      configure: {
        pax: { adult: 2, child: 0, infant: "1" },
        departureSlotId: "  slot_1  ",
        departureDate: "2026-08-01",
        departureTime: "09:30",
        variantId: "variant_a",
        optionSelections: [
          { optionId: "opt_1", optionUnitId: "unit_1", quantity: 2, ignored: "x" },
          { optionId: "opt_2", quantity: 0 },
          "invalid",
        ],
      },
      billing: {
        buyerType: "B2C",
        contact: {
          firstName: " Ada ",
          lastName: " Lovelace ",
          email: "ada@example.test",
          phone: " +400000000 ",
          ignored: "client-only",
        },
        address: { country: " RO ", street: "not accepted yet" },
      },
      travelers: [
        { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", rowId: "trav_1" },
        { loyaltyNumber: "client-owned" },
      ],
      accommodation: { travelerAssignments: { room_1: "trav_1", empty: "" }, nightlyRate: 100 },
      addons: [{ extraId: "extra_1", quantity: 1, cost: 123 }],
      arbitrary: { nested: true },
    })

    expect(normalized).toEqual({
      configure: {
        pax: { adult: 2 },
        departureSlotId: "slot_1",
        departureDate: "2026-08-01",
        departureTime: "09:30",
        variantId: "variant_a",
        optionSelections: [{ optionId: "opt_1", optionUnitId: "unit_1", quantity: 2 }],
      },
      billing: {
        buyerType: "B2C",
        contact: {
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.test",
          phone: "+400000000",
        },
        address: { country: "RO" },
      },
      travelers: [
        { rowId: "trav_1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.test" },
      ],
      accommodation: { travelerAssignments: { room_1: "trav_1" } },
      addons: [{ extraId: "extra_1", quantity: 1 }],
    })
  })

  it.each([
    ["entity", { entity: "products" }],
    ["source", { configure: { source: "supplier" } }],
    ["status", { travelers: [{ firstName: "Ada", status: "confirmed" }] }],
    ["price override", { configure: { priceOverride: { total: 1 } } }],
    ["supplier result", { supplierResult: { reference: "abc" } }],
    ["operator-only field", { billing: { operatorOnly: true } }],
    ["passport plaintext", { travelers: [{ firstName: "Ada", passportNumber: "123" }] }],
    ["document class plaintext", { travelers: [{ firstName: "Ada", document_class: "P" }] }],
  ])("rejects %s", (_label, selection) => {
    expect(() => normalizeProductSelection(PRODUCT_TARGET, selection)).toThrow(
      /booking_session_selection_forbidden_field/,
    )
  })
})

describe("production Booking Session ports", () => {
  it("preserves a valid itemized pricing breakdown from the owned handler", async () => {
    const breakdown = {
      currency: "EUR",
      lines: [
        {
          kind: "base" as const,
          label: "Adult option",
          quantity: 2,
          unitAmount: 5000,
          totalAmount: 10000,
          taxIncluded: true,
        },
      ],
      taxes: [
        {
          code: "VAT",
          label: "VAT",
          rate: 0.2,
          amount: 1667,
          base: 8333,
          includedInPrice: true,
          scope: "included" as const,
        },
      ],
      subtotal: 8333,
      taxTotal: 1667,
      total: 10000,
    }
    const { module } = createProductionHarness({
      entityModule: "products",
      async computeQuote() {
        return {
          available: true,
          pricing: {
            base_amount: 8333,
            taxes: 1667,
            fees: 0,
            surcharges: 0,
            currency: "EUR",
            breakdown,
          },
        }
      },
    })
    const { created, access } = await createAnonymousSession(module)

    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_product_session" },
      access,
    )

    expect(quoted).toMatchObject({ kind: "quote_created", quote: { pricing: breakdown } })
  })

  it("returns a typed rejection when an owned target cannot be quoted", async () => {
    const { module } = createProductionHarness({
      entityModule: "products",
      async computeQuote() {
        return { available: false, invalidReason: "product_not_found" }
      },
    })
    const { created, access } = await createAnonymousSession(module)

    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_missing_product" },
      access,
    )

    expect(quoted).toEqual({
      kind: "rejected",
      error: {
        kind: "quote_unavailable",
        reason: "target_not_found",
        nextAction: "select_alternative_inventory",
      },
    })
  })

  it("rejects a hold quantity that disagrees with the normalized selection", async () => {
    let placeHoldCalls = 0
    const { module } = createProductionHarness({
      entityModule: "products",
      async computeQuote() {
        return {
          available: true,
          pricing: {
            base_amount: 10000,
            taxes: 0,
            fees: 0,
            surcharges: 0,
            currency: "EUR",
          },
        }
      },
      async placeHold() {
        placeHoldCalls += 1
        return { status: "held", holdToken: "hold", expiresAt: new Date() }
      },
    })
    const { created, access } = await createAnonymousSession(module, {
      configure: { pax: { adult: 2 }, departureSlotId: "slot_1" },
    })
    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_quantity" },
      access,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")

    const held = await module.placeHold(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        quoteId: quoted.quote.id,
        quantity: 1,
        idempotencyKey: "hold_wrong_quantity",
      },
      access,
    )

    expect(held).toEqual({
      kind: "rejected",
      error: {
        kind: "hold_quantity_mismatch",
        requestedQuantity: 1,
        expectedQuantity: 2,
        nextAction: "request_new_hold",
      },
    })
    expect(placeHoldCalls).toBe(0)
  })

  it("returns a typed actionable rejection for an incomplete commit", async () => {
    const { module } = createProductionHarness({
      entityModule: "products",
      async computeQuote() {
        return {
          available: true,
          pricing: {
            base_amount: 10000,
            taxes: 0,
            fees: 0,
            surcharges: 0,
            currency: "EUR",
          },
        }
      },
      async placeHold(_ctx, request) {
        return { status: "held", holdToken: request.draftId!, expiresAt: new Date() }
      },
      async deriveSelfServiceCommand() {
        return { status: "rejected", reason: "incomplete_draft" }
      },
    })
    const { created, access } = await createAnonymousSession(module, {
      configure: { pax: { adult: 1 }, departureSlotId: "slot_1" },
    })
    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_incomplete" },
      access,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")
    const held = await module.placeHold(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        quoteId: quoted.quote.id,
        quantity: 1,
        idempotencyKey: "hold_incomplete",
      },
      access,
    )
    if (held.kind !== "hold_created") throw new Error("hold not created")

    const committed = await module.commitSession(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        quoteId: quoted.quote.id,
        holdId: held.hold.id,
        idempotencyKey: "commit_incomplete",
      },
      access,
    )

    expect(committed).toEqual({
      kind: "rejected",
      error: {
        kind: "commit_rejected",
        reason: "incomplete_draft",
        nextAction: "update_selection",
      },
    })
  })
})
