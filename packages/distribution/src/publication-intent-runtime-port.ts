import type { CatalogProjectionRuntime } from "@voyant-travel/catalog/projection-runtime"
import { definePort } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"

export interface DistributionPublicationIntentWorkerDeps {
  db: AnyDrizzleDb
  projection: CatalogProjectionRuntime
  report?: (message: string, detail?: Record<string, unknown>) => void
}

export interface DistributionPublicationIntentWorkerRuntime {
  withDeps<T>(
    bindings: unknown,
    operation: (deps: DistributionPublicationIntentWorkerDeps) => Promise<T>,
  ): Promise<T>
}

export const distributionPublicationIntentWorkerRuntimePort =
  definePort<DistributionPublicationIntentWorkerRuntime>({
    id: "distribution.publication-intent-worker-runtime",
    test(provider) {
      if (
        provider === null ||
        typeof provider !== "object" ||
        typeof provider.withDeps !== "function"
      ) {
        throw new Error(
          "distribution.publication-intent-worker-runtime provider must implement withDeps().",
        )
      }
    },
  })
