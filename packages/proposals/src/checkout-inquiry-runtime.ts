import type {
  CheckoutInquiryRuntime,
  CreateCheckoutInquiryInput,
} from "@voyant-travel/proposals-contracts/checkout-inquiry"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { proposalsService } from "./service/index.js"

type CheckoutInquiryService = Pick<
  typeof proposalsService,
  "createProposal" | "listPipelines" | "listStages"
>

export function createCheckoutInquiryRuntime(
  service: CheckoutInquiryService = proposalsService,
): CheckoutInquiryRuntime {
  return {
    async resolvePipeline(database, preference) {
      if (preference.pipelineId && preference.stageId) {
        return {
          pipelineId: preference.pipelineId,
          stageId: preference.stageId,
        }
      }

      const db = database as PostgresJsDatabase
      const pipelines = await service.listPipelines(db, {
        entityType: "proposal",
        limit: 1,
        offset: 0,
      })
      const firstPipeline = pipelines.data[0]
      if (!firstPipeline) return null

      const stages = await service.listStages(db, {
        pipelineId: firstPipeline.id,
        limit: 1,
        offset: 0,
      })
      const stageId = preference.stageId ?? stages.data[0]?.id
      const pipelineId = preference.pipelineId ?? firstPipeline.id
      return pipelineId && stageId ? { pipelineId, stageId } : null
    },

    async createInquiry(database, input: CreateCheckoutInquiryInput) {
      const proposal = await service.createProposal(database as PostgresJsDatabase, {
        ...input,
        status: "open",
        tags: [],
      })
      return proposal ? { id: proposal.id } : null
    },
  }
}
