import { assertPortConforms } from "@voyant-travel/core/project"
import { describe, expect, it } from "vitest"

import { legalContractDocumentRuntimePort } from "../../src/contract-document-runtime-port.js"
import { legalRuntimePort } from "../../src/runtime-port.js"

describe("Legal runtime port", () => {
  it("accepts route providers and rejects malformed provider methods", async () => {
    await expect(assertPortConforms(legalRuntimePort, {})).resolves.toBeUndefined()
    await expect(
      assertPortConforms(legalRuntimePort, {
        resolveDocumentStorage: "invalid",
      } as never),
    ).rejects.toThrow(/resolveDocumentStorage must be a function/)
  })
})

describe("Legal contract-document runtime port", () => {
  const provider = {
    resolveGeneratedDocument: async () => null,
    resolveStorage: () => null,
    guessMimeType: () => "application/octet-stream",
  }

  it("accepts authorized delivery resolution and rejects malformed adapters", async () => {
    await expect(
      assertPortConforms(legalContractDocumentRuntimePort, provider),
    ).resolves.toBeUndefined()
    await expect(
      assertPortConforms(legalContractDocumentRuntimePort, {
        ...provider,
        resolveGeneratedDocument: "invalid",
      } as never),
    ).rejects.toThrow(/resolveGeneratedDocument must be a function/)
  })
})
