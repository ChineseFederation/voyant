import type { ReactNode } from "react"
import type {
  ActivityRecord,
  CommunicationLogRecord,
  OrganizationRecord,
  PersonDocumentRecord,
  PersonPaymentMethodRecord,
  PersonRecord,
  PersonRelationshipRecord,
  PersonTravelSnapshotRecord,
} from "../index.js"

export type PersonDetailTab =
  | "overview"
  | "proposals"
  | "activities"
  | "relationships"
  | "documents"
  | "paymentMethods"
  | "communications"
  | "addresses"
  | "bookings"
  | "invoices"
  | "payments"
  | "contracts"

export type PersonData = Pick<
  PersonRecord,
  | "dateOfBirth"
  | "createdAt"
  | "email"
  | "firstName"
  | "id"
  | "jobTitle"
  | "lastName"
  | "notes"
  | "organizationId"
  | "phone"
  | "preferredCurrency"
  | "preferredLanguage"
  | "relation"
  | "source"
  | "status"
  | "tags"
  | "updatedAt"
  | "website"
>

export type PersonOrganization = Pick<OrganizationRecord, "id" | "name" | "website">

export type PersonActivity = Pick<
  ActivityRecord,
  "createdAt" | "description" | "dueAt" | "id" | "status" | "subject" | "type" | "updatedAt"
>

export type PersonRelationship = Pick<
  PersonRelationshipRecord,
  | "createdAt"
  | "endDate"
  | "fromPersonId"
  | "id"
  | "inverseKind"
  | "isPrimary"
  | "kind"
  | "notes"
  | "startDate"
  | "toPersonId"
  | "updatedAt"
>

export type PersonDocument = Pick<
  PersonDocumentRecord,
  | "expiryDate"
  | "id"
  | "isPrimary"
  | "issueDate"
  | "issuingAuthority"
  | "issuingCountry"
  | "notes"
  | "type"
  | "updatedAt"
>

export type PersonPaymentMethod = Pick<
  PersonPaymentMethodRecord,
  | "brand"
  | "createdAt"
  | "expMonth"
  | "expYear"
  | "holderName"
  | "id"
  | "isDefault"
  | "last4"
  | "personId"
>

export type PersonCommunication = Pick<
  CommunicationLogRecord,
  "channel" | "content" | "createdAt" | "direction" | "id" | "personId" | "sentAt" | "subject"
>

export type PersonTravelSnapshot = PersonTravelSnapshotRecord

export interface PersonCommercialContextTabSlot {
  label?: string
  count?: number
  content: ReactNode
}

export interface PersonDetailPageSlots {
  afterTopBar?: ReactNode
  sidebarEnd?: ReactNode
  overviewContent?: ReactNode
  overviewEnd?: ReactNode
  proposalsContent?: ReactNode
  proposalsEnd?: ReactNode
  activitiesContent?: ReactNode
  activitiesEnd?: ReactNode
  relationshipsContent?: ReactNode
  relationshipsEnd?: ReactNode
  documentsContent?: ReactNode
  documentsEnd?: ReactNode
  bookingsTab?: PersonCommercialContextTabSlot
  invoicesTab?: PersonCommercialContextTabSlot
  paymentsTab?: PersonCommercialContextTabSlot
  contractsTab?: PersonCommercialContextTabSlot
}

export interface PersonDetailPageProps {
  id: string
  className?: string
  onBack?: () => void
  onDeleted?: () => void
  onOrganizationOpen?: (organizationId: string) => void
  onPersonOpen?: (personId: string) => void
  slots?: PersonDetailPageSlots
}
