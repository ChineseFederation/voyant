import { pipelinesService } from "./pipelines.js"
import { proposalVersionsService } from "./proposal-versions.js"
import { proposalsService as proposalRecordsService } from "./proposals.js"

export const proposalsService = {
  ...pipelinesService,
  ...proposalRecordsService,
  ...proposalVersionsService,
}

export { PipelineDeleteConflictError, pipelinesService } from "./pipelines.js"
export type {
  ExecuteSnapshotAndSendProposalCommandInput,
  SnapshotAndSendProposalInput,
  SnapshotAndSendProposalResult,
} from "./proposal-delivery.js"
export {
  executeSnapshotAndSendProposalCommand,
  snapshotAndSendProposalInputSchema,
} from "./proposal-delivery.js"
export type { AcceptProposalVersionResult } from "./proposal-versions.js"
export {
  ProposalVersionConflictError,
  ProposalVersionParentNotFoundError,
  proposalVersionsService,
} from "./proposal-versions.js"
export { proposalsService as proposalRecordsService } from "./proposals.js"
