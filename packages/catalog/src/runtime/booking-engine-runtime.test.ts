import { beforeEach, describe, expect, it, vi } from "vitest"
import type { BookingEngineEnv } from "./booking-engine-runtime.js"

// Every test does a cold `vi.resetModules()` + dynamic `import()` of the runtime;
// under full-parallel CI load that import alone can exceed the 5s default and
// flake the suite. Give the file headroom — the assertions themselves are sync.
vi.setConfig({ testTimeout: 20000 })

// A stub inventory channel. The catalog spine no longer imports Voyant Connect;
// it resolves whatever channel the deployment bound to the sources port, so the
// test provides one directly instead of mocking the plugin module.
const registerFallback = vi.fn()
const warm = vi.fn()
const resolveDestinationNames = vi.fn()

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

async function loadRuntime({ withSources = true }: { withSources?: boolean } = {}) {
  vi.resetModules()
  const [runtime, host] = await Promise.all([
    import("./booking-engine-runtime.js"),
    import("./host.js"),
  ])
  host.configureCatalogRuntimeHost(
    {} as never,
    {
      cruises: { registerAdapters: vi.fn(), syncRegistry: vi.fn() },
      ...(withSources ? { sources: { registerFallback, warm, resolveDestinationNames } } : {}),
    } as never,
  )
  return runtime
}

beforeEach(() => {
  vi.clearAllMocks()
  // A configured channel: the fallback registers an un-scoped adapter by kind,
  // the warm registers one connection-scoped adapter.
  registerFallback.mockImplementation((registry: { register: (a: unknown, b?: unknown) => void }) =>
    registry.register(genericAdapter()),
  )
  warm.mockImplementation(async (registry: { register: (a: unknown, b?: unknown) => void }) => {
    // Real enumeration is a network round-trip; yield so the synchronous
    // fallback is observable before the per-connection adapters land.
    await Promise.resolve()
    registry.register("conn_1", genericAdapter())
  })
})

describe("getBookingEngineRegistry", () => {
  it("registers the un-scoped default synchronously before the warm completes", async () => {
    const { getBookingEngineRegistry } = await loadRuntime()
    const registry = getBookingEngineRegistry(CONNECT_ENV)
    expect(registry.hasKind("voyant-connect")).toBe(true)
    expect(registry.resolveByConnection("conn_1")).toBeUndefined()
  })
})

describe("ensureBookingEngineRegistry", () => {
  it("registers per-connection adapters after the warm", async () => {
    const { ensureBookingEngineRegistry } = await loadRuntime()
    const registry = await ensureBookingEngineRegistry(CONNECT_ENV)
    expect(registry.resolveByConnection("conn_1")).toBeDefined()
    // The un-scoped fallback still coexists for cold-window / connection-less rows.
    expect(registry.hasKind("voyant-connect")).toBe(true)
  })

  it("memoizes the warm per isolate (one enumeration regardless of callers)", async () => {
    const { ensureBookingEngineRegistry } = await loadRuntime()
    await ensureBookingEngineRegistry(CONNECT_ENV)
    await ensureBookingEngineRegistry(CONNECT_ENV)
    expect(warm).toHaveBeenCalledTimes(1)
  })

  it("retries a failed warm rather than caching the failure", async () => {
    warm.mockRejectedValueOnce(new Error("enumeration failed"))
    const { ensureBookingEngineRegistry } = await loadRuntime()
    await ensureBookingEngineRegistry(CONNECT_ENV)
    await ensureBookingEngineRegistry(CONNECT_ENV)
    expect(warm).toHaveBeenCalledTimes(2)
  })
})

describe("when no inventory channel is bound", () => {
  it("registers nothing, does not throw, and still resolves a registry", async () => {
    const { ensureBookingEngineRegistry } = await loadRuntime({ withSources: false })
    const registry = await ensureBookingEngineRegistry({})
    expect(registry.hasKind("voyant-connect")).toBe(false)
    expect(registry.connections()).toEqual([])
  })
})
