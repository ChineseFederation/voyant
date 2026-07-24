import { definePort } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export interface LegalContractDocumentJobRuntime {
  resolveDb(): PostgresJsDatabase | Promise<PostgresJsDatabase>
}

export const legalContractDocumentJobRuntimePort = definePort<LegalContractDocumentJobRuntime>({
  id: "legal.contract-document.job-runtime",
  test(runtime) {
    if (!runtime || typeof runtime.resolveDb !== "function") {
      throw new Error("legal.contract-document.job-runtime provider is incomplete.")
    }
  },
})
