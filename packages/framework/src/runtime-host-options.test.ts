import {
  defineGraphRuntimeFactory,
  type VoyantGraphRuntimeFactoryContext,
} from "@voyant-travel/core/project"
import { describe, expect, it, vi } from "vitest"

import { loadVoyantNodeRuntime } from "./node-runtime.js"
import { composeVoyantGraphRuntime } from "./runtime-composition.js"
import { createVoyantGraphRuntime } from "./runtime-lowering.js"

const EMPTY_SELECTED_IDS = { routes: [], tools: [], events: [], webhooks: [] } as const

const NODE_PROVIDERS = {
  database: "postgres",
  storage: "memory",
  cache: "memory",
  sharedState: "memory",
  rateLimit: "memory",
  search: "none",
  email: "none",
  sms: "none",
  adminAuth: "better-auth",
  customerAuth: "disabled",
  realtime: "none",
  scheduledJobs: "none",
  outboundWebhooks: "none",
  payments: "none",
} as const

/**
 * Two units exporting whatever the test hands them, so a case can pair a
 * port-bearing factory with an option-bearing one and assert that host options
 * reach exactly the unit they are addressed to.
 */
function runtimeWithUnits(exports: Readonly<Record<string, unknown>>) {
  const unitIds = Object.keys(exports)
  return createVoyantGraphRuntime({
    graphHash: "sha256:host-options",
    entries: Object.fromEntries(
      unitIds.map((unitId) => [`${unitId}/runtime`, async () => ({ runtime: exports[unitId] })]),
    ),
    modules: unitIds.map((unitId, order) => ({
      id: unitId,
      kind: "module" as const,
      packageName: unitId,
      order,
      references: [
        {
          id: `${unitId}#api.admin:runtime`,
          unitId,
          facet: "api" as const,
          entityId: `${unitId}#api.admin`,
          runtime: { entry: `${unitId}/runtime`, export: "runtime" },
          importEntry: `${unitId}/runtime`,
        },
      ],
      selectedIds: { ...EMPTY_SELECTED_IDS, routes: [`${unitId}#api.admin`] },
      routes: [
        {
          route: {
            id: `${unitId}#api.admin`,
            surface: "admin" as const,
            runtime: { entry: `${unitId}/runtime`, export: "runtime" },
          },
          importEntry: `${unitId}/runtime`,
          referenceId: `${unitId}#api.admin:runtime`,
        },
      ],
    })),
    plugins: [],
  })
}

describe("deployment host options", () => {
  it("reaches the factory context of the unit they are addressed to", async () => {
    const contexts: VoyantGraphRuntimeFactoryContext[] = []
    const factory = defineGraphRuntimeFactory((context) => {
      contexts.push(context)
      return { module: { name: context.unitId } }
    })

    await composeVoyantGraphRuntime({
      runtime: runtimeWithUnits({ "@acme/bookings": factory, "@acme/finance": factory }),
      capabilities: {},
      hostOptions: { "@acme/bookings": { resolveMonthlyBookingLimit: () => 25 } },
    })

    const bookings = contexts.find((context) => context.unitId === "@acme/bookings")
    const finance = contexts.find((context) => context.unitId === "@acme/finance")
    expect(
      (bookings?.hostOptions.resolveMonthlyBookingLimit as () => number | null | undefined)?.(),
    ).toBe(25)
    // A unit reads only its own slice; another unit's options are not ambient.
    expect(finance?.hostOptions).toEqual({})
  })

  it("presents an empty record when the deployment supplied none", async () => {
    const contexts: VoyantGraphRuntimeFactoryContext[] = []
    const factory = defineGraphRuntimeFactory((context) => {
      contexts.push(context)
      return { module: { name: context.unitId } }
    })

    await composeVoyantGraphRuntime({
      runtime: runtimeWithUnits({ "@acme/bookings": factory }),
      capabilities: {},
    })

    expect(contexts[0]?.hostOptions).toEqual({})
  })

  it("ignores options for a unit the selected graph does not contain", async () => {
    const factory = defineGraphRuntimeFactory((context) => ({
      module: { name: context.unitId },
    }))

    const composition = await composeVoyantGraphRuntime({
      runtime: runtimeWithUnits({ "@acme/bookings": factory }),
      capabilities: {},
      // One host composing several profiles may carry options for units a
      // given profile leaves out. That is not an error.
      hostOptions: { "@acme/absent": { resolveMonthlyBookingLimit: () => 25 } },
    })

    expect(composition.modules.map((module) => module.module.name)).toEqual(["@acme/bookings"])
  })

  it("passes options to an option-bearing export as its argument", async () => {
    const optionBearing = vi.fn((options: { prefix?: string } = {}) => ({
      module: { name: options.prefix ?? "default" },
    }))

    const composition = await composeVoyantGraphRuntime({
      runtime: runtimeWithUnits({ "@acme/loyalty": optionBearing }),
      capabilities: {},
      hostOptions: { "@acme/loyalty": { prefix: "configured" } },
    })

    expect(composition.modules.map((module) => module.module.name)).toEqual(["configured"])
  })

  it("leaves an option-bearing export called with no argument when none are supplied", async () => {
    const optionBearing = vi.fn(() => ({ module: { name: "default" } }))

    await composeVoyantGraphRuntime({
      runtime: runtimeWithUnits({ "@acme/loyalty": optionBearing }),
      capabilities: {},
      hostOptions: { "@acme/loyalty": {} },
    })

    expect(optionBearing).toHaveBeenCalledWith()
  })

  it("fails composition when options cannot reach a non-callable export", async () => {
    await expect(
      composeVoyantGraphRuntime({
        runtime: runtimeWithUnits({ "@acme/static": { module: { name: "static" } } }),
        capabilities: {},
        hostOptions: { "@acme/static": { resolveMonthlyBookingLimit: () => 25 } },
      }),
      // Dropping them in silence is the failure this seam exists to prevent:
      // the host believes it installed something that is not there.
    ).rejects.toThrow(/was given host options but its runtime export is not callable/)
  })

  it("hands a binding the factory context so a port-bearing export stays invocable", async () => {
    const factory = defineGraphRuntimeFactory((context) => ({
      module: { name: `${context.unitId}:${String(context.hostOptions.prefix ?? "none")}` },
    }))

    const composition = await composeVoyantGraphRuntime({
      runtime: runtimeWithUnits({ "@acme/bookings": factory }),
      capabilities: {},
      hostOptions: { "@acme/bookings": { prefix: "live" } },
      bindings: {
        "@acme/bookings": ({ runtimeExports, factoryContext }) =>
          (runtimeExports[0] as typeof factory)(factoryContext) as { module: { name: string } },
      },
    })

    expect(composition.modules.map((module) => module.module.name)).toEqual(["@acme/bookings:live"])
  })

  it("reaches a factory through loadVoyantNodeRuntime", async () => {
    // The forwarding gap this closes: the compose seam existed, but the Node
    // host never offered it, so a graph-composed deployment — the shape the
    // managed image standardised on — had no way to reach a unit's options.
    const contexts: VoyantGraphRuntimeFactoryContext[] = []
    const factory = defineGraphRuntimeFactory((context) => {
      contexts.push(context)
      return { module: { name: context.unitId } }
    })

    await loadVoyantNodeRuntime({
      graphRuntime: runtimeWithUnits({ "@acme/bookings": factory }),
      jobs: [],
      deployment: { mode: "self-hosted", providers: NODE_PROVIDERS },
      deploymentRequirements: { resources: [] },
      hostOptions: { "@acme/bookings": { resolveMonthlyBookingLimit: () => 25 } },
    })

    expect(
      (contexts[0]?.hostOptions.resolveMonthlyBookingLimit as () => number | null | undefined)?.(),
    ).toBe(25)
  })
})
