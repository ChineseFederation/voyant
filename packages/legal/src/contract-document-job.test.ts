import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  runDue: vi.fn(async () => []),
  createEngine: vi.fn(),
  hasRecoverable: vi.fn(async () => false),
}))

vi.mock("./contracts/document-operation.js", () => ({
  createLegalDocumentOperationEngine: mocks.createEngine,
  hasRecoverableLegalDocumentOperations: mocks.hasRecoverable,
}))

import { runDueLegalContractDocumentOperationsJob } from "./contract-document-job.js"
import { legalContractDocumentJobRuntimePort } from "./contract-document-job-runtime-port.js"
import { legalDocumentArtifactProviderPort } from "./contracts/document-artifact-provider.js"

describe("contract document recovery job", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("is a no-op when no artifact provider is selected and no work is recoverable", async () => {
    const db = { name: "db" }
    const getPort = vi.fn(async (port) => {
      if (port === legalContractDocumentJobRuntimePort) return { resolveDb: () => db }
      throw new Error("unselected provider must not be read")
    })

    await runDueLegalContractDocumentOperationsJob({
      hasPort: () => false,
      getPort,
    } as never)

    expect(getPort).toHaveBeenCalledWith(legalContractDocumentJobRuntimePort)
    expect(mocks.hasRecoverable).toHaveBeenCalledWith(db)
    expect(mocks.createEngine).not.toHaveBeenCalled()
  })

  it("fails deterministically when queued work remains after the provider disappears", async () => {
    const db = { name: "db" }
    mocks.hasRecoverable.mockResolvedValueOnce(true)

    await expect(
      runDueLegalContractDocumentOperationsJob({
        hasPort: () => false,
        getPort: async (port: unknown) => {
          if (port === legalContractDocumentJobRuntimePort) return { resolveDb: () => db }
          throw new Error("unselected provider must not be read")
        },
      } as never),
    ).rejects.toThrow(/no artifact provider is available/)

    expect(mocks.hasRecoverable).toHaveBeenCalledWith(db)
    expect(mocks.createEngine).not.toHaveBeenCalled()
  })

  it("uses the exact selected provider and fails through its fixed recovery path", async () => {
    const db = { name: "db" }
    const provider = { identity: { id: "selected-provider" } }
    mocks.createEngine.mockReturnValue({ runDue: mocks.runDue })
    const getPort = vi.fn(async (port) => {
      if (port === legalContractDocumentJobRuntimePort) return { resolveDb: () => db }
      if (port === legalDocumentArtifactProviderPort) return provider
      throw new Error("unexpected port")
    })

    await runDueLegalContractDocumentOperationsJob({
      hasPort: (port: unknown) => port === legalDocumentArtifactProviderPort,
      getPort,
    } as never)

    expect(mocks.createEngine).toHaveBeenCalledWith({ provider })
    expect(mocks.runDue).toHaveBeenCalledWith(db)
  })

  it("fails closed when a selected provider cannot be resolved", async () => {
    await expect(
      runDueLegalContractDocumentOperationsJob({
        hasPort: () => true,
        getPort: async () => {
          throw new Error("selected provider unavailable")
        },
      } as never),
    ).rejects.toThrow("selected provider unavailable")
  })
})
