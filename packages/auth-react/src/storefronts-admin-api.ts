import { queryOptions } from "@tanstack/react-query"
import {
  type CreateStorefrontInput,
  type IssuedStorefrontApiKeyDto,
  type IssueStorefrontApiKeyInput,
  issuedStorefrontApiKeySchema,
  type PutStorefrontProviderCredentialInput,
  type StorefrontAdminCapabilitiesDto,
  type StorefrontApiKeyDto,
  type StorefrontCustomerAccountPolicy,
  type StorefrontCustomerAuthMethods,
  type StorefrontDto,
  type StorefrontProviderCredentialStatusDto,
  type StorefrontSocialProvider,
  storefrontAdminCapabilitiesSchema,
  storefrontApiKeySchema,
  storefrontProviderCredentialStatusSchema,
  storefrontSchema,
} from "@voyant-travel/auth/storefront-admin-contracts"
import { z } from "zod"

import { fetchWithValidation, type VoyantFetcher } from "./client.js"
import { authQueryKeys } from "./query-keys.js"

const capabilitiesResponseSchema = z.object({ data: storefrontAdminCapabilitiesSchema }).strict()
const storefrontsResponseSchema = z.object({ data: z.array(storefrontSchema) }).strict()
const storefrontResponseSchema = z.object({ data: storefrontSchema }).strict()
const storefrontChannelBindingSchema = z
  .object({
    storefrontId: z.string(),
    channelId: z.string(),
    channelName: z.string().nullable(),
    channelStatus: z.string(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
  })
  .strict()
const storefrontChannelBindingResponseSchema = z
  .object({ data: storefrontChannelBindingSchema.nullable() })
  .strict()
const distributionChannelOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(["active", "inactive", "pending", "archived"]),
  })
  .passthrough()
const distributionChannelsResponseSchema = z
  .object({
    data: z.array(distributionChannelOptionSchema),
    total: z.number().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })
  .strict()
const apiKeysResponseSchema = z.object({ data: z.array(storefrontApiKeySchema) }).strict()
const issuedKeyResponseSchema = z.object({ data: issuedStorefrontApiKeySchema }).strict()
const providerCredentialsResponseSchema = z
  .object({ data: z.array(storefrontProviderCredentialStatusSchema) })
  .strict()

const BASE = "/v1/admin/storefronts"
const storefrontPath = (id: string) => `${BASE}/storefronts/${encodeURIComponent(id)}`

export type StorefrontChannelBindingDto = NonNullable<StorefrontDto["channelBinding"]>
export type StorefrontChannelOption = z.infer<typeof distributionChannelOptionSchema>

export interface StorefrontsAdminApi {
  getCapabilities: () => Promise<StorefrontAdminCapabilitiesDto>
  listStorefronts: () => Promise<StorefrontDto[]>
  getStorefront: (storefrontId: string) => Promise<StorefrontDto>
  createStorefront: (input: CreateStorefrontInput) => Promise<StorefrontDto>
  updateStorefront: (storefrontId: string, input: { name: string }) => Promise<StorefrontDto>
  deleteStorefront: (storefrontId: string) => Promise<void>
  setAllowedOrigins: (storefrontId: string, origins: string[]) => Promise<StorefrontDto>
  listChannels: () => Promise<StorefrontChannelOption[]>
  getChannelBinding: (storefrontId: string) => Promise<StorefrontChannelBindingDto | null>
  setChannelBinding: (
    storefrontId: string,
    input: { channelId: string },
  ) => Promise<StorefrontChannelBindingDto>
  clearChannelBinding: (storefrontId: string) => Promise<void>
  listApiKeys: (storefrontId: string) => Promise<StorefrontApiKeyDto[]>
  issueApiKey: (
    storefrontId: string,
    input: IssueStorefrontApiKeyInput,
  ) => Promise<IssuedStorefrontApiKeyDto>
  rotateApiKey: (storefrontId: string, keyId: string) => Promise<IssuedStorefrontApiKeyDto>
  revokeApiKey: (storefrontId: string, keyId: string) => Promise<void>
  updateAccountPolicy: (
    storefrontId: string,
    policy: StorefrontCustomerAccountPolicy,
  ) => Promise<StorefrontDto>
  updateMethods: (
    storefrontId: string,
    methods: StorefrontCustomerAuthMethods,
  ) => Promise<StorefrontDto>
  listProviderCredentials: (
    storefrontId: string,
  ) => Promise<StorefrontProviderCredentialStatusDto[]>
  putProviderCredential: (
    storefrontId: string,
    provider: StorefrontSocialProvider,
    input: PutStorefrontProviderCredentialInput,
  ) => Promise<void>
  deleteProviderCredential: (
    storefrontId: string,
    provider: StorefrontSocialProvider,
  ) => Promise<void>
}

export function createStorefrontsAdminApi(
  baseUrl: string,
  fetcher: VoyantFetcher,
): StorefrontsAdminApi {
  const options = { baseUrl, fetcher }
  const json = (method: string, body?: unknown): RequestInit => ({
    method,
    credentials: "include",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  return {
    async getCapabilities() {
      return (
        await fetchWithValidation(
          `${BASE}/capabilities`,
          capabilitiesResponseSchema,
          options,
          json("GET"),
        )
      ).data
    },
    async listStorefronts() {
      return (
        await fetchWithValidation(
          `${BASE}/storefronts`,
          storefrontsResponseSchema,
          options,
          json("GET"),
        )
      ).data
    },
    async getStorefront(storefrontId) {
      return (
        await fetchWithValidation(
          storefrontPath(storefrontId),
          storefrontResponseSchema,
          options,
          json("GET"),
        )
      ).data
    },
    async createStorefront(input) {
      return (
        await fetchWithValidation(
          `${BASE}/storefronts`,
          storefrontResponseSchema,
          options,
          json("POST", input),
        )
      ).data
    },
    async updateStorefront(storefrontId, input) {
      return (
        await fetchWithValidation(
          storefrontPath(storefrontId),
          storefrontResponseSchema,
          options,
          json("PATCH", input),
        )
      ).data
    },
    async deleteStorefront(storefrontId) {
      await fetchWithValidation(
        storefrontPath(storefrontId),
        z.undefined(),
        options,
        json("DELETE"),
      )
    },
    async setAllowedOrigins(storefrontId, origins) {
      return (
        await fetchWithValidation(
          `${storefrontPath(storefrontId)}/allowed-origins`,
          storefrontResponseSchema,
          options,
          json("PUT", { origins }),
        )
      ).data
    },
    async listChannels() {
      return (
        await fetchWithValidation(
          "/v1/admin/distribution/channels?limit=200",
          distributionChannelsResponseSchema,
          options,
          json("GET"),
        )
      ).data
    },
    async getChannelBinding(storefrontId) {
      return (
        await fetchWithValidation(
          `${storefrontPath(storefrontId)}/channel-binding`,
          storefrontChannelBindingResponseSchema,
          options,
          json("GET"),
        )
      ).data
    },
    async setChannelBinding(storefrontId, input) {
      return (
        await fetchWithValidation(
          `${storefrontPath(storefrontId)}/channel-binding`,
          z.object({ data: storefrontChannelBindingSchema }).strict(),
          options,
          json("PUT", input),
        )
      ).data
    },
    async clearChannelBinding(storefrontId) {
      await fetchWithValidation(
        `${storefrontPath(storefrontId)}/channel-binding`,
        z.undefined(),
        options,
        json("DELETE"),
      )
    },
    async listApiKeys(storefrontId) {
      return (
        await fetchWithValidation(
          `${storefrontPath(storefrontId)}/keys`,
          apiKeysResponseSchema,
          options,
          json("GET"),
        )
      ).data
    },
    async issueApiKey(storefrontId, input) {
      return (
        await fetchWithValidation(
          `${storefrontPath(storefrontId)}/keys`,
          issuedKeyResponseSchema,
          options,
          json("POST", input),
        )
      ).data
    },
    async rotateApiKey(storefrontId, keyId) {
      return (
        await fetchWithValidation(
          `${storefrontPath(storefrontId)}/keys/${encodeURIComponent(keyId)}/rotate`,
          issuedKeyResponseSchema,
          options,
          json("POST"),
        )
      ).data
    },
    async revokeApiKey(storefrontId, keyId) {
      await fetchWithValidation(
        `${storefrontPath(storefrontId)}/keys/${encodeURIComponent(keyId)}`,
        z.undefined(),
        options,
        json("DELETE"),
      )
    },
    async updateAccountPolicy(storefrontId, policy) {
      return (
        await fetchWithValidation(
          `${storefrontPath(storefrontId)}/account-policy`,
          storefrontResponseSchema,
          options,
          json("PUT", policy),
        )
      ).data
    },
    async updateMethods(storefrontId, methods) {
      return (
        await fetchWithValidation(
          `${storefrontPath(storefrontId)}/methods`,
          storefrontResponseSchema,
          options,
          json("PUT", methods),
        )
      ).data
    },
    async listProviderCredentials(storefrontId) {
      return (
        await fetchWithValidation(
          `${storefrontPath(storefrontId)}/provider-credentials`,
          providerCredentialsResponseSchema,
          options,
          json("GET"),
        )
      ).data
    },
    async putProviderCredential(storefrontId, provider, input) {
      await fetchWithValidation(
        `${storefrontPath(storefrontId)}/provider-credentials/${encodeURIComponent(provider)}`,
        z.undefined(),
        options,
        json("PUT", input),
      )
    },
    async deleteProviderCredential(storefrontId, provider) {
      await fetchWithValidation(
        `${storefrontPath(storefrontId)}/provider-credentials/${encodeURIComponent(provider)}`,
        z.undefined(),
        options,
        json("DELETE"),
      )
    },
  }
}

export const storefrontCapabilitiesQueryOptions = (api: StorefrontsAdminApi) =>
  queryOptions({
    queryKey: authQueryKeys.storefrontCapabilities(),
    queryFn: () => api.getCapabilities(),
  })

export const storefrontListQueryOptions = (api: StorefrontsAdminApi) =>
  queryOptions({
    queryKey: authQueryKeys.storefrontList(),
    queryFn: () => api.listStorefronts(),
  })

export const storefrontChannelsQueryOptions = (api: StorefrontsAdminApi) =>
  queryOptions({
    queryKey: authQueryKeys.storefrontChannels(),
    queryFn: () => api.listChannels(),
  })

export const storefrontChannelBindingQueryOptions = (
  api: StorefrontsAdminApi,
  storefrontId: string,
) =>
  queryOptions({
    queryKey: authQueryKeys.storefrontChannelBinding(storefrontId),
    queryFn: () => api.getChannelBinding(storefrontId),
  })

export const storefrontApiKeysQueryOptions = (api: StorefrontsAdminApi, storefrontId: string) =>
  queryOptions({
    queryKey: authQueryKeys.storefrontApiKeys(storefrontId),
    queryFn: () => api.listApiKeys(storefrontId),
  })

export const storefrontProviderCredentialsQueryOptions = (
  api: StorefrontsAdminApi,
  storefrontId: string,
) =>
  queryOptions({
    queryKey: authQueryKeys.storefrontProviderCredentials(storefrontId),
    queryFn: () => api.listProviderCredentials(storefrontId),
  })
