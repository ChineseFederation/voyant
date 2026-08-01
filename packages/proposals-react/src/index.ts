export {
  defaultFetcher,
  fetchWithValidation,
  VoyantApiError,
  type VoyantFetcher,
} from "./client.js"
export {
  CreateProposalDialog,
  type CreateProposalDialogProps,
} from "./components/create-proposal-dialog.js"
export {
  CreateProposalVersionDialog,
  type CreateProposalVersionDialogProps,
} from "./components/create-proposal-version-dialog.js"
export {
  ProposalSummaryCard,
  type ProposalSummaryCardProps,
} from "./components/proposal-summary-card.js"
export {
  ProposalVersionLinesCard,
  type ProposalVersionLinesCardProps,
} from "./components/proposal-version-detail-sections.js"
export {
  ProposalVersionsPage,
  type ProposalVersionsPageProps,
} from "./components/proposal-versions-page.js"
export {
  ProposalsBoard,
  type ProposalsBoardProps,
} from "./components/proposals-board.js"
export {
  type CreatePipelineInput,
  type CreateStageInput,
  type UpdatePipelineInput,
  type UpdateStageInput,
  usePipelineMutation,
} from "./hooks/use-pipeline-mutation.js"
export {
  type UsePipelineOptions,
  type UsePipelinesOptions,
  usePipeline,
  usePipelines,
} from "./hooks/use-pipelines.js"
export { type UseProposalOptions, useProposal } from "./hooks/use-proposal.js"
export { type UseProposalMediaOptions, useProposalMedia } from "./hooks/use-proposal-media.js"
export {
  type CreateProposalMediaInput,
  useProposalMediaMutation,
} from "./hooks/use-proposal-media-mutation.js"
export {
  type CreateProposalInput,
  type UpdateProposalInput,
  useProposalMutation,
} from "./hooks/use-proposal-mutation.js"
export {
  type CreateProposalParticipantInput,
  useProposalParticipantMutation,
} from "./hooks/use-proposal-participant-mutation.js"
export {
  type UseProposalParticipantsOptions,
  useProposalParticipants,
} from "./hooks/use-proposal-participants.js"
export {
  type CreateProposalProductInput,
  type UpdateProposalProductInput,
  useProposalProductMutation,
} from "./hooks/use-proposal-product-mutation.js"
export {
  type UseProposalProductsOptions,
  useProposalProducts,
} from "./hooks/use-proposal-products.js"
export {
  type UseProposalVersionOptions,
  useProposalVersion,
  useProposalVersionLines,
} from "./hooks/use-proposal-version.js"
export {
  type CreateProposalVersionInput,
  type CreateProposalVersionLineInput,
  type ExpireProposalVersionsInput,
  type SendProposalVersionInput,
  type UpdateProposalVersionInput,
  type UpdateProposalVersionLineInput,
  useProposalVersionMutation,
} from "./hooks/use-proposal-version-mutation.js"
export {
  type UseProposalVersionsOptions,
  useProposalVersions,
} from "./hooks/use-proposal-versions.js"
export { type UseProposalsOptions, useProposals } from "./hooks/use-proposals.js"
export {
  type UseStageOptions,
  type UseStagesOptions,
  useStage,
  useStages,
} from "./hooks/use-stages.js"
export {
  type CrmUiMessageOverrides,
  type CrmUiMessages,
  CrmUiMessagesProvider,
  crmUiEn,
  crmUiMessageDefinitions,
  crmUiRo,
  getCrmUiI18n,
  resolveCrmUiMessages,
  useCrmUiI18n,
  useCrmUiI18nOrDefault,
  useCrmUiMessages,
  useCrmUiMessagesOrDefault,
} from "./i18n/index.js"
export {
  useVoyantContext,
  type VoyantContextValue,
  VoyantProvider,
  type VoyantProviderProps,
} from "./provider.js"
export {
  type PipelinesListFilters,
  type ProposalsListFilters,
  type ProposalVersionsListFilters,
  proposalsQueryKeys,
  type StagesListFilters,
} from "./query-keys.js"
export {
  getPipelineQueryOptions,
  getPipelinesQueryOptions,
  getProposalQueryOptions,
  getProposalsQueryOptions,
  getProposalVersionLinesQueryOptions,
  getProposalVersionQueryOptions,
  getProposalVersionsQueryOptions,
  getStageQueryOptions,
  getStagesQueryOptions,
} from "./query-options.js"
export {
  type PipelineRecord,
  type ProposalMediaRecord,
  type ProposalParticipantRecord,
  type ProposalProductRecord,
  type ProposalRecord,
  type ProposalVersionLineRecord,
  type ProposalVersionRecord,
  pipelineRecordSchema,
  proposalMediaRecordSchema,
  proposalParticipantRecordSchema,
  proposalProductRecordSchema,
  proposalRecordSchema,
  proposalVersionLineRecordSchema,
  proposalVersionRecordSchema,
  type StageRecord,
  stageRecordSchema,
} from "./schemas.js"
