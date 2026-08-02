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
  storefronts: () => [...authQueryKeys.all, "storefronts"] as const,
  storefrontCapabilities: () => [...authQueryKeys.storefronts(), "capabilities"] as const,
  storefrontList: () => [...authQueryKeys.storefronts(), "list"] as const,
  storefront: (storefrontId: string) =>
    [...authQueryKeys.storefronts(), "detail", storefrontId] as const,
  storefrontApiKeys: (storefrontId: string) =>
    [...authQueryKeys.storefront(storefrontId), "keys"] as const,
  storefrontProviderCredentials: (storefrontId: string) =>
    [...authQueryKeys.storefront(storefrontId), "provider-credentials"] as const,
  storefrontChannels: () => [...authQueryKeys.storefronts(), "channels"] as const,
  storefrontChannelBinding: (storefrontId: string) =>
    [...authQueryKeys.storefront(storefrontId), "channel-binding"] as const,
}
