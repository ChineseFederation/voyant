import {
  type BookingsRelationshipsRuntime,
  bookingsRelationshipsRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import type { ProductionBookingSessionModuleDeps } from "@voyant-travel/catalog/booking-engine"
import {
  catalogAccommodationsRuntimeExtensionPort,
  catalogChartersRuntimeExtensionPort,
  catalogCommerceRuntimeExtensionPort,
  catalogCruisesRuntimeExtensionPort,
  catalogDistributionRuntimeExtensionPort,
  catalogInventoryRuntimeExtensionPort,
  catalogLegalRuntimeExtensionPort,
  catalogOperationsRuntimeExtensionPort,
} from "@voyant-travel/catalog/runtime-contracts"
import { financeOperatorSettingsRuntimePort } from "@voyant-travel/finance/runtime-port"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { catalogBookingSessionSettlementRuntimePort } from "./booking-session-settlement-runtime-port.js"
import { createCatalogRuntimePortContribution } from "./runtime-contributor.js"

const productionModuleFactory = vi.hoisted(() => vi.fn())

vi.mock("@voyant-travel/catalog/booking-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@voyant-travel/catalog/booking-engine")>()
  return { ...actual, createProductionBookingSessionModule: productionModuleFactory }
})

describe("managed Booking Session settlement composition", () => {
  beforeEach(() => productionModuleFactory.mockReset())

  it("binds Relationships and Finance through the exported settlement port", async () => {
    const db = { source: "managed" }
    const upsertPersonFromContact = vi.fn(async () => ({ id: "per_buyer" }))
    const relationships = {
      loadPersonTravelSnapshot: vi.fn(async () => null),
      createPersonWithoutContactMatch: vi.fn(async () => ({ id: "per_new_buyer" })),
      upsertPersonFromContact,
      getPersonById: vi.fn(async () => null),
      getOrganizationById: vi.fn(async () => null),
    } satisfies BookingsRelationshipsRuntime
    const createdBookings = new Map<string, string>()
    let bookingCreates = 0

    productionModuleFactory.mockImplementation((deps: ProductionBookingSessionModuleDeps) => ({
      async commitPaidSession(input: {
        bookingSessionId: string
        paymentSessionId: string
      }): Promise<{ bookingId: string }> {
        const replay = createdBookings.get(input.paymentSessionId)
        if (replay) return { bookingId: replay }
        const buyer = await deps.relationships?.upsertPersonFromContact(
          db as never,
          {
            firstName: "Managed",
            lastName: "Buyer",
            email: "buyer@example.test",
            phone: null,
            preferredLanguage: null,
          },
          { source: "booking-session-v1", sourceRef: input.bookingSessionId },
        )
        expect(buyer).toEqual({ id: "per_buyer" })
        expect(deps.financeRuntime).toEqual({})
        bookingCreates += 1
        const bookingId = "book_managed_1"
        createdBookings.set(input.paymentSessionId, bookingId)
        return { bookingId }
      },
    }))

    const extensions: Record<string, unknown> = {
      [catalogAccommodationsRuntimeExtensionPort.id]: {
        fieldPolicy: [],
        propertyFieldPolicy: [],
        registerOwnedAvailabilitySearchHandler: vi.fn(),
      },
      [catalogChartersRuntimeExtensionPort.id]: { fieldPolicy: [] },
      [catalogCommerceRuntimeExtensionPort.id]: {
        loadSliceInputs: vi.fn(async () => ({ markets: [], locales: [] })),
      },
      [catalogCruisesRuntimeExtensionPort.id]: {
        fieldPolicy: [],
        shipFieldPolicy: [],
      },
      [catalogDistributionRuntimeExtensionPort.id]: {
        hasEffectiveSourcePublication: vi.fn(async () => true),
      },
      [catalogInventoryRuntimeExtensionPort.id]: {
        productFieldPolicy: [],
        extrasFieldPolicy: [],
        getProductContent: vi.fn(),
        getOwnedProductById: vi.fn(),
        loadProductReservationPolicy: vi.fn(),
      },
      [catalogLegalRuntimeExtensionPort.id]: {},
      [catalogOperationsRuntimeExtensionPort.id]: { listAvailabilitySlots: vi.fn() },
      [financeOperatorSettingsRuntimePort.id]: {},
    }
    const contribution = createCatalogRuntimePortContribution({
      primitives: {
        env: () => ({}),
        database: { resolve: () => db },
      } as never,
      hasRuntimePort: (port) => Object.hasOwn(extensions, port.id),
      getRuntimePort: (port) => extensions[port.id] as never,
    })
    // Generated contributors are installed in package-name order. Catalog is
    // constructed before Relationships, which contributes this port later.
    extensions[bookingsRelationshipsRuntimePort.id] = relationships
    const settlement = contribution[catalogBookingSessionSettlementRuntimePort.id] as {
      commitPaidSession(input: {
        bookingSessionId: string
        paymentSessionId: string
      }): Promise<{ bookingId: string }>
    }
    const input = {
      bookingSessionId: "bses_paid_1",
      paymentSessionId: "pays_paid_1",
    }

    await expect(settlement.commitPaidSession(input)).resolves.toEqual({
      bookingId: "book_managed_1",
    })
    await expect(settlement.commitPaidSession(input)).resolves.toEqual({
      bookingId: "book_managed_1",
    })

    expect(upsertPersonFromContact).toHaveBeenCalledOnce()
    expect(bookingCreates).toBe(1)
    expect(productionModuleFactory).toHaveBeenCalledTimes(2)
    expect(productionModuleFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        relationships: expect.objectContaining({
          upsertPersonFromContact: expect.any(Function),
        }),
        financeRuntime: {},
      }),
    )
  })

  it("keeps an absent optional Relationships runtime non-throwing", async () => {
    const db = { source: "managed" }
    productionModuleFactory.mockImplementation((deps: ProductionBookingSessionModuleDeps) => ({
      async commitPaidSession(): Promise<{ bookingId: string }> {
        expect(deps.relationships).toBeDefined()
        await expect(
          deps.relationships?.upsertPersonFromContact(
            db as never,
            {
              firstName: "No",
              lastName: "Runtime",
              email: "missing@example.test",
              phone: null,
              preferredLanguage: null,
            },
            { source: "booking-session-v1", sourceRef: "bses_without_relationships" },
          ),
        ).resolves.toBeNull()
        expect(deps.financeRuntime).toEqual({})
        return { bookingId: "book_without_relationships" }
      },
    }))

    const extensions: Record<string, unknown> = {
      [catalogAccommodationsRuntimeExtensionPort.id]: {
        fieldPolicy: [],
        propertyFieldPolicy: [],
        registerOwnedAvailabilitySearchHandler: vi.fn(),
      },
      [catalogChartersRuntimeExtensionPort.id]: { fieldPolicy: [] },
      [catalogCommerceRuntimeExtensionPort.id]: {
        loadSliceInputs: vi.fn(async () => ({ markets: [], locales: [] })),
      },
      [catalogCruisesRuntimeExtensionPort.id]: {
        fieldPolicy: [],
        shipFieldPolicy: [],
      },
      [catalogDistributionRuntimeExtensionPort.id]: {
        hasEffectiveSourcePublication: vi.fn(async () => true),
      },
      [catalogInventoryRuntimeExtensionPort.id]: {
        productFieldPolicy: [],
        extrasFieldPolicy: [],
        getProductContent: vi.fn(),
        getOwnedProductById: vi.fn(),
        loadProductReservationPolicy: vi.fn(),
      },
      [catalogLegalRuntimeExtensionPort.id]: {},
      [catalogOperationsRuntimeExtensionPort.id]: { listAvailabilitySlots: vi.fn() },
      [financeOperatorSettingsRuntimePort.id]: {},
    }
    const contribution = createCatalogRuntimePortContribution({
      primitives: {
        env: () => ({}),
        database: { resolve: () => db },
      } as never,
      hasRuntimePort: () => false,
      getRuntimePort: (port) => extensions[port.id] as never,
    })
    const settlement = contribution[catalogBookingSessionSettlementRuntimePort.id] as {
      commitPaidSession(input: {
        bookingSessionId: string
        paymentSessionId: string
      }): Promise<{ bookingId: string }>
    }

    await expect(
      settlement.commitPaidSession({
        bookingSessionId: "bses_without_relationships",
        paymentSessionId: "pays_without_relationships",
      }),
    ).resolves.toEqual({ bookingId: "book_without_relationships" })
    expect(productionModuleFactory).toHaveBeenCalledOnce()
  })
})
