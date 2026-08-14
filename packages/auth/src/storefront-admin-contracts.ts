/**
 * Storefront admin API contracts (provider-neutral, pure zod).
 *
 * These mirror the DTOs on {@link storefrontRuntimePort} without importing the
 * DB schema, so the admin React client can validate responses and request
 * bodies without pulling server-only modules into the browser bundle. The
 * runtime adapter re-normalizes every write, so these are the transport
 * contract only.
 *
 * **Requests are closed; responses are open.** A request body is this
 * deployment's own vocabulary, so an unknown key there is a caller mistake
 * worth refusing. A response is the runtime provider's vocabulary — the
 * storefront runtime is a port, and a deployment can be backed by a control
 * plane on its own release cadence. Voyant Cloud's is: it serves managed
 * storefronts with an `organizationId` and mints `managed_portal` /
 * `managed_booking_engine` hosting kinds this package never sees.
 *
 * A `.strict()` response schema turns every such addition into a total
 * failure, because one unrecognized key rejects the object, one rejected
 * object rejects the array, and the storefronts page renders its error state
 * on a healthy 200 — indistinguishable from an outage, and retry cannot
 * recover it (voyant#4342). So response objects strip what they do not know
 * instead of refusing it, and consumers narrow with the operator-facing
 * schemas where the distinction matters.
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
 *
 * The same reasoning applies to the *fields* of a response, which is why the
 * response objects below are not `.strict()`.
 */
export const storefrontHostingKindSchema = z.string().min(1)
export const storefrontApiKeyKindSchema = z.enum(["publishable", "secret"])
export const storefrontSocialProviderSchema = z.enum(["google", "facebook", "apple"])

const storefrontCustomerAuthMethodsShape = {
  emailCode: z.boolean(),
  emailPassword: z.boolean(),
  google: z.boolean(),
  facebook: z.boolean(),
  apple: z.boolean(),
}

const storefrontCustomerAccountPolicyShape = {
  allowedKinds: z.array(z.enum(["personal", "business"])).min(1),
  personalSignup: z.enum(["open", "disabled"]),
  businessOnboarding: z.enum(["disabled", "open", "request", "invite-only"]),
}

/** Request contract: a write may only name methods this deployment knows. */
export const storefrontCustomerAuthMethodsSchema = z
  .object(storefrontCustomerAuthMethodsShape)
  .strict()

/** Request contract: a write may only name policy keys this deployment knows. */
export const storefrontCustomerAccountPolicySchema = z
  .object(storefrontCustomerAccountPolicyShape)
  .strict()

export const storefrontSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  hostingKind: storefrontHostingKindSchema,
  siteId: z.string().nullable(),
  allowedOrigins: z.array(z.string()),
  methods: z.object(storefrontCustomerAuthMethodsShape),
  accountPolicy: z.object(storefrontCustomerAccountPolicyShape),
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
      /**
       * True when nothing binds this storefront explicitly and it resolved to
       * the deployment's Direct channel. Optional so a client keeps parsing
       * responses from a runtime that predates the field.
       */
      implicit: z.boolean().optional(),
    })
    .nullable()
    .optional(),
})

export const storefrontApiKeySchema = z.object({
  id: z.string(),
  storefrontId: z.string(),
  kind: storefrontApiKeyKindSchema,
  tokenPreview: z.string(),
  name: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
})

/** Issuance/rotation payload: the plaintext token is present exactly once. */
export const issuedStorefrontApiKeySchema = storefrontApiKeySchema.extend({ token: z.string() })

export const storefrontProviderCredentialStatusSchema = z.object({
  provider: storefrontSocialProviderSchema,
  configured: z.boolean(),
  updatedAt: z.string().nullable(),
})

/**
 * Operator-facing capability signal. `businessAccounts` reflects whether the
 * deployment wires the customer business-account onboarding runtime; the
 * business buyer-account controls are disabled when it is false.
 */
export const storefrontAdminCapabilitiesSchema = z.object({
  businessAccounts: z.boolean(),
  manageProviders: z.boolean(),
  channelBinding: z.boolean(),
})

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
