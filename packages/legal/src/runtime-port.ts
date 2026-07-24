import { definePort } from "@voyant-travel/core/project"

import type { CreateLegalApiModuleOptions } from "./index.js"

/** Deployment options consumed by the package-owned Legal graph runtime. */
export const legalRuntimePort = definePort<CreateLegalApiModuleOptions>({
  id: "legal.runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("legal.runtime provider must be an options object.")
    }
    for (const method of ["resolveDocumentDownloadUrl", "resolveDocumentStorage"] as const) {
      if (provider[method] !== undefined && typeof provider[method] !== "function") {
        throw new Error(`legal.runtime provider ${method} must be a function.`)
      }
    }
  },
})
