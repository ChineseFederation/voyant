import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import { describe, expect, it } from "vitest"

import { createFinanceVoyantRuntime } from "../../src/index.js"
import type { FinanceRouteRuntime } from "../../src/route-runtime.js"
import { FINANCE_ROUTE_RUNTIME_CONTAINER_KEY } from "../../src/route-runtime.js"
import { financeHostRuntimePort, financeNotificationsRuntimePort } from "../../src/runtime-port.js"

const PORT_STUBS: Readonly<Record<string, unknown>> = {
  [financeHostRuntimePort.id]: {
    primitives: {
      env: (bindings: Record<string, unknown>) => bindings,
      storage: { downloadUrl: async () => "https://example.test/doc" },
    },
  },
  [financeNotificationsRuntimePort.id]: {
    resolveNotificationDispatcher: () => undefined,
    listBookingReminderRuns: async () => [],
  },
  "custom-fields.runtime": { resolveVisibleValues: async () => ({}) },
}

function factoryContext(
  hostOptions: Readonly<Record<string, unknown>> = {},
): VoyantGraphRuntimeFactoryContext {
  return {
    unitId: "@voyant-travel/finance",
    api: [{ id: "@voyant-travel/finance#api.admin", surface: "admin" }],
    hostOptions,
    hasPort: (port: { id: string }) => Object.hasOwn(PORT_STUBS, port.id),
    getPort: async (port: { id: string }) => PORT_STUBS[port.id],
    getPorts: async () => [],
  } as unknown as VoyantGraphRuntimeFactoryContext
}

async function composedRouteRuntime(
  hostOptions: Readonly<Record<string, unknown>>,
  bindings: Record<string, unknown> = {},
): Promise<FinanceRouteRuntime> {
  const apiModule = await createFinanceVoyantRuntime(factoryContext(hostOptions))
  const registered = new Map<string, unknown>()
  await apiModule.module.bootstrap?.({
    bindings,
    container: { register: (key: string, value: unknown) => registered.set(key, value) },
  } as never)
  return registered.get(FINANCE_ROUTE_RUNTIME_CONTAINER_KEY) as FinanceRouteRuntime
}

describe("finance graph runtime host options", () => {
  it("installs a host monthly-limit resolver through graph composition", async () => {
    // Finance accepts bookings, so wiring only the bookings module would serve
    // a live cap from one path and a stale one from this one.
    let live: number | null | undefined = 10
    const runtime = await composedRouteRuntime(
      { resolveMonthlyBookingLimit: () => live },
      { VOYANT_BOOKINGS_MONTHLY_LIMIT: "100" },
    )

    expect(runtime.monthlyBookingLimit).toBe(10)
    live = undefined
    expect(runtime.monthlyBookingLimit).toBe(100)
  })

  it("leaves the configured allowance in force when the host installs nothing", async () => {
    const runtime = await composedRouteRuntime({}, { VOYANT_BOOKINGS_MONTHLY_LIMIT: "100" })
    expect(runtime.monthlyBookingLimit).toBe(100)
  })

  it("keeps port-derived wiring that the host did not override", async () => {
    const runtime = await composedRouteRuntime({ resolveMonthlyBookingLimit: () => 5 })
    expect(runtime.resolveDocumentDownloadUrl).toBeTypeOf("function")
  })
})
