import type { InquiryListQueryInput } from "@voyant-travel/relationships-contracts"

export type PeopleListSortField = "name" | "relation" | "status" | "createdAt" | "updatedAt"
export type PeopleListSortDir = "asc" | "desc"

export interface PeopleListFilters {
  search?: string | undefined
  organizationId?: string | undefined
  ownerId?: string | undefined
  relation?: string | undefined
  status?: string | undefined
  sortBy?: PeopleListSortField | undefined
  sortDir?: PeopleListSortDir | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export type OrganizationsListSortField =
  | "name"
  | "industry"
  | "relation"
  | "status"
  | "createdAt"
  | "updatedAt"
export type OrganizationsListSortDir = "asc" | "desc"

export interface OrganizationsListFilters {
  search?: string | undefined
  taxId?: string | undefined
  ownerId?: string | undefined
  relation?: string | undefined
  status?: string | undefined
  sortBy?: OrganizationsListSortField | undefined
  sortDir?: OrganizationsListSortDir | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface ActivitiesListFilters {
  search?: string | undefined
  ownerId?: string | undefined
  status?: string | undefined
  type?: string | undefined
  entityType?: string | undefined
  entityId?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface CustomerSignalsListFilters {
  personId?: string | undefined
  assignedToUserId?: string | undefined
  status?: string | undefined
  kind?: string | undefined
  productId?: string | undefined
  search?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export type InquiriesListFilters = Partial<InquiryListQueryInput>

export interface PersonRelationshipsListFilters {
  kind?: string | undefined
  direction?: "from" | "to" | "both" | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface PersonDocumentsListFilters {
  type?: string | undefined
  expiringBefore?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface PersonCommunicationsListFilters {
  channel?: string | undefined
  direction?: "inbound" | "outbound" | undefined
  dateFrom?: string | undefined
  dateTo?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export const relationshipsQueryKeys = {
  all: ["voyant", "relationships"] as const,

  people: () => [...relationshipsQueryKeys.all, "people"] as const,
  peopleList: (filters: PeopleListFilters) =>
    [...relationshipsQueryKeys.people(), "list", filters] as const,
  person: (id: string) => [...relationshipsQueryKeys.people(), "detail", id] as const,
  personDocuments: (personId: string, filters: PersonDocumentsListFilters = {}) =>
    [...relationshipsQueryKeys.person(personId), "documents", filters] as const,
  personDocument: (id: string) =>
    [...relationshipsQueryKeys.all, "person-documents", "detail", id] as const,
  personDocumentReveal: (id: string) =>
    [...relationshipsQueryKeys.all, "person-documents", "reveal", id] as const,
  personPaymentMethods: (personId: string) =>
    [...relationshipsQueryKeys.person(personId), "payment-methods"] as const,
  personPaymentMethod: (id: string) =>
    [...relationshipsQueryKeys.all, "person-payment-methods", "detail", id] as const,
  personCommunications: (personId: string, filters: PersonCommunicationsListFilters = {}) =>
    [...relationshipsQueryKeys.person(personId), "communications", filters] as const,
  personTravelSnapshot: (personId: string) =>
    [...relationshipsQueryKeys.person(personId), "travel-snapshot"] as const,
  personRelationships: (personId: string, filters: PersonRelationshipsListFilters = {}) =>
    [...relationshipsQueryKeys.person(personId), "relationships", filters] as const,
  customerSignals: () => [...relationshipsQueryKeys.all, "customer-signals"] as const,
  customerSignalsList: (filters: CustomerSignalsListFilters) =>
    [...relationshipsQueryKeys.customerSignals(), "list", filters] as const,
  customerSignal: (id: string) =>
    [...relationshipsQueryKeys.customerSignals(), "detail", id] as const,
  customerSignalsByPerson: (personId: string) =>
    [...relationshipsQueryKeys.person(personId), "signals"] as const,

  inquiries: () => [...relationshipsQueryKeys.all, "inquiries"] as const,
  inquiriesList: (filters: InquiriesListFilters) =>
    [...relationshipsQueryKeys.inquiries(), "list", filters] as const,
  inquiry: (id: string) => [...relationshipsQueryKeys.inquiries(), "detail", id] as const,
  inquiryActivities: (id: string) => [...relationshipsQueryKeys.inquiry(id), "activities"] as const,

  organizations: () => [...relationshipsQueryKeys.all, "organizations"] as const,
  organizationsList: (filters: OrganizationsListFilters) =>
    [...relationshipsQueryKeys.organizations(), "list", filters] as const,
  organization: (id: string) => [...relationshipsQueryKeys.organizations(), "detail", id] as const,

  activities: () => [...relationshipsQueryKeys.all, "activities"] as const,
  activitiesList: (filters: ActivitiesListFilters) =>
    [...relationshipsQueryKeys.activities(), "list", filters] as const,
  activity: (id: string) => [...relationshipsQueryKeys.activities(), "detail", id] as const,
  activityLinks: (activityId: string) =>
    [...relationshipsQueryKeys.activity(activityId), "links"] as const,
} as const
