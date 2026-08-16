export type {
  AcceptLegalTermInput,
  ArchivedInsurerDisclosure,
  ArchiveInsurerDisclosureInput,
  InsurerDisclosureDocumentInput,
} from "./disclosure-archive.js"
export {
  acceptLegalTerm,
  archiveInsurerDisclosureTerm,
  INSURER_DISCLOSURE_ARCHIVE_PREFIX,
  INSURER_DISCLOSURE_ATTACHMENT_KIND,
  InsurerDisclosureArchiveMismatchError,
  InsurerDisclosureArchiveMissingError,
  insurerDisclosureArchiveKey,
  insurerDisclosureChecksum,
  LEGAL_BOOKING_DOCUMENT_ATTACHMENT_KINDS,
  listBookingInsurerDisclosureAttachments,
  readArchivedInsurerDisclosure,
} from "./disclosure-archive.js"
export { legalTermLinkable, legalTermsLinkable } from "./linkables.js"
export type { LegalTermsAdminRoutes, LegalTermsPublicRoutes } from "./routes.js"
export { legalTermsAdminRoutes, legalTermsPublicRoutes } from "./routes.js"

export type { LegalTerm, NewLegalTerm } from "./schema.js"
export { legalTermAcceptanceStatusEnum, legalTerms, legalTermTypeEnum } from "./schema.js"
export type { CreateLegalTermInput, LegalTermListQuery, UpdateLegalTermInput } from "./service.js"
export { legalTermsService } from "./service.js"
export type { InsurerDisclosureTermType, LegalTermType } from "./validation.js"
export {
  acceptLegalTermSchema,
  INSURER_DISCLOSURE_TERM_TYPES,
  insertLegalTermSchema,
  insurerDisclosureTermTypeSchema,
  isInsurerDisclosureTermType,
  legalTermAcceptanceStatusSchema,
  legalTermArchivalViolation,
  legalTermListQuerySchema,
  legalTermTypeSchema,
  updateLegalTermSchema,
} from "./validation.js"
