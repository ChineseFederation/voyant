import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import { legalContractDocumentJobRuntimePort } from "./contract-document-job-runtime-port.js"
import { legalDocumentArtifactProviderPort } from "./contracts/document-artifact-provider.js"
import {
  createLegalDocumentOperationEngine,
  hasRecoverableLegalDocumentOperations,
} from "./contracts/document-operation.js"

class LegalDocumentRecoveryProviderUnavailableError extends Error {
  constructor() {
    super("Recoverable legal document operations exist but no artifact provider is available.")
    this.name = "LegalDocumentRecoveryProviderUnavailableError"
  }
}

/** Reconcile due durable legal document operations without accepting arbitrary job payloads. */
export async function runDueLegalContractDocumentOperationsJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  const runtime = await context.getPort(legalContractDocumentJobRuntimePort)
  const db = await runtime.resolveDb()
  if (!context.hasPort(legalDocumentArtifactProviderPort)) {
    if (await hasRecoverableLegalDocumentOperations(db)) {
      throw new LegalDocumentRecoveryProviderUnavailableError()
    }
    return
  }
  const provider = await context.getPort(legalDocumentArtifactProviderPort)
  await createLegalDocumentOperationEngine({ provider }).runDue(db)
}

export { legalContractDocumentJobRuntimePort } from "./contract-document-job-runtime-port.js"
