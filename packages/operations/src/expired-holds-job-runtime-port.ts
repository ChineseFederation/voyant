import { definePort } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export interface OperationsExpiredHoldsJobRuntime {
  resolveDb: () => PostgresJsDatabase | Promise<PostgresJsDatabase>
}

export const operationsExpiredHoldsJobRuntimePort = definePort<OperationsExpiredHoldsJobRuntime>({
  id: "operations.expired-holds-job",
  test(runtime) {
    if (!runtime || typeof runtime.resolveDb !== "function") {
      throw new Error("operations.expired-holds-job provider must implement resolveDb().")
    }
  },
})
