import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { ApiModule } from "@voyant-travel/hono/module"

import { quotesLinkable } from "./linkables.js"
import type { QuotesRouteRuntimeOptions } from "./route-runtime.js"
import { createQuotesRoutes } from "./routes/index.js"
import { quotesRuntimePort } from "./runtime-port.js"

export { quoteLinkable, quotesLinkable, quoteVersionLinkable } from "./linkables.js"
export type { QuotesRoutes } from "./routes/index.js"

export const quotesModule: Module = {
  name: "quotes",
  linkable: quotesLinkable,
  requiresTransactionalDb: true,
}

export interface QuotesApiModuleOptions extends QuotesRouteRuntimeOptions {}

export function createQuotesApiModule(options: QuotesApiModuleOptions = {}): ApiModule {
  return {
    module: quotesModule,
    adminRoutes: createQuotesRoutes(options),
  }
}

/** Package-owned adapter from graph runtime ports to the Quotes route factory. */
export const createQuotesVoyantRuntime = defineGraphRuntimeFactory(async ({ getPort }) =>
  createQuotesApiModule(await getPort(quotesRuntimePort)),
)

export type {
  QuoteProposalNotificationDelivery,
  QuoteProposalNotificationInput,
  QuotesNotificationsRuntime,
  QuotesProposalRuntime,
  QuotesRuntime,
  QuotesSnapshotRuntime,
} from "./runtime-port.js"
export {
  quotesNotificationsRuntimePort,
  quotesProposalRuntimePort,
  quotesRuntimePort,
  quotesSnapshotRuntimePort,
} from "./runtime-port.js"

export const quotesApiModule: ApiModule = createQuotesApiModule()

export type { BookingQuoteDetail, NewBookingQuoteDetail } from "./booking-extension.js"
export {
  bookingQuoteDetails,
  bookingQuoteExtensionService,
  quotesBookingExtension,
} from "./booking-extension.js"
export { createCheckoutInquiryRuntime } from "./checkout-inquiry-runtime.js"
export type {
  AcceptPublicProposalResult,
  ApplyTripSnapshotToQuoteVersionResult,
  DeclinePublicProposalResult,
  PublicProposalFeedbackInput,
  PublicProposalFeedbackRecord,
  PublicQuoteVersionProposal,
  PublicQuoteVersionProposalLine,
  QuoteProposalRoutesOptions,
  QuoteVersionSnapshotRoutesOptions,
  RequestPublicProposalEditsResult,
  SendQuoteVersionResult,
} from "./proposal-routes.js"
export {
  buildQuoteVersionProposalUrl,
  createQuoteProposalAdminRoutes,
  createQuoteProposalApiExtension,
  createQuoteProposalPublicRoutes,
  createQuoteProposalVoyantRuntime,
  createQuoteVersionSnapshotApiExtension,
  createQuoteVersionSnapshotRoutes,
  createQuoteVersionSnapshotVoyantRuntime,
  tripSnapshotToQuoteVersionApply,
} from "./proposal-routes.js"
export type {
  QuotesRouteRuntime,
  QuotesRouteRuntimeOptions,
  ResolveQuoteParticipantPersonById,
} from "./route-runtime.js"
export type {
  NewPipeline,
  NewQuote,
  NewQuoteParticipant,
  NewQuoteProduct,
  NewQuoteVersion,
  NewQuoteVersionLine,
  NewStage,
  Pipeline,
  Quote,
  QuoteParticipant,
  QuoteProduct,
  QuoteVersion,
  QuoteVersionLine,
  Stage,
} from "./schema.js"
export {
  pipelines,
  quoteParticipants,
  quoteProducts,
  quoteStatusEnum,
  quotes,
  quoteVersionLines,
  quoteVersionStatusEnum,
  quoteVersions,
  stages,
} from "./schema.js"
export type { AcceptQuoteVersionResult } from "./service/index.js"
export {
  pipelinesService,
  QuoteVersionConflictError,
  quoteRecordsService,
  quotesService,
  quoteVersionsService,
  snapshotAndSendQuoteInputSchema,
} from "./service/index.js"
export {
  acceptQuoteVersionSchema,
  applyTripSnapshotQuoteVersionLineSchema,
  applyTripSnapshotToQuoteVersionSchema,
  declineQuoteVersionSchema,
  entityTypeSchema,
  expireQuoteVersionsSchema,
  insertPipelineSchema,
  insertQuoteParticipantSchema,
  insertQuoteProductSchema,
  insertQuoteSchema,
  insertQuoteVersionLineSchema,
  insertQuoteVersionSchema,
  insertStageSchema,
  participantRoleSchema,
  pipelineListQuerySchema,
  quoteListQuerySchema,
  quoteStatusSchema,
  quoteVersionListQuerySchema,
  quoteVersionStatusSchema,
  sendQuoteVersionSchema,
  stageListQuerySchema,
  updatePipelineSchema,
  updateQuoteProductSchema,
  updateQuoteSchema,
  updateQuoteVersionLineSchema,
  updateQuoteVersionSchema,
  updateStageSchema,
} from "./validation.js"
