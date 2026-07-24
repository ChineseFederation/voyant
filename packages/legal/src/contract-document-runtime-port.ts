import { definePort } from "@voyant-travel/core/project"

import type { ContractDocumentRoutesOptions } from "./contract-document-routes.js"

export const legalContractDocumentRuntimePort = definePort<ContractDocumentRoutesOptions>({
  id: "legal.contract-document.runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("legal.contract-document.runtime provider must be an options object.")
    }
    for (const method of ["resolveStorage", "guessMimeType"] as const) {
      if (typeof provider[method] !== "function") {
        throw new Error(`legal.contract-document.runtime ${method} must be a function.`)
      }
    }
    if (
      provider.resolveGeneratedDocument !== undefined &&
      typeof provider.resolveGeneratedDocument !== "function"
    ) {
      throw new Error(
        "legal.contract-document.runtime resolveGeneratedDocument must be a function.",
      )
    }
  },
})
