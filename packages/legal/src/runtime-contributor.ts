import { commerceLegalRuntimePort } from "@voyant-travel/commerce/runtime-port"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { DocumentRenderer } from "@voyant-travel/core/document-rendering"
import type { VoyantPort } from "@voyant-travel/core/project"
import type { StorageProvider } from "@voyant-travel/storage"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { createCommerceLegalRuntime } from "./commerce-runtime.js"
import { legalContractDocumentJobRuntimePort } from "./contract-document-job-runtime-port.js"
import { legalContractDocumentRuntimePort } from "./contract-document-runtime-port.js"
import type { LegalDocumentArtifactProvider } from "./contracts/document-artifact-provider.js"
import { createStandardLegalDocumentArtifactProvider } from "./document-artifact-runtime.js"
import { legalRuntimePort } from "./runtime-port.js"

export interface LegalRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  hasRuntimePort?(port: Pick<VoyantPort<unknown>, "id">): boolean
  getRuntimePort?<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
}

/** Selected-graph factory for the deployment-bound artifact provider. */
interface LegalDocumentArtifactGraphProviderContext {
  getResource<T = unknown>(declarationId: string): T | undefined
}

export async function createLegalDocumentArtifactGraphProvider(
  context: LegalDocumentArtifactGraphProviderContext,
): Promise<LegalDocumentArtifactProvider> {
  const db = context.getResource<PostgresJsDatabase>("@voyant-travel/legal#resource.database")
  const storage = context.getResource<StorageProvider>(
    "@voyant-travel/legal#resource.document-storage",
  )
  const renderer = context.getResource<DocumentRenderer>(
    "@voyant-travel/legal#resource.document-renderer",
  )
  if (!db || !storage || !renderer) {
    throw new Error(
      "The selected Legal document artifact provider requires database, document storage, and document renderer resources.",
    )
  }
  return createStandardLegalDocumentArtifactProvider({ db, storage, renderer })
}

/** Register the complete standard Node Legal runtime from domain-neutral host primitives. */
export function createLegalRuntimePortContribution(
  host: LegalRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const runtime = import("./runtime.js").then((module) =>
    module.createLegalRuntime(host.primitives),
  )
  return {
    [commerceLegalRuntimePort.id]: createCommerceLegalRuntime(host.primitives),
    [legalRuntimePort.id]: runtime.then((value) => value.legal),
    [legalContractDocumentRuntimePort.id]: runtime.then((value) => value.contractDocument),
    [legalContractDocumentJobRuntimePort.id]: {
      resolveDb: () => host.primitives.database.resolve(undefined),
    },
  }
}
