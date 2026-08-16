"use client"

import { queryOptions } from "@tanstack/react-query"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import type { UseLegalBookingContractReviewOptions } from "./hooks/use-booking-contract-review.js"
import type { UseLegalContractOptions } from "./hooks/use-contract.js"
import type { UseLegalContractAttachmentsOptions } from "./hooks/use-contract-attachments.js"
import type { UseLegalContractSignaturesOptions } from "./hooks/use-contract-signatures.js"
import type { UseLegalContractTemplateOptions } from "./hooks/use-contract-template.js"
import type { UseLegalContractTemplateVersionsOptions } from "./hooks/use-contract-template-versions.js"
import type { UseLegalContractTemplatesOptions } from "./hooks/use-contract-templates.js"
import type { UseLegalContractsOptions } from "./hooks/use-contracts.js"
import type { UseLegalContractNumberSeriesOptions } from "./hooks/use-number-series.js"
import type { UseLegalPoliciesOptions } from "./hooks/use-policies.js"
import type { UseLegalPolicyOptions } from "./hooks/use-policy.js"
import type { UseLegalPolicyAcceptancesOptions } from "./hooks/use-policy-acceptances.js"
import type { UseLegalPolicyAssignmentsOptions } from "./hooks/use-policy-assignments.js"
import type { UseLegalPolicyRulesOptions } from "./hooks/use-policy-rules.js"
import type { UseLegalPolicyVersionsOptions } from "./hooks/use-policy-versions.js"
import {
  type LegalContractTemplateDefaultFilters,
  type LegalTermsListFilters,
  legalQueryKeys,
  type ResolvePolicyFilters,
} from "./query-keys.js"
import {
  legalBookingContractReviewResponse,
  legalContractAttachmentListResponse,
  legalContractListResponse,
  legalContractNumberSeriesListResponse,
  legalContractNumberSeriesSingleResponse,
  legalContractSignatureListResponse,
  legalContractSingleResponse,
  legalContractTemplateListResponse,
  legalContractTemplateSingleResponse,
  legalContractTemplateVersionListResponse,
  legalPolicyAcceptanceListResponse,
  legalPolicyAssignmentListResponse,
  legalPolicyListResponse,
  legalPolicyRuleListResponse,
  legalPolicySingleResponse,
  legalPolicyVersionListResponse,
  legalPolicyVersionSingleResponse,
  legalTermListResponse,
  legalTermSingleResponse,
  resolvedPolicyResponse,
} from "./schemas.js"

function toQueryString(filters: object) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "" || value === "all") continue
    params.set(key, Array.isArray(value) ? value.join(",") : String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

export function getLegalContractsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseLegalContractsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: legalQueryKeys.contractsList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/legal/contracts${toQueryString(filters)}`,
        legalContractListResponse,
        client,
      ),
  })
}

export function getLegalContractQueryOptions(
  client: FetchWithValidationOptions,
  id: string,
  _options: UseLegalContractOptions = {},
) {
  return queryOptions({
    queryKey: legalQueryKeys.contract(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/${id}`,
        legalContractSingleResponse,
        client,
      )
      return data
    },
  })
}

export function getLegalContractSignaturesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseLegalContractSignaturesOptions,
) {
  const { enabled: _enabled = true, contractId } = options
  return queryOptions({
    queryKey: legalQueryKeys.contractSignatures(contractId),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/${contractId}/signatures`,
        legalContractSignatureListResponse,
        client,
      )
      return data
    },
  })
}

export function getLegalContractAttachmentsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseLegalContractAttachmentsOptions,
) {
  const { enabled: _enabled = true, contractId } = options
  return queryOptions({
    queryKey: legalQueryKeys.contractAttachments(contractId),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/${contractId}/attachments`,
        legalContractAttachmentListResponse,
        client,
      )
      return data
    },
  })
}

export function getLegalBookingContractReviewQueryOptions(
  client: FetchWithValidationOptions,
  options: UseLegalBookingContractReviewOptions,
) {
  const { enabled: _enabled = true, contractId } = options
  return queryOptions({
    queryKey: legalQueryKeys.contractBookingReview(contractId),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/${contractId}/booking-review`,
        legalBookingContractReviewResponse,
        client,
      )
      return data
    },
    // The revision + content fingerprint here are what the operator approves
    // against, so a stale cached copy would approve content that has moved on.
    staleTime: 0,
    retry: false,
  })
}

export function getLegalContractTemplatesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseLegalContractTemplatesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: legalQueryKeys.templatesList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/legal/contracts/templates${toQueryString(filters)}`,
        legalContractTemplateListResponse,
        client,
      ),
  })
}

export function getDefaultLegalContractTemplateQueryOptions(
  client: FetchWithValidationOptions,
  options: LegalContractTemplateDefaultFilters = {},
) {
  return queryOptions({
    queryKey: legalQueryKeys.templateDefault(options),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/templates/default${toQueryString(options)}`,
        legalContractTemplateSingleResponse,
        client,
      )
      return data
    },
    retry: false,
  })
}

export function getLegalContractTemplateQueryOptions(
  client: FetchWithValidationOptions,
  id: string,
  _options: UseLegalContractTemplateOptions = {},
) {
  return queryOptions({
    queryKey: legalQueryKeys.template(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/templates/${id}`,
        legalContractTemplateSingleResponse,
        client,
      )
      return data
    },
  })
}

export function getLegalContractTemplateVersionsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseLegalContractTemplateVersionsOptions,
) {
  const { enabled: _enabled = true, templateId } = options
  return queryOptions({
    queryKey: legalQueryKeys.templateVersions(templateId),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/templates/${templateId}/versions`,
        legalContractTemplateVersionListResponse,
        client,
      )
      return data
    },
  })
}

export function getLegalContractNumberSeriesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseLegalContractNumberSeriesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: legalQueryKeys.numberSeriesList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/legal/contracts/number-series${toQueryString(filters)}`,
        legalContractNumberSeriesListResponse,
        client,
      ),
  })
}

export function getLegalContractNumberSeriesDetailQueryOptions(
  client: FetchWithValidationOptions,
  id: string,
) {
  return queryOptions({
    queryKey: legalQueryKeys.numberSeriesDetail(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/number-series/${id}`,
        legalContractNumberSeriesSingleResponse,
        client,
      )
      return data
    },
  })
}

export function getLegalPoliciesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseLegalPoliciesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: legalQueryKeys.policiesList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/legal/policies${toQueryString(filters)}`,
        legalPolicyListResponse,
        client,
      ),
  })
}

export function getLegalPolicyQueryOptions(
  client: FetchWithValidationOptions,
  id: string,
  _options: UseLegalPolicyOptions = {},
) {
  return queryOptions({
    queryKey: legalQueryKeys.policy(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/policies/${id}`,
        legalPolicySingleResponse,
        client,
      )
      return data
    },
  })
}

export function getLegalPolicyVersionsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseLegalPolicyVersionsOptions,
) {
  const { enabled: _enabled = true, policyId } = options
  return queryOptions({
    queryKey: legalQueryKeys.policyVersions(policyId),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/policies/${policyId}/versions`,
        legalPolicyVersionListResponse,
        client,
      )
      return data
    },
  })
}

export function getLegalPolicyVersionQueryOptions(client: FetchWithValidationOptions, id: string) {
  return queryOptions({
    queryKey: [...legalQueryKeys.policies(), "version", id] as const,
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/policies/versions/${id}`,
        legalPolicyVersionSingleResponse,
        client,
      )
      return data
    },
  })
}

export function getLegalPolicyRulesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseLegalPolicyRulesOptions,
) {
  const { enabled: _enabled = true, versionId } = options
  return queryOptions({
    queryKey: legalQueryKeys.policyRules(versionId),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/policies/versions/${versionId}/rules`,
        legalPolicyRuleListResponse,
        client,
      )
      return data
    },
  })
}

export function getLegalPolicyAssignmentsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseLegalPolicyAssignmentsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: legalQueryKeys.policyAssignments(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/legal/policies/assignments${toQueryString(filters)}`,
        legalPolicyAssignmentListResponse,
        client,
      ),
  })
}

export function getLegalPolicyAcceptancesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseLegalPolicyAcceptancesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: legalQueryKeys.policyAcceptances(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/legal/policies/acceptances${toQueryString(filters)}`,
        legalPolicyAcceptanceListResponse,
        client,
      ),
  })
}

export function getLegalTermsQueryOptions(
  client: FetchWithValidationOptions,
  options: LegalTermsListFilters = {},
) {
  return queryOptions({
    queryKey: legalQueryKeys.termsList(options),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/legal/terms${toQueryString(options)}`,
        legalTermListResponse,
        client,
      ),
  })
}

export function getLegalTermQueryOptions(client: FetchWithValidationOptions, id: string) {
  return queryOptions({
    queryKey: legalQueryKeys.term(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/terms/${id}`,
        legalTermSingleResponse,
        client,
      )
      return data
    },
  })
}

export function getResolvePolicyQueryOptions(
  client: FetchWithValidationOptions,
  filters: ResolvePolicyFilters,
) {
  return queryOptions({
    queryKey: legalQueryKeys.resolvePolicy(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/legal/policies/resolve${toQueryString({ ...filters })}`,
        resolvedPolicyResponse,
        client,
      ),
  })
}
