import { CATALOG_BOOKING_SNAPSHOT_RUNTIME_CONTAINER_KEY } from "@voyant-travel/catalog/booking-snapshot-subscriber"
import {
  CATALOG_PROJECTION_RUNTIME_CONTAINER_KEY,
  catalogProjectionRuntimePort,
} from "@voyant-travel/catalog/projection-runtime"
import { createContainer, createEventBus } from "@voyant-travel/core"
import { composeVoyantGraphRuntime } from "@voyant-travel/framework"
import { describe, expect, it, vi } from "vitest"

import {
  createGeneratedGraphRuntime,
  createGeneratedStaticTestDeploymentResources,
  createGeneratedTestDeploymentResources,
} from "./generated-project-runtime.js"

const buildOperatorRuntimePorts = () => createGeneratedStaticTestDeploymentResources().ports

async function composeOperatorGraph(runtime = createGeneratedGraphRuntime()) {
  const selected = await createGeneratedTestDeploymentResources(runtime)
  return composeVoyantGraphRuntime({
    runtime: selected.runtime,
    capabilities: selected.capabilities,
    ports: selected.ports,
  })
}

describe("selected Operator Catalog subscriber composition", () => {
  it("activates selected Catalog subscribers once before stacked Commerce redemption", async () => {
    const runtime = createGeneratedGraphRuntime()
    const catalog = runtime.modules.find((unit) => unit.id === "@voyant-travel/catalog")
    const composed = await composeOperatorGraph(runtime)
    const catalogRuntimeIndex = composed.modules.findIndex(
      (module) => module.module.name === "catalog.graph-runtime",
    )
    const commerceRuntimeIndex = composed.modules.findIndex(
      (module) => module.module.name === "commerce.graph-runtime",
    )
    const container = createContainer()
    const eventBus = createEventBus()
    const subscribe = vi.spyOn(eventBus, "subscribe")

    await composed.modules[catalogRuntimeIndex]?.module.bootstrap?.({
      bindings: { DATABASE_URL: "postgres://test" },
      container,
      eventBus,
    })

    expect(
      catalog?.references
        .filter((reference) => reference.facet === "subscribers.runtime")
        .map((reference) => reference.entityId),
    ).toHaveLength(10)
    expect(catalogRuntimeIndex).toBeGreaterThanOrEqual(0)
    expect(commerceRuntimeIndex).toBeGreaterThan(catalogRuntimeIndex)
    expect(container.has(CATALOG_PROJECTION_RUNTIME_CONTAINER_KEY)).toBe(true)
    expect(container.has(CATALOG_BOOKING_SNAPSHOT_RUNTIME_CONTAINER_KEY)).toBe(true)
    expect(subscribe).toHaveBeenCalledTimes(10)
    expect(subscribe.mock.calls.filter(([event]) => event === "booking.confirmed")).toHaveLength(1)
    expect(
      subscribe.mock.calls.filter(([event]) => event === "product.publication.changed"),
    ).toHaveLength(1)
    expect(
      subscribe.mock.calls.filter(([event]) => event === "catalog.entity.overlay.changed"),
    ).toHaveLength(1)
  })

  it("shares one Catalog projection runtime across all selected index subscribers", async () => {
    const provider = (await buildOperatorRuntimePorts()[catalogProjectionRuntimePort.id]) as {
      createRuntime(bindings: unknown): unknown
    }
    const bindings = { TYPESENSE_HOST: "http://localhost:8108" }

    expect(provider.createRuntime(bindings)).toBe(provider.createRuntime(bindings))
  })
})
