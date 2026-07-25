import { beforeEach, describe, expect, it, vi } from "vitest"
import type { BookingEngineEnv } from "./booking-engine-runtime.js"

// Every test does a cold `vi.resetModules()` + dynamic `import()` of the runtime;
// under full-parallel CI load that import alone can exceed the 5s default and
// flake the suite. Give the file headroom — the assertions themselves are sync.
vi.setConfig({ testTimeout: 20000 })

// The plugin is mocked so the test exercises the runtime's warm/fallback wiring
// (not the real Connect network calls). `registerVoyantConnectSources` mirrors
// the real plugin: connection-scoped sources register by id, the default pair
// registers by kind.
const prepareVoyantConnectSources = vi.fn()
const createVoyantConnectSources = vi.fn()
const resolveVoyantConnectEnv = vi.fn()

vi.mock("@voyant-travel/plugin-voyant-connect", () => ({
  prepareVoyantConnectSources,
  createVoyantConnectSources,
  resolveVoyantConnectEnv,
  registerVoyantConnectSources: (
    registry: { register: (a: unknown, b?: unknown) => void },
    sources: Array<{ connectionId?: string; adapter: unknown }>,
  ) => {
    for (const source of sources) {
      if (source.connectionId) registry.register(source.connectionId, source.adapter)
      else registry.register(source.adapter)
    }
  },
}))
vi.mock("./owned-booking-handlers.js", () => ({
  createOwnedBookingHandlersRegistry: vi.fn(),
}))

const CONNECT_ENV: BookingEngineEnv = {
  VOYANT_API_KEY: "k",
  VOYANT_CONNECT_OPERATOR_ID: "op_1",
}

function genericAdapter() {
  return { kind: "voyant-connect" } as never
}

async function loadRuntime() {
  vi.resetModules()
  const [runtime, host] = await Promise.all([
    import("./booking-engine-runtime.js"),
    import("./host.js"),
  ])
  host.configureCatalogRuntimeHost(
    {} as never,
    {
      cruises: { registerAdapters: vi.fn(), syncRegistry: vi.fn() },
    } as never,
  )
  return runtime
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default-pair fallback (synchronous): resolveVoyantConnectEnv returns a
  // config, createVoyantConnectSources returns the un-scoped pair.
  resolveVoyantConnectEnv.mockReturnValue({ apiKey: "k", operatorId: "op_1" })
  createVoyantConnectSources.mockReturnValue([{ adapter: genericAdapter() }])
  // Per-connection warm result.
  prepareVoyantConnectSources.mockResolvedValue([
    { connectionId: "conn_1", adapter: genericAdapter() },
  ])
})

describe("getBookingEngineRegistry", () => {
  it("registers the un-scoped default synchronously before the warm completes", async () => {
    const { getBookingEngineRegistry } = await loadRuntime()
    const registry = getBookingEngineRegistry(CONNECT_ENV)
    // Fallback is registered by kind; the per-connection entry is not yet present.
    expect(registry.hasKind("voyant-connect")).toBe(true)
    expect(registry.resolveByConnection("conn_1")).toBeUndefined()
  })
})

describe("ensureBookingEngineRegistry", () => {
  it("registers per-connection adapters after the warm", async () => {
    const { ensureBookingEngineRegistry } = await loadRuntime()
    const registry = await ensureBookingEngineRegistry(CONNECT_ENV)
    // The connection-scoped adapter is now resolvable by its connection id.
    expect(registry.resolveByConnection("conn_1")).toBeDefined()
    // The un-scoped fallback still coexists for cold-window / connection-less rows.
    expect(registry.hasKind("voyant-connect")).toBe(true)
  })

  it("memoizes the warm per isolate (one enumeration regardless of callers)", async () => {
    const { ensureBookingEngineRegistry } = await loadRuntime()
    await ensureBookingEngineRegistry(CONNECT_ENV)
    await ensureBookingEngineRegistry(CONNECT_ENV)
    expect(prepareVoyantConnectSources).toHaveBeenCalledTimes(1)
  })
})

describe("Connect cruise memoize", () => {
  it("passes cruise memoization to the warm", async () => {
    const { ensureBookingEngineRegistry } = await loadRuntime()
    await ensureBookingEngineRegistry(CONNECT_ENV)
    const opts = prepareVoyantConnectSources.mock.calls[0]![1]
    expect(opts.cruise?.memoize?.ttlMs).toBeGreaterThan(0)
  })
})

describe("when Connect is unconfigured", () => {
  beforeEach(() => {
    resolveVoyantConnectEnv.mockReturnValue(null)
    prepareVoyantConnectSources.mockResolvedValue([])
  })

  it("registers no Connect adapters and does not throw", async () => {
    const { ensureBookingEngineRegistry } = await loadRuntime()
    const registry = await ensureBookingEngineRegistry({})
    expect(registry.hasKind("voyant-connect")).toBe(false)
    expect(registry.connections()).toEqual([])
  })
})
