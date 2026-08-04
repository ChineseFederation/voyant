import { beforeEach, describe, expect, it, vi } from "vitest"

const financeCreate = vi.hoisted(() => ({
  createFromSession: vi.fn(),
  resolvedCommand: undefined as Record<string, unknown> | undefined,
  runtimeDeps: undefined as
    | {
        resolveSource():
          | Promise<{
              resolveBookingSource(input: unknown): Promise<{
                status: "ok"
                command: Record<string, unknown>
              }>
              consumeBookingSource(
                tx: unknown,
                input: { sessionId: string; quoteId: string; bookingId: string },
              ): Promise<void>
            }>
          | {
              resolveBookingSource(input: unknown): Promise<{
                status: "ok"
                command: Record<string, unknown>
              }>
              consumeBookingSource(
                tx: unknown,
                input: { sessionId: string; quoteId: string; bookingId: string },
              ): Promise<void>
            }
      }
    | undefined,
}))

vi.mock("@voyant-travel/finance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@voyant-travel/finance")>()),
  createSelfServiceCreateRuntime: (deps: NonNullable<typeof financeCreate.runtimeDeps>) => {
    financeCreate.runtimeDeps = deps
    return { createFromSession: financeCreate.createFromSession }
  },
}))

import type { BookingRequirementsV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-contracts"
import { defaultRequirementsFlags } from "@voyant-travel/catalog-contracts/booking-engine/requirements-defaults"
import type { OwnedBookingHandler } from "./owned-handler.js"
import { createOwnedBookingHandlerRegistry } from "./owned-handler.js"
import { createSourceAdapterRegistry } from "./registry.js"
import { createInMemoryBookingSessionRepository } from "./sessions-memory.js"
import {
  createProductionBookingSessionModule,
  normalizeProductSelection,
} from "./sessions-production.js"
import type { BookingSessionAccessContext } from "./sessions-service.js"

const PRODUCT_TARGET = { kind: "product", productId: "prod_selection" } as const
const STOREFRONT_ACCESS = {
  storefront: { storefrontId: "sf_public", channelId: "chan_public" },
} as const
const TEST_CAPABILITY = `bcap_${"a".repeat(43)}`

/** Stand-in for a vertical's derivation; only its identity matters here. */
const HANDLER_REQUIREMENTS: BookingRequirementsV1 = {
  ...defaultRequirementsFlags(),
  paxBands: [{ code: "adult", label: "Adult", minCount: 1, maxCount: 8 }],
  paxBandsAllowedTotal: { min: 1, max: 8 },
  travelerFields: [],
  bookingFields: [],
  paymentIntents: ["card"],
}
const HANDLER_REQUIREMENTS_PORT: OwnedBookingHandler["computeRequirements"] = async () => ({
  requirements: HANDLER_REQUIREMENTS,
})

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
    resolveSourceRegistry: () => createSourceAdapterRegistry(),
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
    { actorKind: "anonymous", capability: TEST_CAPABILITY, ...STOREFRONT_ACCESS },
  )
  if (created.kind !== "session_created") throw new Error("session not created")
  const access = {
    actorKind: "anonymous" as const,
    capability: TEST_CAPABILITY,
    ...STOREFRONT_ACCESS,
  }
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

  it.each([
    ["an unknown top-level key", { arbitrary: { nested: true } }],
    ["a field only a future release declares", { loyaltyTier: "gold" }],
    ["an operator-only field a denylist would have to name", { saveAsDraft: true }],
    ["an operator-only redemption", { travelCreditRedemption: { travelCreditId: "tc_1" } }],
  ])("denies %s by default rather than admitting it until someone denies it", (_label, selection) => {
    expect(() => normalizeProductSelection(PRODUCT_TARGET, selection)).toThrow(
      /booking_session_selection_forbidden_field/,
    )
  })

  it("accepts operator booking details only for admitted staff", () => {
    const staffBooking = {
      personId: "per_staff_selected",
      contactFirstName: "Ada",
      contactLastName: "Lovelace",
      contactEmail: "ada@example.test",
      internalNotes: "Call before arrival",
      travelers: [
        {
          clientTravelerKey: "trav_1",
          firstName: "Ada",
          lastName: "Lovelace",
        },
      ],
      paymentSchedules: [
        {
          scheduleType: "balance",
          status: "pending",
          dueDate: "2026-09-01",
          currency: "EUR",
          amountCents: 10_000,
        },
      ],
    }
    const normalized = normalizeProductSelection(
      PRODUCT_TARGET,
      { staffBooking },
      {
        actorKind: "staff",
        principalId: "usr_staff",
        staffAuthority: { admitted: true, reason: "manual_booking" },
        staffBookingAuthority: { admitted: true, reason: "bookings_and_finance_write" },
      },
    )

    expect(normalized).toMatchObject({ staffBooking })
    expect(() =>
      normalizeProductSelection(
        PRODUCT_TARGET,
        { staffBooking },
        {
          actorKind: "customer",
          principalId: "usr_customer",
        },
      ),
    ).toThrow(/booking_session_selection_forbidden_field:selection\.staffBooking/)
  })
})

describe("production Booking Session ports", () => {
  beforeEach(() => {
    financeCreate.createFromSession.mockReset()
    financeCreate.resolvedCommand = undefined
    financeCreate.createFromSession.mockImplementation(async (input) => {
      const source = await financeCreate.runtimeDeps?.resolveSource()
      const resolved = await source?.resolveBookingSource({})
      financeCreate.resolvedCommand = resolved?.command
      await source?.consumeBookingSource(input.db, {
        sessionId: input.sessionId,
        quoteId: input.quoteId,
        bookingId: "book_committed",
      })
      return {
        status: "ok",
        bookingId: "book_committed",
        bookingNumber: "VY-1",
        bookingStatus: "confirmed",
      }
    })
  })

  it.each([
    [
      "anonymous",
      {
        actorKind: "anonymous",
        capability: TEST_CAPABILITY,
        storefront: { storefrontId: "sf_public", channelId: "chan_public" },
      } satisfies BookingSessionAccessContext,
      { storefront: { storefrontId: "sf_public", channelId: "chan_public" } },
    ],
    [
      "staff",
      {
        actorKind: "staff",
        principalId: "usr_staff",
        staffAuthority: { admitted: true, reason: "staff_booking" },
      } satisfies BookingSessionAccessContext,
      {},
    ],
  ])("passes only trusted %s storefront origin to Finance", async (_label, access, expected) => {
    const module = createCommittableProductionModule()
    const created = await module.createSession(
      {
        idempotencyKey: `create_${access.actorKind}`,
        target: PRODUCT_TARGET,
        selection: {
          configure: { pax: { adult: 1 }, departureSlotId: "slot_1" },
          billing: { contact: { email: "buyer@example.test" } },
        },
      },
      access,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const sessionAccess = access
    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: 1, idempotencyKey: `quote_${access.actorKind}` },
      sessionAccess,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")
    const held = await module.placeHold(
      created.session.id,
      {
        expectedRevision: 1,
        quoteId: quoted.quote.id,
        quantity: 1,
        idempotencyKey: `hold_${access.actorKind}`,
      },
      sessionAccess,
    )
    if (held.kind !== "hold_created") throw new Error("hold not created")

    const committed = await module.commitSession(
      created.session.id,
      {
        expectedRevision: 1,
        quoteId: quoted.quote.id,
        holdId: held.hold.id,
        idempotencyKey: `commit_${access.actorKind}`,
      },
      sessionAccess,
    )

    expect(committed).toMatchObject({
      kind: "commit_result",
      outcome: { kind: "committed", booking: { id: "book_committed" } },
    })
    expect(financeCreate.createFromSession).toHaveBeenCalledWith(expect.objectContaining(expected))
    if (access.actorKind === "staff") {
      expect(financeCreate.createFromSession.mock.calls[0]?.[0]).not.toHaveProperty("storefront")
    }
  })

  it("commits admitted staff booking details while Session-owned fields win", async () => {
    const access = {
      actorKind: "staff" as const,
      principalId: "usr_staff",
      staffAuthority: { admitted: true as const, reason: "manual_booking" },
      staffBookingAuthority: {
        admitted: true as const,
        reason: "bookings_and_finance_write",
      },
    }
    const module = createCommittableProductionModule({
      productId: "derived_product",
      optionId: "derived_option",
      slotId: "derived_slot",
      availabilityHoldToken: "derived_hold",
      personId: "per_derived",
    })
    const created = await module.createSession(
      {
        idempotencyKey: "create_staff_details",
        target: PRODUCT_TARGET,
        selection: {
          configure: { pax: { adult: 1 }, departureSlotId: "slot_1" },
          staffBooking: {
            personId: "per_selected",
            contactFirstName: "Ada",
            contactLastName: "Lovelace",
            contactEmail: "ada@example.test",
            internalNotes: "Call before arrival",
            bookingNumber: "CLIENT-1",
            travelers: [
              {
                clientTravelerKey: "trav_1",
                firstName: "Ada",
                lastName: "Lovelace",
                isPrimary: true,
              },
            ],
          },
        },
      },
      access,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const prepared = await quoteAndHoldForCommit(
      module,
      created.session.id,
      created.session.revision,
      access,
      "staff_details",
    )

    await module.commitSession(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        quoteId: prepared.quoteId,
        holdId: prepared.holdId,
        idempotencyKey: "commit_staff_details",
      },
      access,
    )

    expect(financeCreate.resolvedCommand).toMatchObject({
      productId: "derived_product",
      slotId: "derived_slot",
      availabilityHoldToken: "derived_hold",
      personId: "per_selected",
      internalNotes: "Call before arrival",
      travelers: [{ firstName: "Ada", lastName: "Lovelace" }],
    })
    expect(financeCreate.resolvedCommand).not.toHaveProperty("initialStatus")
    expect(financeCreate.resolvedCommand).not.toHaveProperty("bookingNumber")
  })

  it("uses retained provenance when an adopted customer commits", async () => {
    const module = createCommittableProductionModule()
    const created = await module.createSession(committableCreateInput("create_adopted_customer"), {
      actorKind: "anonymous",
      capability: TEST_CAPABILITY,
      ...STOREFRONT_ACCESS,
    })
    if (created.kind !== "session_created") throw new Error("session not created")
    const customerAccess = {
      actorKind: "customer" as const,
      principalId: "customer_1",
      capability: TEST_CAPABILITY,
      ...STOREFRONT_ACCESS,
    }
    const adopted = await module.adoptSession(
      created.session.id,
      { expectedRevision: 1, idempotencyKey: "adopt_before_commit" },
      customerAccess,
    )
    if (adopted.kind !== "session_adopted") throw new Error("session not adopted")
    const prepared = await quoteAndHoldForCommit(
      module,
      created.session.id,
      adopted.session.revision,
      customerAccess,
      "adopted_customer",
    )

    await module.commitSession(
      created.session.id,
      {
        expectedRevision: adopted.session.revision,
        quoteId: prepared.quoteId,
        holdId: prepared.holdId,
        idempotencyKey: "commit_adopted_customer",
      },
      customerAccess,
    )

    expect(financeCreate.createFromSession).toHaveBeenCalledWith(
      expect.objectContaining({ storefront: STOREFRONT_ACCESS.storefront }),
    )
  })

  it("preserves pinned provenance when admitted staff commits a storefront session", async () => {
    const module = createCommittableProductionModule()
    const anonymousAccess = {
      actorKind: "anonymous" as const,
      capability: TEST_CAPABILITY,
      ...STOREFRONT_ACCESS,
    }
    const created = await module.createSession(
      committableCreateInput("create_staff_support"),
      anonymousAccess,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const prepared = await quoteAndHoldForCommit(
      module,
      created.session.id,
      created.session.revision,
      anonymousAccess,
      "staff_support",
    )

    await module.commitSession(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        quoteId: prepared.quoteId,
        holdId: prepared.holdId,
        idempotencyKey: "commit_staff_support",
      },
      {
        actorKind: "staff",
        principalId: "staff_1",
        staffAuthority: { admitted: true, reason: "support_case" },
      },
    )

    expect(financeCreate.createFromSession).toHaveBeenCalledWith(
      expect.objectContaining({ storefront: STOREFRONT_ACCESS.storefront }),
    )
  })

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
      computeRequirements: HANDLER_REQUIREMENTS_PORT,
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
      computeRequirements: HANDLER_REQUIREMENTS_PORT,
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

  it("still returns renderable Requirements when a resolvable target cannot be priced", async () => {
    // The load-bearing case: the target resolved and the wizard is correct,
    // only the price is missing. Dropping the descriptor here is what forced
    // hosts to invent one (voyant#4113).
    const { module } = createProductionHarness({
      entityModule: "products",
      computeRequirements: HANDLER_REQUIREMENTS_PORT,
      async computeQuote() {
        return {
          available: false,
          invalidReason: "no_sell_amount_configured",
          requirements: HANDLER_REQUIREMENTS,
        }
      },
    })
    const { created, access } = await createAnonymousSession(module)

    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_unpriceable" },
      access,
    )

    expect(quoted).toEqual({
      kind: "rejected",
      error: {
        kind: "quote_unavailable",
        requirements: HANDLER_REQUIREMENTS,
        reason: "price_unavailable",
        nextAction: "contact_operator",
      },
    })
  })

  it("publishes Requirements on the Session record before any Quote exists", async () => {
    const { module } = createProductionHarness({
      entityModule: "products",
      computeRequirements: HANDLER_REQUIREMENTS_PORT,
      async computeQuote() {
        return { available: false, invalidReason: "no_sell_amount_configured" }
      },
    })
    const { created } = await createAnonymousSession(module)

    expect(created.session.requirements).toEqual(HANDLER_REQUIREMENTS)
  })

  it("rejects a hold quantity that disagrees with the normalized selection", async () => {
    let placeHoldCalls = 0
    const { module } = createProductionHarness({
      entityModule: "products",
      computeRequirements: HANDLER_REQUIREMENTS_PORT,
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
      computeRequirements: HANDLER_REQUIREMENTS_PORT,
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

function createCommittableProductionModule(command: Record<string, unknown> = {}) {
  const repository = createInMemoryBookingSessionRepository()
  const handlers = createOwnedBookingHandlerRegistry()
  handlers.register({
    entityModule: "products",
    computeRequirements: HANDLER_REQUIREMENTS_PORT,
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
    async placeHold(_context, request) {
      return {
        status: "held",
        holdToken: request.draftId ?? "",
        expiresAt: new Date("2026-08-01T13:00:00.000Z"),
      }
    },
    async deriveSelfServiceCommand() {
      return { status: "ok", command }
    },
  })
  const tx = {
    select: () => ({ from: () => ({ where: async () => [] }) }),
  }
  return createProductionBookingSessionModule({
    db: {
      transaction: async (operation: (input: unknown) => Promise<unknown>) => operation(tx),
    } as never,
    repository,
    resolveOwnedHandlers: () => handlers,
    resolveSourceRegistry: () => createSourceAdapterRegistry(),
    relationships: {
      upsertPersonFromContact: async () => ({ id: "per_buyer" }),
    } as never,
  })
}

function committableCreateInput(idempotencyKey: string) {
  return {
    idempotencyKey,
    target: PRODUCT_TARGET,
    selection: {
      configure: { pax: { adult: 1 }, departureSlotId: "slot_1" },
      billing: { contact: { email: "buyer@example.test" } },
    },
  }
}

async function quoteAndHoldForCommit(
  module: ReturnType<typeof createProductionBookingSessionModule>,
  sessionId: string,
  revision: number,
  access: BookingSessionAccessContext,
  suffix: string,
) {
  const quoted = await module.quoteSession(
    sessionId,
    { expectedRevision: revision, idempotencyKey: `quote_${suffix}` },
    access,
  )
  if (quoted.kind !== "quote_created") throw new Error("quote not created")
  const held = await module.placeHold(
    sessionId,
    {
      expectedRevision: revision,
      quoteId: quoted.quote.id,
      quantity: 1,
      idempotencyKey: `hold_${suffix}`,
    },
    access,
  )
  if (held.kind !== "hold_created") throw new Error("hold not created")
  return { quoteId: quoted.quote.id, holdId: held.hold.id }
}
