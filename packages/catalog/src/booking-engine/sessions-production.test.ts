// agent-quality: file-size exception -- owner: catalog; this suite verifies the
// production Session runtime's cross-port transaction contract as one harness.
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
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SourceAdapter } from "../adapter/contract.js"
import { InvalidBookingSessionSelectionError } from "./errors.js"
import type { OwnedBookingHandler } from "./owned-handler.js"
import { createOwnedBookingHandlerRegistry } from "./owned-handler.js"
import { createSourceAdapterRegistry } from "./registry.js"
import { createInMemoryBookingSessionRepository } from "./sessions-memory.js"
import {
  createProductionBookingSessionModule,
  normalizeProductSelection,
  type ProductionBookingSessionModuleDeps,
} from "./sessions-production.js"
import type { BookingSessionAccessContext } from "./sessions-service.js"

const PRODUCT_TARGET = { kind: "product", productId: "prod_selection" } as const
const PUBLIC_API_ACCESS = {
  publicApiOrigin: { channelId: "chan_public" },
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
  // The handler's descriptor asks for at least one adult, and a Quote now
  // refuses a selection that does not answer what was published — so the
  // baseline selection answers it.
  selection: Record<string, unknown> = { configure: { pax: { adult: 1 } } },
) {
  const created = await module.createSession(
    {
      idempotencyKey: "create_product_session",
      target: PRODUCT_TARGET,
      selection,
    },
    { actorKind: "anonymous", capability: TEST_CAPABILITY, ...PUBLIC_API_ACCESS },
  )
  if (created.kind !== "session_created") throw new Error("session not created")
  const access = {
    actorKind: "anonymous" as const,
    capability: TEST_CAPABILITY,
    ...PUBLIC_API_ACCESS,
  }
  return { created, access }
}

describe("normalizeProductSelection", () => {
  it("normalizes sourced cruise choices while preserving passenger ages and terms", () => {
    const normalized = normalizeProductSelection(PRODUCT_TARGET, {
      configure: {
        sailingId: " encoded_sailing_ref ",
        cabinCategoryId: " encoded_cabin_ref ",
        occupancy: 3,
        passengerComposition: { adults: 2, children: 1, childAges: [9] },
        fareCode: " FLEX ",
        fareVariant: "cruise_only",
        bookingTerms: { refundable: true },
      },
    })

    expect(normalized.configure).toEqual({
      sailingId: "encoded_sailing_ref",
      cabinCategoryId: "encoded_cabin_ref",
      occupancy: 3,
      passengerComposition: { adults: 2, children: 1, childAges: [9] },
      fareCode: "FLEX",
      fareVariant: "cruise_only",
      bookingTerms: { refundable: true },
    })
  })

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
        address: {
          line1: " Str. Lipscani 12 ",
          line2: " Ap. 4 ",
          city: " Cluj-Napoca ",
          region: " RO-CJ ",
          postal: " 400114 ",
          country: " RO ",
          street: "not accepted yet",
        },
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
        address: {
          line1: "Str. Lipscani 12",
          line2: "Ap. 4",
          city: "Cluj-Napoca",
          region: "RO-CJ",
          postal: "400114",
          country: "RO",
        },
      },
      travelers: [
        { rowId: "trav_1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.test" },
      ],
      accommodation: { travelerAssignments: { room_1: "trav_1" } },
      addons: [{ extraId: "extra_1", quantity: 1 }],
    })
  })

  it("carries the promotion code through to the quote", () => {
    // voyant#4615: the field was declared on the public selection and accepted
    // by the route, then projected away here — so no handler could ever see a
    // code and no code could ever change a price.
    expect(normalizeProductSelection(PRODUCT_TARGET, { promotionCode: "  GREEK15 " })).toEqual({
      promotionCode: "GREEK15",
    })
    expect(normalizeProductSelection(PRODUCT_TARGET, { promotionCode: "   " })).toEqual({})
  })

  it("models a Bucharest Sector as the city and the county as an ISO 3166-2 region", () => {
    // Bucharest has no ordinary city/county pair: the six Sectors act as the
    // county-level subdivision. The Sector belongs in `city` and `RO-B` in
    // `region` — the point of voyant#4290 is that neither has to be smuggled
    // through an address line.
    const normalized = normalizeProductSelection(PRODUCT_TARGET, {
      billing: { address: { city: "Sector 3", region: "RO-B", country: "RO" } },
    })

    expect(normalized.billing).toEqual({
      address: { city: "Sector 3", region: "RO-B", country: "RO" },
    })
  })

  it("keeps a free-form county name, since the Booking column it lands in is free-form", () => {
    const normalized = normalizeProductSelection(PRODUCT_TARGET, {
      billing: { address: { region: " Ile-de-France ", country: "FR" } },
    })

    expect(normalized.billing).toEqual({
      address: { region: "Ile-de-France", country: "FR" },
    })
  })

  it("refuses a billing value the commit would refuse, at the step that can still edit it", () => {
    // voyant#4734. `bookingSelectionPublicV1` has carried `postal: max(20)`
    // since #4298 with a comment promising that "an address this schema admits
    // cannot be rejected later by the commit" — but this function projects the
    // billing block value by value instead of parsing it, so the bound never
    // ran. A 25-character postal code was accepted here a dozen times and
    // refused once, by the Booking's own write, after the card was captured.
    let thrown: unknown
    try {
      normalizeProductSelection(PRODUCT_TARGET, {
        billing: { address: { postal: "0".repeat(25), country: "RO" } },
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(InvalidBookingSessionSelectionError)
    expect(thrown).toMatchObject({
      reason: "value_too_long",
      // The name the caller wrote, not `contactPostalCode` — the commit
      // reported the field under a name no client had ever sent.
      path: "billing.address.postal",
      maxLength: 20,
    })
  })

  it("still accepts a billing value of exactly the published width", () => {
    const normalized = normalizeProductSelection(PRODUCT_TARGET, {
      billing: { address: { postal: `  ${"0".repeat(20)}  `, country: "RO" } },
    })

    // Measured after trimming, because that is the value the commit writes.
    expect(normalized.billing).toEqual({
      address: { postal: "0".repeat(20), country: "RO" },
    })
  })

  it.each([
    ["a contact name", { billing: { contact: { firstName: "A".repeat(256) } } }, 255],
    ["a country that is not an ISO alpha-2 code", { billing: { address: { country: "USA" } } }, 2],
    ["a traveler name", { travelers: [{ firstName: "A".repeat(256), lastName: "Lovelace" }] }, 255],
  ])("refuses %s the same way", (_label, selection, maxLength) => {
    // The same projection dropped the bounds off every free-text field, not
    // only the postal code the incident happened to hit.
    expect(() => normalizeProductSelection(PRODUCT_TARGET, selection)).toThrow(
      /booking_session_selection_value_too_long/,
    )
    try {
      normalizeProductSelection(PRODUCT_TARGET, selection)
    } catch (error) {
      expect(error).toMatchObject({ maxLength })
    }
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

describe("composite sourced target authority", () => {
  it("resolves a legacy generic sourced kind from the exact connection and reference", async () => {
    const repository = createInMemoryBookingSessionRepository()
    const registry = createSourceAdapterRegistry()
    const liveResolve = vi.fn<NonNullable<SourceAdapter["liveResolve"]>>(
      async (_context, request) => ({
        values: { [request.ids[0] ?? "missing"]: { priceCents: 104_400, currency: "EUR" } },
      }),
    )
    registry.register("connection_selected", {
      kind: "voyant-connect",
      capabilities: {
        verticals: ["products"],
        supportsLiveResolution: true,
        supportsDriftDetection: false,
        supportsBookingForwarding: false,
        postBookOperations: [],
      },
      liveResolve,
    } as never)
    const predicates: Array<{ sql: string; params: unknown[] }> = []
    const dialect = new PgDialect()
    const selectedRow = {
      entity_module: "products",
      entity_id: "prod_shared",
      source_kind: "voyant-connect",
      source_provider: "tui",
      source_connection_id: "connection_selected",
      source_ref: "selected-package-ref",
      projection: { name: "Selected package" },
      status: "active",
    }
    const module = createProductionBookingSessionModule({
      db: {
        select: () => ({
          from: () => ({
            where: (condition: SQL) => ({
              limit: async () => {
                predicates.push(dialect.sqlToQuery(condition))
                return [selectedRow]
              },
            }),
          }),
        }),
        transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation({}),
      } as never,
      repository,
      resolveOwnedHandlers: () => createOwnedBookingHandlerRegistry(),
      resolveSourceRegistry: () => registry,
      resolveCompositeHandler: () => ({
        composeRequirements: ({ session, leaf }) =>
          leaf.composeRequirements({
            session: {
              ...session,
              target: { kind: "catalog_item", catalogItemId: "prod_shared" },
              sourcedTargetPin: {
                entityModule: "products",
                entityId: "prod_shared",
                sourceKind: "sourced",
                sourceProvider: null,
                sourceConnectionId: "connection_selected",
                sourceRef: "selected-package-ref",
                projection: { title: "Selected package" },
                title: "Selected package",
              },
            },
            now: new Date("2026-08-11T12:00:00.000Z"),
            tx: undefined,
          }),
        composeQuote: ({ session, leaf }) =>
          leaf.composeQuote({
            session: {
              ...session,
              target: { kind: "catalog_item", catalogItemId: "prod_shared" },
              sourcedTargetPin: {
                entityModule: "products",
                entityId: "prod_shared",
                sourceKind: "sourced",
                sourceProvider: null,
                sourceConnectionId: "connection_selected",
                sourceRef: "selected-package-ref",
                projection: { title: "Selected package" },
                title: "Selected package",
              },
            },
            now: new Date("2026-08-11T12:00:00.000Z"),
            tx: undefined,
          }),
        placeCapacityHold: async () => "held",
        releaseCapacityHold: async () => undefined,
        commit: async () => ({ kind: "committed", bookings: [] }),
      }),
    })

    const outcome = await module.createCompositeSession(
      {
        idempotencyKey: "legacy_generic_source_kind",
        target: {
          kind: "trip_snapshot",
          tripSnapshotId: "trsn_legacy",
          tripEnvelopeId: "trip_legacy",
        },
        selection: { configure: { pax: { adult: 2 } } },
      },
      {
        actorKind: "anonymous",
        capability: TEST_CAPABILITY,
        ...PUBLIC_API_ACCESS,
      },
    )

    expect(outcome.kind).toBe("session_created")
    expect(liveResolve).toHaveBeenCalledWith(
      { connection_id: "connection_selected" },
      expect.objectContaining({
        ids: ["prod_shared"],
        source_refs: { prod_shared: "selected-package-ref" },
      }),
    )
    expect(predicates).toHaveLength(2)
    for (const predicate of predicates) {
      expect(predicate.params).not.toContain("sourced")
      expect(predicate.params).toContain("connection_selected")
      expect(predicate.params).toContain("selected-package-ref")
    }
  })

  it("quotes the exact internal supplier pin without re-resolving a conflicting Catalog row", async () => {
    const repository = createInMemoryBookingSessionRepository()
    const registry = createSourceAdapterRegistry()
    const liveResolve = vi.fn<NonNullable<SourceAdapter["liveResolve"]>>(
      async (_context, request) => {
        const id = request.ids[0] ?? "missing"
        return { values: { [id]: { priceCents: 104_400, currency: "EUR" } } }
      },
    )
    registry.register("connection_selected", {
      kind: "voyant-connect",
      capabilities: {
        verticals: ["products"],
        supportsLiveResolution: true,
        supportsDriftDetection: false,
        supportsBookingForwarding: false,
        postBookOperations: [],
      },
      liveResolve,
    } as never)
    const access = {
      actorKind: "anonymous" as const,
      capability: TEST_CAPABILITY,
      ...PUBLIC_API_ACCESS,
    }
    let sourcedEntryReads = 0
    const sourcedEntryPredicates: Array<{ sql: string; params: unknown[] }> = []
    const dialect = new PgDialect()
    const module = createProductionBookingSessionModule({
      db: {
        select: () => ({
          from: () => ({
            where: (condition: SQL) => ({
              limit: async () => {
                sourcedEntryPredicates.push(dialect.sqlToQuery(condition))
                sourcedEntryReads += 1
                if (sourcedEntryReads % 2 === 1) return []
                return [
                  {
                    entity_module: "products",
                    entity_id: "prod_shared",
                    source_kind: "other-source",
                    source_provider: "other-provider",
                    source_connection_id: "connection_other",
                    source_ref: "other-package-ref",
                    projection: { name: "Canonical package title" },
                    status: "active",
                  },
                ]
              },
            }),
          }),
        }),
        transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation({}),
      } as never,
      repository,
      resolveOwnedHandlers: () => createOwnedBookingHandlerRegistry(),
      resolveSourceRegistry: () => registry,
      resolveCompositeHandler: () => ({
        composeRequirements: ({ session, leaf }) =>
          leaf.composeRequirements({
            session: {
              ...session,
              target: { kind: "catalog_item", catalogItemId: "prod_shared" },
              sourcedTargetPin: {
                entityModule: "products",
                entityId: "prod_shared",
                sourceKind: "voyant-connect",
                sourceProvider: "voyant-connect",
                sourceConnectionId: "connection_selected",
                sourceRef: "selected-package-ref",
                projection: { title: "Selected package" },
                title: "Selected package",
              },
            },
            now: new Date("2026-08-11T12:00:00.000Z"),
            tx: undefined,
          }),
        composeQuote: ({ session, leaf }) =>
          leaf.composeQuote({
            session: {
              ...session,
              target: { kind: "catalog_item", catalogItemId: "prod_shared" },
              sourcedTargetPin: {
                entityModule: "products",
                entityId: "prod_shared",
                sourceKind: "voyant-connect",
                sourceProvider: "voyant-connect",
                sourceConnectionId: "connection_selected",
                sourceRef: "selected-package-ref",
                projection: { title: "Selected package" },
                title: "Selected package",
              },
            },
            now: new Date("2026-08-11T12:00:00.000Z"),
            tx: undefined,
          }),
        placeCapacityHold: async () => "held",
        releaseCapacityHold: async () => undefined,
        commit: async () => ({ kind: "committed", bookings: [] }),
      }),
    })

    const outcome = await module.createCompositeSession(
      {
        idempotencyKey: "selected_package_composite",
        target: {
          kind: "trip_snapshot",
          tripSnapshotId: "trsn_selected",
          tripEnvelopeId: "trip_selected",
        },
        selection: {
          configure: {
            departureDate: "2026-10-15",
            departureAirportCode: "OTP",
            nights: 3,
            pax: { adult: 2 },
          },
        },
      },
      access,
    )

    expect(outcome.kind).toBe("session_created")
    expect(liveResolve).toHaveBeenCalledWith(
      { connection_id: "connection_selected" },
      expect.objectContaining({
        ids: ["prod_shared"],
        source_refs: { prod_shared: "selected-package-ref" },
      }),
    )
    expect(repository.sessions.size).toBe(1)
    expect(sourcedEntryReads).toBe(4)
    expect(sourcedEntryPredicates).toHaveLength(4)
    for (const predicate of sourcedEntryPredicates) {
      expect(predicate.sql).toContain('"catalog_sourced_entries"."entity_module"')
      expect(predicate.params).toContain("products")
    }
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

  it("prices a promotion code the caller supplied and commits at the discounted total", async () => {
    // voyant#4615 end to end: the code reaches the evaluator at all, the quote
    // total drops, and the amount the booking is created at follows the quote
    // rather than the undiscounted catalogue price.
    const evaluated: Array<{
      productId: string
      code: string | null | undefined
      basePriceCents: number
      baseCurrency: string
      pax: number | undefined
    }> = []
    const module = createCommittableProductionModule(
      { productId: "prod_1" },
      undefined,
      undefined,
      () => async (input) => {
        evaluated.push({
          productId: input.productId,
          code: input.code,
          basePriceCents: input.basePriceCents,
          baseCurrency: input.baseCurrency,
          pax: input.pax,
        })
        return {
          applied: [
            {
              offerId: "prof_greek",
              offerName: "Greek islands late summer",
              discountAppliedCents: 1500,
              discountedPriceCents: 8500,
              currency: "EUR",
              discountKind: "percentage" as const,
              discountPercent: 15,
              discountAmountCents: null,
              appliedCode: input.code ?? null,
              stackable: false,
            },
          ],
          total: { discountAppliedCents: 1500, discountedPriceCents: 8500 },
          codeStatus: { kind: "code_valid" as const },
        }
      },
    )
    const access = {
      actorKind: "anonymous" as const,
      capability: TEST_CAPABILITY,
      ...PUBLIC_API_ACCESS,
    }
    const created = await module.createSession(
      {
        ...committableCreateInput("create_promotion"),
        selection: {
          ...committableCreateInput("ignored").selection,
          promotionCode: "GREEK15",
        },
      },
      access,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_promotion" },
      access,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")

    expect(evaluated[0]).toMatchObject({
      productId: "prod_selection",
      code: "GREEK15",
      basePriceCents: 10_000,
      baseCurrency: "EUR",
      pax: 1,
    })
    expect(quoted.quote.pricing.total).toBe(8500)
    expect(quoted.quote.pricing.promotionCodeStatus).toEqual({ kind: "code_valid" })
    expect(quoted.quote.pricing.appliedOffers).toHaveLength(1)
    expect(quoted.quote.pricing.lines.at(-1)).toMatchObject({
      kind: "discount",
      totalAmount: -1500,
    })
  })

  it("reports a rejected code on an otherwise good quote instead of failing it", async () => {
    const module = createCommittableProductionModule(
      { productId: "prod_1" },
      undefined,
      undefined,
      () => async () => ({
        applied: [],
        total: { discountAppliedCents: 0, discountedPriceCents: 10_000 },
        codeStatus: { kind: "code_not_found" as const },
      }),
    )
    const access = {
      actorKind: "anonymous" as const,
      capability: TEST_CAPABILITY,
      ...PUBLIC_API_ACCESS,
    }
    const created = await module.createSession(
      {
        ...committableCreateInput("create_bad_promotion"),
        selection: {
          ...committableCreateInput("ignored").selection,
          promotionCode: "NOPE",
        },
      },
      access,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_bad_promotion" },
      access,
    )

    // The departure is still bookable — the code is the only thing wrong, and
    // conflating the two is what made the form call a good departure invalid.
    if (quoted.kind !== "quote_created") throw new Error("quote not created")
    expect(quoted.quote.pricing.total).toBe(10_000)
    expect(quoted.quote.pricing.promotionCodeStatus).toEqual({ kind: "code_not_found" })
  })

  it("does not let a code read as applied when no promotions module is wired", async () => {
    // No evaluator: the quote is priced and carries no rejection, which a
    // client reads as "applied" — so the code has to be answered explicitly.
    const module = createCommittableProductionModule({ productId: "prod_1" })
    const access = {
      actorKind: "anonymous" as const,
      capability: TEST_CAPABILITY,
      ...PUBLIC_API_ACCESS,
    }
    const created = await module.createSession(
      {
        ...committableCreateInput("create_unwired_promotion"),
        selection: {
          ...committableCreateInput("ignored").selection,
          promotionCode: "GREEK15",
        },
      },
      access,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_unwired_promotion" },
      access,
    )

    if (quoted.kind !== "quote_created") throw new Error("quote not created")
    expect(quoted.quote.pricing.total).toBe(10_000)
    expect(quoted.quote.pricing.promotionCodeStatus).toEqual({ kind: "code_not_found" })
  })

  it("keeps quoting at full price when promotion evaluation throws", async () => {
    const module = createCommittableProductionModule(
      { productId: "prod_1" },
      undefined,
      undefined,
      () => async () => {
        throw new Error("promotions unavailable")
      },
    )
    const access = {
      actorKind: "anonymous" as const,
      capability: TEST_CAPABILITY,
      ...PUBLIC_API_ACCESS,
    }
    const created = await module.createSession(
      committableCreateInput("create_promotion_failure"),
      access,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_promotion_failure" },
      access,
    )

    if (quoted.kind !== "quote_created") throw new Error("quote not created")
    expect(quoted.quote.pricing.total).toBe(10_000)
    expect(quoted.quote.pricing.promotionCodeStatus).toBeUndefined()
  })

  it("carries frozen quote cancellation terms into the server-held create command", async () => {
    const policy = {
      policyId: "pol_cancellation",
      policyVersionId: "polv_sale",
      version: 3,
      rules: [{ daysBeforeDeparture: 30, refundPercent: 80 }],
    }
    const module = createCommittableProductionModule({}, { cancellationSnapshot: policy })
    const access = {
      actorKind: "anonymous" as const,
      capability: TEST_CAPABILITY,
      ...PUBLIC_API_ACCESS,
    }
    const created = await module.createSession(committableCreateInput("create_terms"), access)
    if (created.kind !== "session_created") throw new Error("session not created")
    const prepared = await quoteAndHoldForCommit(
      module,
      created.session.id,
      created.session.revision,
      access,
      "terms",
    )

    await module.commitSession(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        ...prepared,
        idempotencyKey: "commit_terms",
      },
      access,
    )

    expect(financeCreate.resolvedCommand).toMatchObject({
      cancellationTermsEvidence: {
        schemaVersion: 1,
        source: "booking_quote",
        sourceId: prepared.quoteId,
        policy,
      },
    })
    expect(
      (financeCreate.resolvedCommand?.cancellationTermsEvidence as { capturedAt: string })
        .capturedAt,
    ).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("projects checkout contract acceptance into system-owned booking evidence", async () => {
    const module = createCommittableProductionModule()
    const access = {
      actorKind: "anonymous" as const,
      capability: TEST_CAPABILITY,
      ...PUBLIC_API_ACCESS,
    }
    const created = await module.createSession(
      {
        ...committableCreateInput("create_contract_acceptance"),
        selection: {
          ...committableCreateInput("ignored").selection,
          contractAcceptance: {
            acceptedAt: "2026-08-10T12:00:00.000Z",
            acceptedMarketing: false,
            templateId: "clt_1",
            templateVersionId: "cltv_1",
            contentDigest: `booking-contract-acceptance:v1:sha256:${"a".repeat(64)}`,
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
      "contract_acceptance",
    )

    await module.commitSession(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        ...prepared,
        idempotencyKey: "commit_contract_acceptance",
      },
      access,
    )

    expect(financeCreate.resolvedCommand?.internalNotes).toBe(
      `__contract_acceptance__:{"acceptedAt":"2026-08-10T12:00:00.000Z","acceptedMarketing":false,"templateId":"clt_1","templateVersionId":"cltv_1","contentDigest":"booking-contract-acceptance:v1:sha256:${"a".repeat(64)}"}`,
    )
  })

  it("commits a guest booking when email and phone are both optional", async () => {
    const createPersonWithoutContactMatch = vi.fn(async () => ({ id: "per_contactless_buyer" }))
    const module = createCommittableProductionModule({}, undefined, createPersonWithoutContactMatch)
    const access = {
      actorKind: "anonymous" as const,
      capability: TEST_CAPABILITY,
      ...PUBLIC_API_ACCESS,
    }
    const created = await module.createSession(
      {
        idempotencyKey: "create_contactless_buyer",
        target: PRODUCT_TARGET,
        selection: {
          configure: { pax: { adult: 1 }, departureSlotId: "slot_1" },
          billing: { buyerType: "B2C", contact: { firstName: "E2E", lastName: "Final" } },
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
      "contactless_buyer",
    )

    const committed = await module.commitSession(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        ...prepared,
        idempotencyKey: "commit_contactless_buyer",
      },
      access,
    )

    expect(committed).toMatchObject({
      kind: "commit_result",
      outcome: { kind: "committed", booking: { id: "book_committed" } },
    })
    expect(createPersonWithoutContactMatch).toHaveBeenCalledWith(expect.anything(), {
      firstName: "E2E",
      lastName: "Final",
      source: "booking-session-v1-guest",
      sourceRef: created.session.id,
    })
  })

  it("returns incomplete_draft when the optional Relationships runtime is absent", async () => {
    const module = createCommittableProductionModule({}, undefined, null)
    const access = {
      actorKind: "anonymous" as const,
      capability: TEST_CAPABILITY,
      ...PUBLIC_API_ACCESS,
    }
    const created = await module.createSession(
      {
        idempotencyKey: "create_without_relationships",
        target: PRODUCT_TARGET,
        selection: {
          configure: { pax: { adult: 1 }, departureSlotId: "slot_1" },
          billing: {
            buyerType: "B2C",
            contact: { firstName: "Valid", lastName: "Buyer", email: "buyer@example.test" },
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
      "without_relationships",
    )

    const committed = await module.commitSession(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        ...prepared,
        idempotencyKey: "commit_without_relationships",
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

  it.each([
    [
      "anonymous",
      {
        actorKind: "anonymous",
        capability: TEST_CAPABILITY,
        publicApiOrigin: { channelId: "chan_public" },
      } satisfies BookingSessionAccessContext,
      { publicApiOrigin: { channelId: "chan_public" } },
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
  ])("passes only trusted %s public API origin to Finance", async (_label, access, expected) => {
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
        requirementsFingerprint: quoted.quote.requirementsFingerprint,
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
      expect(financeCreate.createFromSession.mock.calls[0]?.[0]).not.toHaveProperty(
        "publicApiOrigin",
      )
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
        requirementsFingerprint: prepared.requirementsFingerprint,
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
    const createPersonWithoutContactMatch = vi.fn(async () => ({ id: "per_contact_match" }))
    const module = createCommittableProductionModule({}, undefined, createPersonWithoutContactMatch)
    const created = await module.createSession(committableCreateInput("create_adopted_customer"), {
      actorKind: "anonymous",
      capability: TEST_CAPABILITY,
      ...PUBLIC_API_ACCESS,
    })
    if (created.kind !== "session_created") throw new Error("session not created")
    const customerAccess = {
      actorKind: "customer" as const,
      principalId: "customer_1",
      buyerAccountId: "personal:customer_1",
      buyerAccountKind: "personal" as const,
      relationshipPersonId: "per_customer_1",
      capability: TEST_CAPABILITY,
      ...PUBLIC_API_ACCESS,
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
        requirementsFingerprint: prepared.requirementsFingerprint,
        holdId: prepared.holdId,
        idempotencyKey: "commit_adopted_customer",
      },
      customerAccess,
    )

    expect(financeCreate.createFromSession).toHaveBeenCalledWith(
      expect.objectContaining({
        publicApiOrigin: PUBLIC_API_ACCESS.publicApiOrigin,
        userId: "customer_1",
        caller: { personId: "per_customer_1" },
        customerAccess: {
          buyerAccountId: "personal:customer_1",
          buyerAccountKind: "personal",
        },
      }),
    )
    expect(createPersonWithoutContactMatch).not.toHaveBeenCalled()
  })

  it("creates and atomically links a fresh Person for an unlinked personal Buyer Account", async () => {
    const createPersonWithoutContactMatch = vi.fn(async () => ({ id: "per_new_customer" }))
    const ensurePersonalBuyerPerson = vi.fn(async (_tx, input) =>
      input.createPerson({
        firstName: "New",
        lastName: "Customer",
      }),
    )
    const module = createCommittableProductionModule({}, undefined, null, undefined, {
      relationships: {
        createPersonWithoutContactMatch,
      } as never,
      personalBuyerPerson: { ensurePersonalBuyerPerson },
    })
    const access = {
      actorKind: "customer" as const,
      principalId: "customer_without_person",
      buyerAccountId: "personal:customer_without_person",
      buyerAccountKind: "personal" as const,
      ...PUBLIC_API_ACCESS,
    }
    const created = await module.createSession(
      committableCreateInput("create_unlinked_personal_customer"),
      access,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const prepared = await quoteAndHoldForCommit(
      module,
      created.session.id,
      created.session.revision,
      access,
      "unlinked_personal_customer",
    )

    await module.commitSession(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        quoteId: prepared.quoteId,
        requirementsFingerprint: prepared.requirementsFingerprint,
        holdId: prepared.holdId,
        idempotencyKey: "commit_unlinked_personal_customer",
      },
      access,
    )

    expect(ensurePersonalBuyerPerson).toHaveBeenCalledOnce()
    expect(createPersonWithoutContactMatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        firstName: "New",
        lastName: "Customer",
        source: "customer-buyer-account",
        sourceRef: "customer_without_person",
      }),
    )
    expect(financeCreate.createFromSession).toHaveBeenCalledWith(
      expect.objectContaining({ caller: { personId: "per_new_customer" } }),
    )
  })

  it("uses the trusted business Buyer Account organization without contact matching", async () => {
    const createPersonWithoutContactMatch = vi.fn(async () => ({ id: "per_contact_match" }))
    const module = createCommittableProductionModule({}, undefined, createPersonWithoutContactMatch)
    const access = {
      actorKind: "customer" as const,
      principalId: "member_1",
      buyerAccountId: "business:auth_org_1",
      buyerAccountKind: "business" as const,
      authOrganizationId: "auth_org_1",
      relationshipOrganizationId: "org_1",
      membershipId: "membership_1",
      membershipRole: "member",
      ...PUBLIC_API_ACCESS,
    }
    const created = await module.createSession(
      committableCreateInput("create_business_customer"),
      access,
    )
    if (created.kind !== "session_created") throw new Error("session not created")
    const prepared = await quoteAndHoldForCommit(
      module,
      created.session.id,
      created.session.revision,
      access,
      "business_customer",
    )

    await module.commitSession(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        quoteId: prepared.quoteId,
        requirementsFingerprint: prepared.requirementsFingerprint,
        holdId: prepared.holdId,
        idempotencyKey: "commit_business_customer",
      },
      access,
    )

    expect(financeCreate.createFromSession).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: { personId: undefined },
        customerAccess: {
          buyerAccountId: "business:auth_org_1",
          buyerAccountKind: "business",
          membershipId: "membership_1",
          membershipRole: "member",
        },
      }),
    )
    expect(createPersonWithoutContactMatch).not.toHaveBeenCalled()
  })

  it("preserves pinned provenance when admitted staff commits a public API session", async () => {
    const module = createCommittableProductionModule()
    const anonymousAccess = {
      actorKind: "anonymous" as const,
      capability: TEST_CAPABILITY,
      ...PUBLIC_API_ACCESS,
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
        requirementsFingerprint: prepared.requirementsFingerprint,
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
      expect.objectContaining({ publicApiOrigin: PUBLIC_API_ACCESS.publicApiOrigin }),
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
        nextAction: "request_hold_for_expected_quantity",
      },
    })
    expect(placeHoldCalls).toBe(0)
  })

  it("holds the session's own party size when the caller names no quantity", async () => {
    // voyant#4655: this is the public API client's request shape. It named no
    // quantity, the server invented `1`, the capacity port expected the two
    // travelers the selection states, and the rejection asked for a retry that
    // could only be rejected the same way — forever.
    const placeHoldRequests: Array<Record<string, unknown>> = []
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
        placeHoldRequests.push(request.parameters as Record<string, unknown>)
        return { status: "held", holdToken: request.draftId ?? "hold", expiresAt: new Date() }
      },
    })
    const { created, access } = await createAnonymousSession(module, {
      configure: { pax: { adult: 2 }, departureSlotId: "slot_1" },
    })
    const quoted = await module.quoteSession(
      created.session.id,
      { expectedRevision: created.session.revision, idempotencyKey: "quote_default_quantity" },
      access,
    )
    if (quoted.kind !== "quote_created") throw new Error("quote not created")

    const held = await module.placeHold(
      created.session.id,
      {
        expectedRevision: created.session.revision,
        quoteId: quoted.quote.id,
        idempotencyKey: "hold_default_quantity",
      },
      access,
    )

    if (held.kind !== "hold_created") throw new Error(`hold rejected: ${JSON.stringify(held)}`)
    expect(held.hold.quantity).toBe(2)
    expect(placeHoldRequests).toHaveLength(1)
    expect(placeHoldRequests[0]?.paxCount).toBe(2)
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
        requirementsFingerprint: quoted.quote.requirementsFingerprint,
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

function createCommittableProductionModule(
  command: Record<string, unknown> = {},
  upstreamPayload?: Record<string, unknown>,
  createPersonWithoutContactMatch:
    | NonNullable<
        ProductionBookingSessionModuleDeps["relationships"]
      >["createPersonWithoutContactMatch"]
    | null = async () => ({ id: "per_buyer" }) as never,
  resolvePromotionEvaluator?: ProductionBookingSessionModuleDeps["resolvePromotionEvaluator"],
  billingDeps?: Pick<ProductionBookingSessionModuleDeps, "relationships" | "personalBuyerPerson">,
) {
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
        upstreamPayload,
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
    ...(billingDeps?.relationships
      ? { relationships: billingDeps.relationships }
      : createPersonWithoutContactMatch
        ? { relationships: { createPersonWithoutContactMatch } as never }
        : {}),
    ...(billingDeps?.personalBuyerPerson
      ? { personalBuyerPerson: billingDeps.personalBuyerPerson }
      : {}),
    ...(resolvePromotionEvaluator ? { resolvePromotionEvaluator } : {}),
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
  return {
    quoteId: quoted.quote.id,
    requirementsFingerprint: quoted.quote.requirementsFingerprint,
    holdId: held.hold.id,
  }
}
