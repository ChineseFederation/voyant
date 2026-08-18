import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { ApiModule } from "@voyant-travel/hono/module"
import { CUSTOMER_SIGNAL_CREATED_EVENT, emitCustomerSignalCreated } from "./events.js"
import { relationshipsLinkable } from "./linkables.js"
import {
  buildRelationshipsRouteRuntime,
  RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY,
  type RelationshipsRouteRuntimeOptions,
} from "./route-runtime.js"
import { relationshipsRoutes } from "./routes/index.js"
import { publicInquiryRoutes } from "./routes/inquiries-public.js"
import { relationshipsRouteRuntimePort } from "./runtime-port.js"
import { relationshipsService } from "./service/index.js"

export {
  inquiryLinkable,
  organizationLinkable,
  personLinkable,
  relationshipsLinkable,
} from "./linkables.js"
export type { RelationshipsRoutes } from "./routes/index.js"
export { inquiryOptionUnitLink, inquiryProductLink } from "./standard-links.js"

export const relationshipsModule: Module = {
  name: "relationships",
  linkable: relationshipsLinkable,
  requiresTransactionalDb: true,
}

export interface RelationshipsApiModuleOptions extends RelationshipsRouteRuntimeOptions {}

/**
 * Configurable factory for the Relationships API module. Use this when the
 * deployment needs a non-default KMS resolver (e.g. Voyant Cloud Vault) so
 * admin PII routes can decrypt person documents on demand.
 */
export function createRelationshipsApiModule(
  options: RelationshipsApiModuleOptions = {},
): ApiModule {
  const module: Module = {
    ...relationshipsModule,
    bootstrap: ({ bindings, container }) => {
      container.register(
        RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY,
        buildRelationshipsRouteRuntime(bindings as Record<string, unknown>, options),
      )
    },
  }
  return {
    module,
    adminRoutes: relationshipsRoutes,
    publicRoutes: publicInquiryRoutes,
    anonymous: true,
    optionalCustomerAuth: true,
  }
}

/** Package-owned adapter from the graph port registry to the Relationships route factory. */
export const createRelationshipsVoyantRuntime = defineGraphRuntimeFactory(async ({ getPort }) =>
  createRelationshipsApiModule(await getPort(relationshipsRouteRuntimePort)),
)

export type {
  CustomerSignalCreatedEvent,
  CustomerSignalCreatedIntake,
  InquiryAssignedEvent,
  InquiryClosedEvent,
  InquiryConvertedEvent,
  InquiryEvent,
  InquiryStatusChangedEvent,
  InquiryTargetChangedEvent,
  OrganizationChangedEvent,
  PersonChangedEvent,
  RelationshipChangeAction,
} from "./events.js"
export {
  emitOrganizationChanged,
  emitPersonChanged,
  INQUIRY_ASSIGNED_EVENT,
  INQUIRY_CLOSED_EVENT,
  INQUIRY_CONVERTED_EVENT,
  INQUIRY_CREATED_EVENT,
  INQUIRY_REOPENED_EVENT,
  INQUIRY_STATUS_CHANGED_EVENT,
  INQUIRY_TARGET_ADDED_EVENT,
  INQUIRY_TARGET_REMOVED_EVENT,
  INQUIRY_UPDATED_EVENT,
  ORGANIZATION_CHANGED_EVENT,
  PERSON_CHANGED_EVENT,
} from "./events.js"
export type {
  RelationshipsRouteRuntime,
  RelationshipsRouteRuntimeOptions,
  ResolveRelationshipsKmsProvider,
} from "./route-runtime.js"
export {
  buildRelationshipsRouteRuntime,
  RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY,
} from "./route-runtime.js"
export { relationshipsRouteRuntimePort } from "./runtime-port.js"
export type {
  Activity,
  ActivityLink,
  ActivityParticipant,
  CommunicationLogEntry,
  CustomerSignal,
  Inquiry,
  InquiryConversion,
  NewActivity,
  NewActivityLink,
  NewActivityParticipant,
  NewCommunicationLogEntry,
  NewCustomerSignal,
  NewInquiry,
  NewInquiryConversion,
  NewOrganization,
  NewOrganizationNote,
  NewPerson,
  NewPersonDocument,
  NewPersonNote,
  NewPersonPaymentMethod,
  NewPersonRelationship,
  NewSegment,
  NewSegmentMember,
  Organization,
  OrganizationNote,
  Person,
  PersonDocument,
  PersonNote,
  PersonPaymentMethod,
  PersonRelationship,
  Segment,
  SegmentMember,
} from "./schema.js"
export {
  activities,
  activityLinks,
  activityParticipants,
  communicationLog,
  customerSignalKindEnum,
  customerSignalSourceEnum,
  customerSignalStatusEnum,
  customerSignals,
  inquiries,
  inquiryCloseOutcomeEnum,
  inquiryConversionKindEnum,
  inquiryConversionModeEnum,
  inquiryConversions,
  inquiryKindEnum,
  inquiryStatusEnum,
  organizationNotes,
  organizations,
  people,
  personDirectoryView,
  personDocuments,
  personDocumentTypeEnum,
  personNotes,
  personPaymentMethods,
  personRelationshipKindEnum,
  personRelationships,
  segmentMembers,
  segments,
} from "./schema.js"
export type {
  CreateCustomerSignalInput,
  CustomerSignalListQuery,
  UpdateCustomerSignalInput,
} from "./service/customer-signals.js"
export { customerSignalsService } from "./service/customer-signals.js"
export type { InquiryServiceErrorCode } from "./service/inquiries.js"
export { InquiryServiceError, inquiriesService } from "./service/inquiries.js"
export type {
  CreatePersonDocumentInput,
  PersonDocumentListQuery,
  PersonDocumentType,
  PersonTravelSnapshot,
  UpdatePersonDocumentInput,
} from "./service/person-documents.js"
export {
  personDocumentNumberPlaintextSchema,
  personDocumentsService,
  personPiiBlobPlaintextSchema,
} from "./service/person-documents.js"
export type {
  CreatePersonRelationshipInput,
  PersonRelationshipKind,
  PersonRelationshipListQuery,
  UpdatePersonRelationshipInput,
} from "./service/person-relationships.js"
export { personRelationshipsService } from "./service/person-relationships.js"
export type {
  AssignInquiryInput,
  CloseInquiryInput,
  ConvertInquiryToProposalCommand,
  CreateInquiryInput,
  InquiryCreateResponse,
  InquiryListQueryInput,
  InquiryProposalConversionRefusalReason,
  InquiryProposalConversionResult,
  InquiryRecord,
  ReopenInquiryInput,
  TransitionInquiryInput,
  UpdateInquiryInput,
} from "./validation.js"
export {
  activityListQuerySchema,
  assignInquirySchema,
  closeInquirySchema,
  communicationChannelSchema,
  communicationDirectionSchema,
  communicationListQuerySchema,
  convertInquiryToProposalSchema,
  createInquirySchema,
  customerSignalKindSchema,
  customerSignalListQuerySchema,
  customerSignalPrioritySchema,
  customerSignalSourceSchema,
  customerSignalStatusSchema,
  inquiryCloseOutcomeSchema,
  inquiryContactSnapshotSchema,
  inquiryCreateResponseSchema,
  inquiryKindSchema,
  inquiryListQuerySchema,
  inquiryListResponseSchema,
  inquiryPrioritySchema,
  inquiryProposalConversionRefusalReasonSchema,
  inquiryProposalConversionRefusalSchema,
  inquiryProposalConversionResultSchema,
  inquiryRecordSchema,
  inquiryResponseSchema,
  inquirySourceSchema,
  inquiryStatusSchema,
  inquiryTravelBriefV1Schema,
  insertActivityLinkSchema,
  insertActivityParticipantSchema,
  insertActivitySchema,
  insertCommunicationLogSchema,
  insertCustomerSignalSchema,
  insertOrganizationNoteSchema,
  insertOrganizationSchema,
  insertPersonDocumentFromPlaintextSchema,
  insertPersonDocumentSchema,
  insertPersonNoteSchema,
  insertPersonPaymentMethodSchema,
  insertPersonRelationshipSchema,
  insertPersonSchema,
  insertSegmentSchema,
  mergeOrganizationSchema,
  mergePersonSchema,
  organizationListQuerySchema,
  personDocumentListQuerySchema,
  personDocumentTypeSchema,
  personListQuerySchema,
  personRelationshipKindSchema,
  personRelationshipListQuerySchema,
  relationTypeSchema,
  reopenInquirySchema,
  resolveCustomerSignalSchema,
  transitionInquirySchema,
  updateActivitySchema,
  updateCustomerSignalSchema,
  updateInquirySchema,
  updateOrganizationNoteSchema,
  updateOrganizationSchema,
  updatePersonDocumentFromPlaintextSchema,
  updatePersonDocumentSchema,
  updatePersonNoteSchema,
  updatePersonPaymentMethodSchema,
  updatePersonProfilePiiSchema,
  updatePersonRelationshipSchema,
  updatePersonSchema,
} from "./validation.js"
export { CUSTOMER_SIGNAL_CREATED_EVENT, emitCustomerSignalCreated, relationshipsService }
