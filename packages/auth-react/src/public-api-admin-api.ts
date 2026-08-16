import { queryOptions } from "@tanstack/react-query"
import {
  customerAccountCredentialStatusSchema,
  customerAccountSettingsSchema,
  issuedPublicApiKeySchema,
  publicApiKeyWithChannelSchema,
} from "@voyant-travel/auth/public-api-admin-contracts"
import { z } from "zod"

import { fetchWithValidation, type VoyantFetcher } from "./client.js"
import { authQueryKeys } from "./query-keys.js"

/**
 * Response envelopes are open for the same reason the DTOs they wrap are: the
 * public API runtime is a port, and the control plane behind it ships on its
 * own cadence. A `.strict()` envelope makes one added field fail the whole
 * request, and the page reports a healthy 200 as an outage (voyant#4342).
 */
const keysResponseSchema = z.object({ data: z.array(publicApiKeyWithChannelSchema) })
const keyResponseSchema = z.object({ data: publicApiKeyWithChannelSchema })
const issuedKeyResponseSchema = z.object({ data: issuedPublicApiKeySchema })
const settingsResponseSchema = z.object({ data: customerAccountSettingsSchema })
const capabilitiesResponseSchema = z.object({
  data: z.object({ businessAccounts: z.boolean() }),
})
const providerCredentialsResponseSchema = z.object({
  data: z.array(customerAccountCredentialStatusSchema),
})
const distributionChannelOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(["active", "inactive", "pending", "archived"]),
  })
  .passthrough()
const distributionChannelsResponseSchema = z.object({
  data: z.array(distributionChannelOptionSchema),
  total: z.number().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
})

const PUBLIC_API_BASE = "/v1/admin/public-api-keys"
const CUSTOMER_ACCOUNTS_BASE = "/v1/admin/customer-accounts"
const keyPath = (id: string) => `${PUBLIC_API_BASE}/keys/${encodeURIComponent(id)}`

export type PublicApiKey = z.infer<typeof publicApiKeyWithChannelSchema>
export type IssuedPublicApiKey = z.infer<typeof issuedPublicApiKeySchema>
export type CustomerAccountSettings = z.infer<typeof customerAccountSettingsSchema>
export type CustomerAccountCredentialStatus = z.infer<typeof customerAccountCredentialStatusSchema>
export type PublicApiChannelOption = z.infer<typeof distributionChannelOptionSchema>
export type CustomerSocialProvider = "google" | "facebook" | "apple"

export interface IssuePublicApiKeyInput {
  kind: "publishable" | "secret"
  name?: string | null
  allowedOrigins?: string[]
  channelId?: string | null
  hostOnlyCookies?: boolean
  scopes?: Record<string, string[]> | null
}

export interface UpdatePublicApiKeyInput {
  name?: string | null
  allowedOrigins?: string[]
  channelId?: string | null
  hostOnlyCookies?: boolean
  scopes?: Record<string, string[]> | null
}

export interface PublicApiAdminApi {
  listKeys: () => Promise<PublicApiKey[]>
  getKey: (keyId: string) => Promise<PublicApiKey>
  issueKey: (input: IssuePublicApiKeyInput) => Promise<IssuedPublicApiKey>
  updateKey: (keyId: string, input: UpdatePublicApiKeyInput) => Promise<PublicApiKey>
  rotateKey: (keyId: string) => Promise<IssuedPublicApiKey>
  revokeKey: (keyId: string) => Promise<void>
  listChannels: () => Promise<PublicApiChannelOption[]>
}

export interface CustomerAccountsAdminApi {
  getCapabilities: () => Promise<{ businessAccounts: boolean }>
  getSettings: () => Promise<CustomerAccountSettings>
  updateMethods: (methods: CustomerAccountSettings["methods"]) => Promise<CustomerAccountSettings>
  updateAccountPolicy: (
    accountPolicy: CustomerAccountSettings["accountPolicy"],
  ) => Promise<CustomerAccountSettings>
  listProviderCredentials: () => Promise<CustomerAccountCredentialStatus[]>
  putProviderCredential: (
    provider: CustomerSocialProvider,
    credentials: Record<string, unknown>,
  ) => Promise<void>
  deleteProviderCredential: (provider: CustomerSocialProvider) => Promise<void>
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  credentials: "include",
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

export function createPublicApiAdminApi(
  baseUrl: string,
  fetcher: VoyantFetcher,
): PublicApiAdminApi {
  const options = { baseUrl, fetcher }
  return {
    async listKeys() {
      return (
        await fetchWithValidation(
          `${PUBLIC_API_BASE}/keys`,
          keysResponseSchema,
          options,
          json("GET"),
        )
      ).data
    },
    async getKey(keyId) {
      return (await fetchWithValidation(keyPath(keyId), keyResponseSchema, options, json("GET")))
        .data
    },
    async issueKey(input) {
      return (
        await fetchWithValidation(
          `${PUBLIC_API_BASE}/keys`,
          issuedKeyResponseSchema,
          options,
          json("POST", input),
        )
      ).data
    },
    async updateKey(keyId, input) {
      return (
        await fetchWithValidation(keyPath(keyId), keyResponseSchema, options, json("PATCH", input))
      ).data
    },
    async rotateKey(keyId) {
      return (
        await fetchWithValidation(
          `${keyPath(keyId)}/rotate`,
          issuedKeyResponseSchema,
          options,
          json("POST"),
        )
      ).data
    },
    async revokeKey(keyId) {
      await fetchWithValidation(keyPath(keyId), z.undefined(), options, json("DELETE"))
    },
    async listChannels() {
      return (
        await fetchWithValidation(
          "/v1/admin/distribution/channels?limit=200&system=exclude",
          distributionChannelsResponseSchema,
          options,
          json("GET"),
        )
      ).data
    },
  }
}

export function createCustomerAccountsAdminApi(
  baseUrl: string,
  fetcher: VoyantFetcher,
): CustomerAccountsAdminApi {
  const options = { baseUrl, fetcher }
  return {
    async getCapabilities() {
      return (
        await fetchWithValidation(
          `${CUSTOMER_ACCOUNTS_BASE}/capabilities`,
          capabilitiesResponseSchema,
          options,
          json("GET"),
        )
      ).data
    },
    async getSettings() {
      return (
        await fetchWithValidation(
          `${CUSTOMER_ACCOUNTS_BASE}/settings`,
          settingsResponseSchema,
          options,
          json("GET"),
        )
      ).data
    },
    async updateMethods(methods) {
      return (
        await fetchWithValidation(
          `${CUSTOMER_ACCOUNTS_BASE}/settings/methods`,
          settingsResponseSchema,
          options,
          json("PUT", { methods }),
        )
      ).data
    },
    async updateAccountPolicy(accountPolicy) {
      return (
        await fetchWithValidation(
          `${CUSTOMER_ACCOUNTS_BASE}/settings/account-policy`,
          settingsResponseSchema,
          options,
          json("PUT", { accountPolicy }),
        )
      ).data
    },
    async listProviderCredentials() {
      return (
        await fetchWithValidation(
          `${CUSTOMER_ACCOUNTS_BASE}/provider-credentials`,
          providerCredentialsResponseSchema,
          options,
          json("GET"),
        )
      ).data
    },
    async putProviderCredential(provider, credentials) {
      await fetchWithValidation(
        `${CUSTOMER_ACCOUNTS_BASE}/provider-credentials/${provider}`,
        z.undefined(),
        options,
        json("PUT", { credentials }),
      )
    },
    async deleteProviderCredential(provider) {
      await fetchWithValidation(
        `${CUSTOMER_ACCOUNTS_BASE}/provider-credentials/${provider}`,
        z.undefined(),
        options,
        json("DELETE"),
      )
    },
  }
}

export const publicApiKeysQueryOptions = (api: PublicApiAdminApi) =>
  queryOptions({ queryKey: authQueryKeys.publicApiKeys(), queryFn: () => api.listKeys() })

export const publicApiChannelsQueryOptions = (api: PublicApiAdminApi) =>
  queryOptions({ queryKey: authQueryKeys.publicApiChannels(), queryFn: () => api.listChannels() })

export const customerAccountCapabilitiesQueryOptions = (api: CustomerAccountsAdminApi) =>
  queryOptions({
    queryKey: authQueryKeys.customerAccountCapabilities(),
    queryFn: () => api.getCapabilities(),
  })

export const customerAccountSettingsQueryOptions = (api: CustomerAccountsAdminApi) =>
  queryOptions({
    queryKey: authQueryKeys.customerAccountSettings(),
    queryFn: () => api.getSettings(),
  })

export const customerAccountCredentialsQueryOptions = (api: CustomerAccountsAdminApi) =>
  queryOptions({
    queryKey: authQueryKeys.customerAccountCredentials(),
    queryFn: () => api.listProviderCredentials(),
  })
