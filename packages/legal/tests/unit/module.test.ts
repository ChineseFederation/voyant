import { createContainer, createEventBus } from "@voyant-travel/core"
import { describe, expect, it, vi } from "vitest"

import { CONTRACTS_ROUTE_RUNTIME_CONTAINER_KEY, createLegalApiModule } from "../../src/index.js"

describe("createLegalApiModule", () => {
  it("registers contracts route runtime during bootstrap", () => {
    const eventBus = createEventBus()
    const resolveEventBus = vi.fn(() => eventBus)
    const container = createContainer()
    const bindings = { PDF_TOKEN: "token" }

    const module = createLegalApiModule({
      resolveEventBus,
    }).module

    module.bootstrap?.({ bindings, container })

    const runtime = container.resolve(CONTRACTS_ROUTE_RUNTIME_CONTAINER_KEY)

    expect(resolveEventBus).toHaveBeenCalledTimes(1)
    expect(runtime?.eventBus).toBe(eventBus)
  })

  it("uses the module event bus when no route event bus is configured", () => {
    const eventBus = createEventBus()
    const container = createContainer()

    const module = createLegalApiModule().module

    module.bootstrap?.({ bindings: {}, container, eventBus })

    const runtime = container.resolve(CONTRACTS_ROUTE_RUNTIME_CONTAINER_KEY)

    expect(runtime?.eventBus).toBe(eventBus)
  })
})
