import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { ApiModule } from "@voyant-travel/hono/module"

import { proposalsLinkable } from "./linkables.js"
import type { ProposalsRouteRuntimeOptions } from "./route-runtime.js"
import { createProposalsRoutes } from "./routes/index.js"
import { proposalsRuntimePort } from "./runtime-port.js"

export { proposalLinkable, proposalsLinkable, proposalVersionLinkable } from "./linkables.js"
export type { ProposalsRoutes } from "./routes/index.js"

export const proposalsModule: Module = {
  name: "proposals",
  linkable: proposalsLinkable,
  requiresTransactionalDb: true,
}

export interface ProposalsApiModuleOptions extends ProposalsRouteRuntimeOptions {}

export function createProposalsApiModule(options: ProposalsApiModuleOptions = {}): ApiModule {
  return {
    module: proposalsModule,
    adminRoutes: createProposalsRoutes(options),
  }
}

/** Package-owned adapter from graph runtime ports to the Proposals route factory. */
export const createProposalsVoyantRuntime = defineGraphRuntimeFactory(async ({ getPort }) =>
  createProposalsApiModule(await getPort(proposalsRuntimePort)),
)

export type {
  ProposalNotificationDelivery,
  ProposalNotificationInput,
  ProposalsNotificationsRuntime,
  ProposalsPresentationRuntime,
  ProposalsRuntime,
  ProposalsSnapshotRuntime,
} from "./runtime-port.js"
export {
  proposalsNotificationsRuntimePort,
  proposalsPresentationRuntimePort,
  proposalsRuntimePort,
  proposalsSnapshotRuntimePort,
} from "./runtime-port.js"

export const proposalsApiModule: ApiModule = createProposalsApiModule()

export type { BookingProposalDetail, NewBookingProposalDetail } from "./booking-extension.js"
export {
  bookingProposalDetails,
  bookingProposalExtensionService,
  proposalsBookingExtension,
} from "./booking-extension.js"
export { createCheckoutInquiryRuntime } from "./checkout-inquiry-runtime.js"
export type {
  AcceptPublicProposalResult,
  ApplyTripSnapshotToProposalVersionResult,
  DeclinePublicProposalResult,
  ProposalPresentationRoutesOptions,
  ProposalVersionSnapshotRoutesOptions,
  PublicProposalFeedbackInput,
  PublicProposalFeedbackRecord,
  PublicProposalVersionProposal,
  PublicProposalVersionProposalLine,
  RequestPublicProposalEditsResult,
  SendProposalVersionResult,
} from "./proposal-routes.js"
export {
  buildProposalVersionProposalUrl,
  createProposalPresentationAdminRoutes,
  createProposalPresentationApiExtension,
  createProposalPresentationPublicRoutes,
  createProposalPresentationVoyantRuntime,
  createProposalVersionSnapshotApiExtension,
  createProposalVersionSnapshotRoutes,
  createProposalVersionSnapshotVoyantRuntime,
  tripSnapshotToProposalVersionApply,
} from "./proposal-routes.js"
export type {
  ProposalsRouteRuntime,
  ProposalsRouteRuntimeOptions,
  ResolveProposalParticipantPersonById,
} from "./route-runtime.js"
export type {
  NewPipeline,
  NewProposal,
  NewProposalParticipant,
  NewProposalProduct,
  NewProposalVersion,
  NewProposalVersionLine,
  NewStage,
  Pipeline,
  Proposal,
  ProposalParticipant,
  ProposalProduct,
  ProposalVersion,
  ProposalVersionLine,
  Stage,
} from "./schema.js"
export {
  pipelines,
  proposalParticipants,
  proposalProducts,
  proposalStatusEnum,
  proposals,
  proposalVersionLines,
  proposalVersionStatusEnum,
  proposalVersions,
  stages,
} from "./schema.js"
export type { AcceptProposalVersionResult } from "./service/index.js"
export {
  ProposalVersionConflictError,
  pipelinesService,
  proposalRecordsService,
  proposalsService,
  proposalVersionsService,
  snapshotAndSendProposalInputSchema,
} from "./service/index.js"
export {
  acceptProposalVersionSchema,
  applyTripSnapshotProposalVersionLineSchema,
  applyTripSnapshotToProposalVersionSchema,
  declineProposalVersionSchema,
  entityTypeSchema,
  expireProposalVersionsSchema,
  insertPipelineSchema,
  insertProposalParticipantSchema,
  insertProposalProductSchema,
  insertProposalSchema,
  insertProposalVersionLineSchema,
  insertProposalVersionSchema,
  insertStageSchema,
  participantRoleSchema,
  pipelineListQuerySchema,
  proposalListQuerySchema,
  proposalStatusSchema,
  proposalVersionListQuerySchema,
  proposalVersionStatusSchema,
  sendProposalVersionSchema,
  stageListQuerySchema,
  updatePipelineSchema,
  updateProposalProductSchema,
  updateProposalSchema,
  updateProposalVersionLineSchema,
  updateProposalVersionSchema,
  updateStageSchema,
} from "./validation.js"
