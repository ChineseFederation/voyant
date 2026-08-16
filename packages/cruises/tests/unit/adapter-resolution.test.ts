import type { SourceAdapter } from "@voyant-travel/catalog"
import { createSourceAdapterRegistry } from "@voyant-travel/catalog/booking-engine"
import { describe, expect, it } from "vitest"

import { resolveCruiseSourceAdapter } from "../../src/lib/adapter-resolution.js"

const CONNECTION = "conn_db9b7a69e2d474bd143d045c"

function stubAdapter(kind: string, extra: Record<string, unknown> = {}): SourceAdapter {
  return {
    kind,
    capabilities: { verticals: ["cruises"] },
    ...extra,
  } as unknown as SourceAdapter
}

/**
 * A channel registers several adapters for one connection and can only key them
 * apart by suffixing the registry key — Voyant Connect puts its generic adapter
 * under `<connectionId>` and its cruise shim under `<connectionId>:cruises`.
 * Resolving a cruise by bare connection id therefore returned the *generic*
 * adapter, which cannot reach through to `cruiseAdapter` and sent every
 * connection-scoped cruise down the synthesizer fallback with a blank page.
 */
describe("resolveCruiseSourceAdapter", () => {
  it("prefers the connection's cruise shim over its generic adapter", () => {
    const registry = createSourceAdapterRegistry()
    const generic = stubAdapter("voyant-connect")
    const cruises = stubAdapter("cruise:uniworld", { cruiseAdapter: {} })
    registry.register(CONNECTION, generic)
    registry.register(`${CONNECTION}:cruises`, cruises)

    expect(resolveCruiseSourceAdapter(registry, "cruise:uniworld", CONNECTION)).toBe(cruises)
  })

  it("resolves a cruise adapter registered under the bare connection id", () => {
    const registry = createSourceAdapterRegistry()
    const cruises = stubAdapter("cruise:uniworld")
    registry.register(CONNECTION, cruises)

    expect(resolveCruiseSourceAdapter(registry, "cruise:uniworld", CONNECTION)).toBe(cruises)
  })

  it("does not cross connections when the kind matches another connection's shim", () => {
    const registry = createSourceAdapterRegistry()
    const otherConnection = stubAdapter("cruise:uniworld", { cruiseAdapter: {} })
    registry.register("conn_someone_else:cruises", otherConnection)
    const generic = stubAdapter("voyant-connect")
    registry.register(CONNECTION, generic)

    // This connection has no cruise shim, so the generic adapter it *does* have
    // is the right answer — it can still serve content via `getContent`.
    expect(resolveCruiseSourceAdapter(registry, "cruise:uniworld", CONNECTION)).toBe(generic)
  })

  it("falls back to any adapter of the kind when the connection has none", () => {
    const registry = createSourceAdapterRegistry()
    const cruises = stubAdapter("cruise:uniworld")
    registry.register("conn_someone_else:cruises", cruises)

    expect(resolveCruiseSourceAdapter(registry, "cruise:uniworld", CONNECTION)).toBe(cruises)
  })

  it("resolves by kind alone when the sourced entry carries no connection", () => {
    const registry = createSourceAdapterRegistry()
    const cruises = stubAdapter("cruise:uniworld")
    registry.register(`${CONNECTION}:cruises`, cruises)

    expect(resolveCruiseSourceAdapter(registry, "cruise:uniworld", null)).toBe(cruises)
  })

  it("returns undefined when nothing matches", () => {
    const registry = createSourceAdapterRegistry()
    registry.register(CONNECTION, stubAdapter("voyant-connect"))

    expect(resolveCruiseSourceAdapter(registry, "cruise:viking", "conn_unknown")).toBeUndefined()
  })
})
