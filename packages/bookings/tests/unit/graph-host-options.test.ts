import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import { describe, expect, it } from "vitest"

import { createBookingsVoyantRuntime } from "../../src/index.js"
import type { BookingRouteRuntime } from "../../src/route-runtime.js"
import { BOOKING_ROUTE_RUNTIME_CONTAINER_KEY } from "../../src/route-runtime.js"
import {
  bookingsAccommodationRuntimePort,
  bookingsFinanceRuntimePort,
  bookingsRelationshipsRuntimePort,
} from "../../src/runtime-port.js"

const PORT_STUBS: Readonly<Record<string, unknown>> = {
  [bookingsAccommodationRuntimePort.id]: { enrichOverviewItems: async () => new Map() },
  [bookingsFinanceRuntimePort.id]: {
    quoteBookingAmendment: async () => ({}),
    recordBookingAmendment: async () => ({}),
  },
  [bookingsRelationshipsRuntimePort.id]: {
    loadPersonTravelSnapshot: async () => null,
    upsertPersonFromContact: async () => null,
    getPersonById: async () => null,
    getOrganizationById: async () => null,
  },
  "custom-fields.runtime": { forWrite: () => undefined },
}

/**
 * The context `composeVoyantGraphRuntime` hands a selected unit, reduced to what
 * this factory reads. Everything the graph supplies arrives here; a
 * graph-composed host has no other channel into the factory.
 */
function factoryContext(
  hostOptions: Readonly<Record<string, unknown>> = {},
): VoyantGraphRuntimeFactoryContext {
  return {
    unitId: "@voyant-travel/bookings",
    api: [{ id: "@voyant-travel/bookings#api.admin", surface: "admin" }],
    hostOptions,
    hasPort: (port: { id: string }) => Object.hasOwn(PORT_STUBS, port.id),
    getPort: async (port: { id: string }) => PORT_STUBS[port.id],
  } as unknown as VoyantGraphRuntimeFactoryContext
}

async function composedRouteRuntime(
  hostOptions: Readonly<Record<string, unknown>>,
  bindings: Record<string, unknown> = {},
): Promise<BookingRouteRuntime> {
  const apiModule = await createBookingsVoyantRuntime(factoryContext(hostOptions))
  const registered = new Map<string, unknown>()
  await apiModule.module.bootstrap?.({
    bindings,
    container: { register: (key: string, value: unknown) => registered.set(key, value) },
  } as never)
  return registered.get(BOOKING_ROUTE_RUNTIME_CONTAINER_KEY) as BookingRouteRuntime
}

describe("bookings graph runtime host options", () => {
  it("installs a host monthly-limit resolver through graph composition", async () => {
    // The gap this closes: before host options, nothing a graph-composed host
    // passed could reach BookingsApiModuleOptions, so a managed tenant whose
    // plan changed mid-process was served the boot-time allowance in silence.
    let live: number | null | undefined = 10
    const runtime = await composedRouteRuntime(
      { resolveMonthlyBookingLimit: () => live },
      { VOYANT_BOOKINGS_MONTHLY_LIMIT: "100" },
    )

    expect(runtime.monthlyBookingLimit).toBe(10)
    live = 250
    expect(runtime.monthlyBookingLimit).toBe(250)
    live = null
    expect(runtime.monthlyBookingLimit).toBeNull()
    live = undefined
    expect(runtime.monthlyBookingLimit).toBe(100)
  })

  it("leaves the configured allowance in force when the host installs nothing", async () => {
    const runtime = await composedRouteRuntime({}, { VOYANT_BOOKINGS_MONTHLY_LIMIT: "100" })
    expect(runtime.monthlyBookingLimit).toBe(100)
  })

  it("keeps port-derived wiring that the host did not override", async () => {
    const runtime = await composedRouteRuntime({ resolveMonthlyBookingLimit: () => 5 })
    // Host options are contributed to the default composition, not a
    // replacement for it: the relationships port is still wired.
    expect(runtime.resolveTravelSnapshot).toBeTypeOf("function")
  })
})
