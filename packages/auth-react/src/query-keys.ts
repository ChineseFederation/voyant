export interface OrganizationMembersListFilters {
  organizationId?: string
}

export interface OrganizationInvitationsListFilters {
  organizationId?: string
}

export interface ServiceApiKeysListFilters {
  configId?: string
  organizationId?: string
  limit?: number
  offset?: number
  sortBy?: string
  sortDirection?: "asc" | "desc"
}

export interface CustomerBusinessAccountRequestListFilters {
  status?: "pending" | "approved" | "rejected" | "canceled"
}

export const authQueryKeys = {
  all: ["auth"] as const,
  currentUser: () => [...authQueryKeys.all, "current-user"] as const,
  authStatus: () => [...authQueryKeys.all, "status"] as const,
  currentWorkspace: () => [...authQueryKeys.all, "current-workspace"] as const,
  organizationMembers: (filters: OrganizationMembersListFilters = {}) =>
    [...authQueryKeys.all, "organization-members", filters] as const,
  organizationInvitations: (filters: OrganizationInvitationsListFilters = {}) =>
    [...authQueryKeys.all, "organization-invitations", filters] as const,
  serviceApiKeys: (filters: ServiceApiKeysListFilters = {}) =>
    [...authQueryKeys.all, "service-api-keys", filters] as const,
  customerBusinessAccounts: () => [...authQueryKeys.all, "customer-business-accounts"] as const,
  customerBusinessAccountCapabilities: () =>
    [...authQueryKeys.customerBusinessAccounts(), "capabilities"] as const,
  customerBusinessAccountRequests: (filters: CustomerBusinessAccountRequestListFilters = {}) =>
    [...authQueryKeys.customerBusinessAccounts(), "requests", filters] as const,
  publicApi: () => [...authQueryKeys.all, "public-api"] as const,
  publicApiKeys: () => [...authQueryKeys.publicApi(), "keys"] as const,
  publicApiKey: (keyId: string) => [...authQueryKeys.publicApi(), "keys", keyId] as const,
  publicApiChannels: () => [...authQueryKeys.publicApi(), "channels"] as const,
  customerAccounts: () => [...authQueryKeys.all, "customer-accounts"] as const,
  customerAccountCapabilities: () => [...authQueryKeys.customerAccounts(), "capabilities"] as const,
  customerAccountSettings: () => [...authQueryKeys.customerAccounts(), "settings"] as const,
  customerAccountCredentials: () =>
    [...authQueryKeys.customerAccounts(), "provider-credentials"] as const,
}
