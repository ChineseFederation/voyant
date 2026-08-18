import { definePort } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export interface RelationshipsInquiryOverdueJobRuntime {
  withDb<T>(bindings: unknown, operation: (db: PostgresJsDatabase) => Promise<T>): Promise<T>
}

export const relationshipsInquiryOverdueJobRuntimePort =
  definePort<RelationshipsInquiryOverdueJobRuntime>({
    id: "relationships.inquiry-overdue-job",
    test(provider) {
      if (!provider || typeof provider !== "object" || typeof provider.withDb !== "function") {
        throw new Error("relationships.inquiry-overdue-job must implement withDb().")
      }
    },
  })
