import { definePort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"

import type { TripsRoutesOptionsProvider } from "./routes.js"

/** Deployment route dependencies consumed by the package-owned Trips graph runtime. */
export const tripsRoutesRuntimePort = definePort<TripsRoutesOptionsProvider>({
  id: "trips.routes-runtime",
  test(provider) {
    if (typeof provider !== "function") {
      throw new Error("trips.routes-runtime provider must be a function.")
    }
  },
})

export interface TripsDatabaseRuntime {
  resolveDb(bindings: unknown): AnyDrizzleDb
  withDb<T>(bindings: unknown, operation: (db: AnyDrizzleDb) => Promise<T>): Promise<T>
}

/** Deployment database lifecycle consumed by package-owned background work. */
export const tripsDatabaseRuntimePort = definePort<TripsDatabaseRuntime>({
  id: "trips.database-runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("trips.database-runtime provider must be an options object.")
    }
    if (typeof provider.resolveDb !== "function" || typeof provider.withDb !== "function") {
      throw new Error("trips.database-runtime provider must implement resolveDb() and withDb().")
    }
  },
})
