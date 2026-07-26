import { describe, expect, it } from "vitest"

import { assertVoyantGraphMcpRuntime } from "./conditional-action-availability.js"
import { createVoyantGraphRuntime } from "./runtime-lowering.js"

/** Must stay aligned with the realm facade key in conditional-action-availability.ts. */
const GRAPH_RUNTIME_ATTESTATION_KEY = Symbol.for(
  "@voyant-travel/framework:graph-runtime-attestation",
)

interface GraphRuntimeAttestationApi {
  readonly markOwned: (runtime: object) => void
  readonly isOwned: (runtime: object) => boolean
}

function emptyRuntime() {
  return createVoyantGraphRuntime({
    graphHash: "sha256:realm-attestation",
    providerSelections: {},
    entries: {},
    modules: [],
    extensions: [],
    plugins: [],
    adapters: [],
    providerUnits: [],
  })
}

function realmAttestationApi(): GraphRuntimeAttestationApi {
  const api = (globalThis as Record<symbol, GraphRuntimeAttestationApi | undefined>)[
    GRAPH_RUNTIME_ATTESTATION_KEY
  ]
  if (!api) throw new Error("expected realm attestation facade")
  return api
}

describe("framework runtime realm attestation", () => {
  it("installs a frozen facade on globalThis without exposing WeakSet/WeakMap stores", () => {
    const runtime = emptyRuntime()
    const api = realmAttestationApi()

    expect(Object.isFrozen(api)).toBe(true)
    expect(api.isOwned(runtime)).toBe(true)
    expect(api).not.toBeInstanceOf(WeakSet)
    expect(api).not.toBeInstanceOf(WeakMap)
    for (const value of Object.values(api)) {
      expect(value).not.toBeInstanceOf(WeakSet)
      expect(value).not.toBeInstanceOf(WeakMap)
    }
  })

  it("accepts a framework-owned runtime that has no conditional actions", () => {
    expect(() => assertVoyantGraphMcpRuntime(emptyRuntime())).not.toThrow()
  })

  it("rejects a structural copy that never crossed createFrameworkOwnedRuntime", () => {
    const runtime = emptyRuntime()
    expect(() => assertVoyantGraphMcpRuntime({ ...runtime })).toThrow(
      /VOYANT_GRAPH_RUNTIME_NOT_FRAMEWORK_OWNED/,
    )
  })

  it("lets a second realm-local assert agree when it only shares the frozen facade", () => {
    const runtime = emptyRuntime()
    const api = realmAttestationApi()

    // Mimic a Vite-bundled duplicate of this module: it does not share the
    // original module binding, only the realm-wide Symbol.for facade.
    const assertFromBundledCopy = (value: unknown) => {
      if (typeof value !== "object" || value === null || !api.isOwned(value)) {
        throw new Error(
          "VOYANT_GRAPH_RUNTIME_NOT_FRAMEWORK_OWNED: MCP registration requires a runtime created by the framework.",
        )
      }
    }

    expect(() => assertFromBundledCopy(runtime)).not.toThrow()
    expect(() => assertFromBundledCopy({ ...runtime })).toThrow(
      /VOYANT_GRAPH_RUNTIME_NOT_FRAMEWORK_OWNED/,
    )
  })
})
