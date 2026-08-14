import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const templateState = vi.hoisted(() => ({
  query: { error: null as unknown, isPending: false },
}))

vi.mock("@voyant-travel/legal-react", () => ({
  useDefaultLegalContractTemplate: () => templateState.query,
}))

import { useBookingContractGenerationCapability } from "../../src/hooks/use-contract-generation-capability.js"

function CapabilityProbe() {
  const capability = useBookingContractGenerationCapability()
  return (
    <span
      data-available={String(capability.available)}
      data-resolving={String(capability.resolving)}
    >
      probe
    </span>
  )
}

function probe() {
  const markup = renderToStaticMarkup(<CapabilityProbe />)
  return {
    available: markup.includes('data-available="true"'),
    resolving: markup.includes('data-resolving="true"'),
  }
}

// voyant#4634: the contract half of "Generate invoice and contract" was offered
// on deployments that could not produce one, and dropped it in silence.
describe("useBookingContractGenerationCapability", () => {
  beforeEach(() => {
    templateState.query = { error: null, isPending: false }
  })

  it("is unavailable once the deployment answers that no default template exists", () => {
    templateState.query = { error: { status: 404 }, isPending: false }
    expect(probe()).toEqual({ available: false, resolving: false })
  })

  it("stays available when the operator merely cannot read Legal", () => {
    // A 403 says nothing about what the deployment can render, so disabling on
    // it would replace one misleading UI with another.
    templateState.query = { error: { status: 403 }, isPending: false }
    expect(probe()).toEqual({ available: true, resolving: false })
  })

  it("stays available while the answer is still outstanding", () => {
    templateState.query = { error: null, isPending: true }
    expect(probe()).toEqual({ available: true, resolving: true })
  })

  it("is available when a default template resolves", () => {
    expect(probe()).toEqual({ available: true, resolving: false })
  })
})
