export interface LegalContractsListFilters {
  search?: string | undefined
  scope?: string | undefined
  status?: string | undefined
  /** Restrict to contracts linked to this booking. */
  bookingId?: string | undefined
  targetKind?: string | undefined
  targetId?: string | undefined
  targetProvider?: string | undefined
  targetSourceRef?: string | undefined
  legacyTransactionOfferId?: string | undefined
  legacyTransactionOrderId?: string | undefined
  personId?: string | undefined
  organizationId?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface LegalContractTemplatesListFilters {
  search?: string | undefined
  scope?: string | undefined
  language?: string | undefined
  channelId?: string | undefined
  active?: boolean | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface LegalContractTemplateDefaultFilters {
  scope?: string | undefined
  language?: string | undefined
  channelId?: string | undefined
  fallbackLanguages?: string[] | undefined
}

export interface LegalPoliciesListFilters {
  search?: string | undefined
  kind?: string | undefined
  language?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface LegalContractNumberSeriesListFilters {
  scope?: string | undefined
  active?: boolean | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface LegalPolicyAssignmentsListFilters {
  policyId?: string | undefined
  scope?: string | undefined
  productId?: string | undefined
  channelId?: string | undefined
  supplierId?: string | undefined
  marketId?: string | undefined
  organizationId?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface ResolvePolicyFilters {
  kind: string
  productId?: string | undefined
  channelId?: string | undefined
  supplierId?: string | undefined
  marketId?: string | undefined
  organizationId?: string | undefined
  at?: string | undefined
}

export interface LegalPolicyAcceptancesListFilters {
  policyId?: string | undefined
  policyVersionId?: string | undefined
  personId?: string | undefined
  bookingId?: string | undefined
  targetKind?: string | undefined
  targetId?: string | undefined
  targetProvider?: string | undefined
  targetSourceRef?: string | undefined
  legacyTransactionOfferId?: string | undefined
  legacyTransactionOrderId?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface LegalTermsListFilters {
  contractId?: string | undefined
  policyVersionId?: string | undefined
  targetKind?: string | undefined
  targetId?: string | undefined
  targetProvider?: string | undefined
  targetSourceRef?: string | undefined
  legacyTransactionOfferId?: string | undefined
  legacyTransactionOrderId?: string | undefined
  termType?: string | undefined
  acceptanceStatus?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export const legalQueryKeys = {
  all: ["legal"] as const,
  contracts: () => [...legalQueryKeys.all, "contracts"] as const,
  contractsList: (filters: LegalContractsListFilters) =>
    [...legalQueryKeys.contracts(), filters] as const,
  contract: (id: string) => [...legalQueryKeys.contracts(), id] as const,
  contractSignatures: (id: string) => [...legalQueryKeys.contract(id), "signatures"] as const,
  contractAttachments: (id: string) => [...legalQueryKeys.contract(id), "attachments"] as const,
  contractBookingReview: (id: string) =>
    [...legalQueryKeys.contract(id), "booking-review"] as const,
  templates: () => [...legalQueryKeys.all, "templates"] as const,
  templatesList: (filters: LegalContractTemplatesListFilters) =>
    [...legalQueryKeys.templates(), filters] as const,
  templateDefault: (filters: LegalContractTemplateDefaultFilters) =>
    [...legalQueryKeys.templates(), "default", filters] as const,
  template: (id: string) => [...legalQueryKeys.templates(), id] as const,
  templateVersions: (id: string) => [...legalQueryKeys.template(id), "versions"] as const,
  numberSeries: () => [...legalQueryKeys.all, "number-series"] as const,
  numberSeriesList: (filters: LegalContractNumberSeriesListFilters = {}) =>
    [...legalQueryKeys.numberSeries(), filters] as const,
  numberSeriesDetail: (id: string) => [...legalQueryKeys.numberSeries(), id] as const,
  policies: () => [...legalQueryKeys.all, "policies"] as const,
  policiesList: (filters: LegalPoliciesListFilters) =>
    [...legalQueryKeys.policies(), filters] as const,
  policy: (id: string) => [...legalQueryKeys.policies(), id] as const,
  policyVersions: (id: string) => [...legalQueryKeys.policy(id), "versions"] as const,
  policyRules: (versionId: string) => [...legalQueryKeys.policies(), "rules", versionId] as const,
  policyAssignments: (filters: LegalPolicyAssignmentsListFilters) =>
    [...legalQueryKeys.policies(), "assignments", filters] as const,
  policyAcceptances: (filters: LegalPolicyAcceptancesListFilters) =>
    [...legalQueryKeys.policies(), "acceptances", filters] as const,
  terms: () => [...legalQueryKeys.all, "terms"] as const,
  termsList: (filters: LegalTermsListFilters) => [...legalQueryKeys.terms(), filters] as const,
  term: (id: string) => [...legalQueryKeys.terms(), id] as const,
  resolvePolicy: (filters: ResolvePolicyFilters) =>
    [...legalQueryKeys.policies(), "resolve", filters] as const,
}
