import { catalogOperationsRuntimeExtensionPort } from "@voyant-travel/catalog/runtime-contracts"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { catalogOperationsRuntimeExtension } from "./catalog-runtime-extension.js"
import {
  type OperationsExpiredHoldsJobRuntime,
  operationsExpiredHoldsJobRuntimePort,
} from "./expired-holds-job-runtime-port.js"

export interface OperationsRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
}

export function createOperationsRuntimePortContribution(
  host: OperationsRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  return {
    [catalogOperationsRuntimeExtensionPort.id]: catalogOperationsRuntimeExtension,
    [operationsExpiredHoldsJobRuntimePort.id]: {
      resolveDb: () => host.primitives.database.resolve<PostgresJsDatabase>(undefined),
    } satisfies OperationsExpiredHoldsJobRuntime,
  }
}
