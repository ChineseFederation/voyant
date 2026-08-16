/**
 * Public API + customer accounts admin contracts (provider-neutral, pure zod).
 *
 * These mirror the DTOs on {@link publicApiRuntimePort} without importing the
 * DB schema, so the admin React client can validate responses and request
 * bodies without pulling server-only modules into the browser bundle. The
 * runtime adapter re-normalizes every write, so these are the transport
 * contract only.
 *
 * **Requests are closed; responses are open.** A request body is this
 * deployment's own vocabulary, so an unknown key there is a caller mistake
 * worth refusing. A response is the runtime provider's vocabulary — the public
 * API runtime is a port, and a deployment can be backed by a control plane on
 * its own release cadence.
 *
 * A `.strict()` response schema turns every such addition into a total failure,
 * because one unrecognized key rejects the object, one rejected object rejects
 * the array, and the page renders its error state on a healthy 200 —
 * indistinguishable from an outage, and retry cannot recover it (voyant#4342).
 * So response objects strip what they do not know instead of refusing it.
 */
import { z } from "zod"

export const publicApiKeyKindSchema = z.enum(["publishable", "secret"])
export const customerSocialProviderSchema = z.enum(["google", "facebook", "apple"])

const customerAuthMethodsShape = {
  emailCode: z.boolean(),
  emailPassword: z.boolean(),
  google: z.boolean(),
  facebook: z.boolean(),
  apple: z.boolean(),
}

const customerAccountPolicyShape = {
  allowedKinds: z.array(z.enum(["personal", "business"])).min(1),
  personalSignup: z.enum(["open", "disabled"]),
  businessOnboarding: z.enum(["disabled", "open", "request", "invite-only"]),
}

/** Request contract: a write may only name methods this deployment knows. */
export const customerAuthMethodsSchema = z.object(customerAuthMethodsShape).strict()

/** Request contract: a write may only name policy keys this deployment knows. */
export const customerAccountPolicySchema = z.object(customerAccountPolicyShape).strict()

/** Scope grant shape: `{ resource: [action, ...] }`, same as `apikey.permissions`. */
export const publicApiKeyScopesSchema = z.record(z.string(), z.array(z.string()))

/** Response: open by construction — see the module docblock. */
export const publicApiKeySchema = z.object({
  id: z.string(),
  kind: z.string().min(1),
  scopes: publicApiKeyScopesSchema.nullable(),
  tokenPreview: z.string(),
  name: z.string().nullable(),
  allowedOrigins: z.array(z.string()),
  channelId: z.string().nullable(),
  hostOnlyCookies: z.boolean(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * The channel a key resolved to, projected next to it for the admin list.
 * `implicit` distinguishes "the operator chose this channel" from "this is the
 * Direct default", so clearing a channel reads as "back to Direct" rather than
 * as "breaks the public API".
 */
export const resolvedPublicApiChannelSchema = z.object({
  channelId: z.string(),
  channelName: z.string().nullable(),
  channelStatus: z.string(),
  implicit: z.boolean(),
})

export const publicApiKeyWithChannelSchema = publicApiKeySchema.extend({
  channel: resolvedPublicApiChannelSchema.nullable().optional(),
})

/** Issuance/rotation response: the plaintext token appears exactly once. */
export const issuedPublicApiKeySchema = publicApiKeySchema.extend({ token: z.string() })

export const customerAccountSettingsSchema = z.object({
  methods: z.object(customerAuthMethodsShape),
  accountPolicy: z.object(customerAccountPolicyShape),
  updatedAt: z.string(),
})

export const customerAccountCredentialStatusSchema = z.object({
  provider: z.string().min(1),
  configured: z.boolean(),
  updatedAt: z.string().nullable(),
})

/**
 * A declared allowed origin: an exact origin, or a single-label
 * `https://*.host` wildcard. Validated properly by
 * `normalizePublicApiAllowedOrigins`; this only rejects the obviously wrong.
 */
const allowedOriginSchema = z.string().min(1).max(255)

export const issuePublicApiKeyInputSchema = z
  .object({
    kind: publicApiKeyKindSchema,
    name: z.string().min(1).max(120).nullish(),
    allowedOrigins: z.array(allowedOriginSchema).max(50).optional(),
    channelId: z.string().min(1).nullish(),
    hostOnlyCookies: z.boolean().optional(),
    scopes: publicApiKeyScopesSchema.nullish(),
  })
  .strict()

export const updatePublicApiKeyInputSchema = z
  .object({
    name: z.string().min(1).max(120).nullish(),
    allowedOrigins: z.array(allowedOriginSchema).max(50).optional(),
    channelId: z.string().min(1).nullish(),
    hostOnlyCookies: z.boolean().optional(),
    scopes: publicApiKeyScopesSchema.nullish(),
  })
  .strict()

export const updateCustomerAuthMethodsInputSchema = z
  .object({ methods: customerAuthMethodsSchema })
  .strict()

export const updateCustomerAccountPolicyInputSchema = z
  .object({ accountPolicy: customerAccountPolicySchema })
  .strict()

export const putCustomerProviderCredentialInputSchema = z
  .object({ credentials: z.record(z.string(), z.unknown()) })
  .strict()

export type PublicApiKeyResponse = z.infer<typeof publicApiKeySchema>
export type PublicApiKeyWithChannelResponse = z.infer<typeof publicApiKeyWithChannelSchema>
export type IssuedPublicApiKeyResponse = z.infer<typeof issuedPublicApiKeySchema>
export type CustomerAccountSettingsResponse = z.infer<typeof customerAccountSettingsSchema>
export type CustomerAccountCredentialStatusResponse = z.infer<
  typeof customerAccountCredentialStatusSchema
>
