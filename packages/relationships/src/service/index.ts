import { accountsService } from "./accounts.js"
import { activitiesService } from "./activities.js"
import { customerSignalsService } from "./customer-signals.js"
import { inquiriesService } from "./inquiries.js"
import { personDocumentsService } from "./person-documents.js"
import { personRelationshipsService } from "./person-relationships.js"

export const relationshipsService = {
  ...accountsService,
  ...activitiesService,
  ...personDocumentsService,
  ...personRelationshipsService,
  ...customerSignalsService,
  ...inquiriesService,
}

export type {
  CreateCustomerSignalInput,
  CustomerSignalListQuery,
  UpdateCustomerSignalInput,
} from "./customer-signals.js"
export { customerSignalsService } from "./customer-signals.js"
export type { InquiryServiceErrorCode } from "./inquiries.js"
export { InquiryServiceError, inquiriesService } from "./inquiries.js"
export type { InquiryBookingConversionRefusalReason } from "./inquiry-booking-conversions.js"
export {
  convertInquiryToBookingTarget,
  InquiryBookingConversionRefusedError,
} from "./inquiry-booking-conversions.js"
export {
  convertInquiryToProposal,
  InquiryProposalConversionRefusedError,
} from "./inquiry-conversions.js"
export type {
  CreatePersonDocumentInput,
  PersonDocumentListQuery,
  PersonDocumentType,
  PersonTravelSnapshot,
  UpdatePersonDocumentInput,
} from "./person-documents.js"
export {
  personDocumentNumberPlaintextSchema,
  personDocumentsService,
  personPiiBlobPlaintextSchema,
} from "./person-documents.js"
export type {
  CreatePersonRelationshipInput,
  PersonRelationshipKind,
  PersonRelationshipListQuery,
  UpdatePersonRelationshipInput,
} from "./person-relationships.js"
export { personRelationshipsService } from "./person-relationships.js"
