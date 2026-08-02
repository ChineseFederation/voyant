/**
 * Storefront admin API contracts (provider-neutral, pure zod).
 *
 * These mirror the DTOs on {@link storefrontRuntimePort} without importing the
 * DB schema, so the admin React client can validate responses and request
 * bodies without pulling server-only modules into the browser bundle. Request
 * bodies are validated strictly against the literals this deployment accepts;
 * response fields whose vocabulary belongs to the runtime provider rather than
 * to this package stay open, so a control plane on its own release cadence can
 * add to them without breaking an older admin bundle. The runtime adapter
 * re-normalizes every write, so these are the transport contract only.
 */
import { z } from "zod"

/**
 * The hosting kinds an operator can pick when creating a storefront:
 * `cloud_site` (a first-party site whose origin is known from the linked site)
 * or `external` (anywhere else — third-party clouds, static hosts, localhost).
 */
export const operatorStorefrontHostingKindSchema = z.enum(["cloud_site", "external"])

/**
 * A hosting kind as it arrives on the wire, which is deliberately not the
 * operator enum above. The storefront runtime is a port: a deployment can be
 * backed by a control plane that owns hosting kinds this package never sees.
 * Voyant Cloud mints platform-owned `managed_portal` and
 * `managed_booking_engine` storefronts that way. Enumerating here would make
 * every such addition fail the whole list response — one unknown kind rejects
 * the array and the storefronts page renders its error state with a healthy
 * 200 on the wire. Consumers narrow with `operatorStorefrontHostingKindSchema`
 * where the distinction matters, and treat anything else as read-only hosting
 * they did not provision.
 */
export const storefrontHostingKindSchema = z.string().min(1)
export const storefrontApiKeyKindSchema = z.enum(["publishable", "secret"])
export const storefrontSocialProviderSchema = z.enum(["google", "facebook", "apple"])

export const storefrontCustomerAuthMethodsSchema = z
  .object({
    emailCode: z.boolean(),
    emailPassword: z.boolean(),
    google: z.boolean(),
    facebook: z.boolean(),
    apple: z.boolean(),
  })
  .strict()

export const storefrontCustomerAccountPolicySchema = z
  .object({
    allowedKinds: z.array(z.enum(["personal", "business"])).min(1),
    personalSignup: z.enum(["open", "disabled"]),
    businessOnboarding: z.enum(["disabled", "open", "request", "invite-only"]),
  })
  .strict()

export const storefrontSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    name: z.string(),
    slug: z.string(),
    hostingKind: storefrontHostingKindSchema,
    siteId: z.string().nullable(),
    allowedOrigins: z.array(z.string()),
    methods: storefrontCustomerAuthMethodsSchema,
    accountPolicy: storefrontCustomerAccountPolicySchema,
    hostOnlyCookies: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    channelBinding: z
      .object({
        storefrontId: z.string(),
        channelId: z.string(),
        channelName: z.string().nullable(),
        channelStatus: z.string(),
        createdAt: z.string().nullable(),
        updatedAt: z.string().nullable(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()

export const storefrontApiKeySchema = z
  .object({
    id: z.string(),
    storefrontId: z.string(),
    kind: storefrontApiKeyKindSchema,
    tokenPreview: z.string(),
    name: z.string().nullable(),
    lastUsedAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict()

/** Issuance/rotation payload: the plaintext token is present exactly once. */
export const issuedStorefrontApiKeySchema = storefrontApiKeySchema
  .extend({ token: z.string() })
  .strict()

export const storefrontProviderCredentialStatusSchema = z
  .object({
    provider: storefrontSocialProviderSchema,
    configured: z.boolean(),
    updatedAt: z.string().nullable(),
  })
  .strict()

/**
 * Operator-facing capability signal. `businessAccounts` reflects whether the
 * deployment wires the customer business-account onboarding runtime; the
 * business buyer-account controls are disabled when it is false.
 */
export const storefrontAdminCapabilitiesSchema = z
  .object({
    businessAccounts: z.boolean(),
    manageProviders: z.boolean(),
    channelBinding: z.boolean(),
  })
  .strict()

export const createStorefrontInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().min(1).max(120),
    hostingKind: operatorStorefrontHostingKindSchema,
    siteId: z.string().trim().min(1).nullable().optional(),
    allowedOrigins: z.array(z.string().trim().min(1)).default([]),
    methods: storefrontCustomerAuthMethodsSchema,
    accountPolicy: storefrontCustomerAccountPolicySchema.optional(),
  })
  .strict()

export const updateStorefrontInputSchema = z
  .object({ name: z.string().trim().min(1).max(200) })
  .strict()

export const setStorefrontAllowedOriginsInputSchema = z
  .object({ origins: z.array(z.string().trim().min(1)) })
  .strict()

export const issueStorefrontApiKeyInputSchema = z
  .object({
    kind: storefrontApiKeyKindSchema,
    name: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict()

export const updateStorefrontAccountPolicyInputSchema = storefrontCustomerAccountPolicySchema
export const updateStorefrontMethodsInputSchema = storefrontCustomerAuthMethodsSchema

export const setStorefrontChannelBindingInputSchema = z
  .object({ channelId: z.string().trim().min(1) })
  .strict()

export const putStorefrontProviderCredentialInputSchema = z
  .object({
    clientId: z.string().trim().min(1).max(16_384),
    clientSecret: z.string().trim().min(1).max(16_384),
  })
  .strict()

export type OperatorStorefrontHostingKind = z.infer<typeof operatorStorefrontHostingKindSchema>
export type StorefrontHostingKind = z.infer<typeof storefrontHostingKindSchema>
export type StorefrontApiKeyKind = z.infer<typeof storefrontApiKeyKindSchema>
export type StorefrontSocialProvider = z.infer<typeof storefrontSocialProviderSchema>
export type StorefrontCustomerAuthMethods = z.infer<typeof storefrontCustomerAuthMethodsSchema>
export type StorefrontCustomerAccountPolicy = z.infer<typeof storefrontCustomerAccountPolicySchema>
export type StorefrontDto = z.infer<typeof storefrontSchema>
export type StorefrontApiKeyDto = z.infer<typeof storefrontApiKeySchema>
export type IssuedStorefrontApiKeyDto = z.infer<typeof issuedStorefrontApiKeySchema>
export type StorefrontProviderCredentialStatusDto = z.infer<
  typeof storefrontProviderCredentialStatusSchema
>
export type StorefrontAdminCapabilitiesDto = z.infer<typeof storefrontAdminCapabilitiesSchema>
export type CreateStorefrontInput = z.infer<typeof createStorefrontInputSchema>
export type UpdateStorefrontInput = z.infer<typeof updateStorefrontInputSchema>
export type SetStorefrontAllowedOriginsInput = z.infer<
  typeof setStorefrontAllowedOriginsInputSchema
>
export type IssueStorefrontApiKeyInput = z.infer<typeof issueStorefrontApiKeyInputSchema>
export type PutStorefrontProviderCredentialInput = z.infer<
  typeof putStorefrontProviderCredentialInputSchema
>
