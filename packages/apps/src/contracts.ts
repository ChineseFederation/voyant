import { httpsUrlSchema, scopeSchema } from "@voyant-travel/app-manifest/primitives"
import { z } from "zod"

/**
 * The manifest contract itself lives in `@voyant-travel/app-manifest` so that
 * app publishers can validate a release without this host-side runtime module.
 * It is re-exported here because the host reads the same schema when admitting
 * a release, and because existing `@voyant-travel/apps/contracts` consumers
 * import it from this path.
 */
export {
  APP_ADMIN_EXTENSION_SLOTS,
  APP_MANIFEST_SCHEMA_VERSION,
  type AppManifest,
  appManifestSchema,
  appOwnedCustomFieldDeclarationSchema,
  manifestDisallowedKeySchema,
} from "@voyant-travel/app-manifest/contracts"

export const createCustomAppRegistrationSchema = z
  .object({
    ownerId: z.string().trim().min(1).max(160),
    displayName: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/),
    redirectUris: z.array(httpsUrlSchema).default([]),
    createdBy: z.string().trim().min(1).max(160),
  })
  .strict()

export const releaseManifestUploadSchema = z
  .object({
    manifest: z.unknown(),
    createdBy: z.string().trim().min(1).max(160),
    provenance: z.record(z.string(), z.unknown()).default({ source: "admin-upload" }),
  })
  .strict()

export const releaseManifestFetchSchema = z
  .object({
    manifestUrl: httpsUrlSchema,
    createdBy: z.string().trim().min(1).max(160),
  })
  .strict()

export const appListQuerySchema = z.object({
  ownerId: z.string().trim().min(1).optional(),
  distribution: z.enum(["custom", "marketplace"]).optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
})

const appInstallationStatusValues = [
  "pending",
  "authorizing",
  "active",
  "paused",
  "degraded",
  "revoked",
  "uninstalled",
] as const

const appInstallationUpdatePolicyValues = ["manual", "compatible", "patch", "pinned"] as const

export const appInstallationListQuerySchema = z.object({
  appId: z.string().trim().min(1).optional(),
  status: z.enum(appInstallationStatusValues).optional(),
  deploymentId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
})

export const appInstallationAuditQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
})

export const installAppSchema = z
  .object({
    appId: z.string().trim().min(1),
    releaseId: z.string().trim().min(1),
    actorId: z.string().trim().min(1).max(160),
    grantedOptionalScopes: z.array(scopeSchema).optional(),
    updatePolicy: z.enum(appInstallationUpdatePolicyValues).optional(),
    deploymentId: z.string().trim().min(1).optional(),
  })
  .strict()

export const lifecycleActionBodySchema = z
  .object({
    actorId: z.string().trim().min(1).max(160),
  })
  .strict()

export const activateInstallationBodySchema = z
  .object({
    releaseId: z.string().trim().min(1),
    actorId: z.string().trim().min(1).max(160),
    grantedRequiredScopes: z.array(scopeSchema).optional(),
    grantedOptionalScopes: z.array(scopeSchema).optional(),
    updatePolicy: z.enum(appInstallationUpdatePolicyValues).optional(),
  })
  .strict()

export const appWebhookReplaySchema = z
  .object({
    deliveryId: z.string().trim().min(1),
    actorId: z.string().trim().min(1).max(160),
  })
  .strict()

export const appOAuthAuthorizeQuerySchema = z
  .object({
    response_type: z.literal("code"),
    client_id: z.string().trim().min(1),
    release_id: z.string().trim().min(1),
    redirect_uri: z.string().url(),
    state: z.string().trim().min(1),
    /** Optional app-generated ceremony binding echoed to the redirect URI. */
    nonce: z.string().trim().min(43).max(128).optional(),
    code_challenge: z.string().trim().min(1),
    code_challenge_method: z.literal("S256"),
    /** Deprecated input; the route derives the actor from the staff session. */
    actor_id: z.string().trim().min(1).optional(),
    /** Deprecated input; the route derives the grant ceiling from staff scopes. */
    operator_scopes: z.string().trim().default(""),
    optional_scopes: z.string().trim().default(""),
  })
  .strict()

export const appOAuthTokenSchema = z
  .discriminatedUnion("grant_type", [
    z.object({
      grant_type: z.literal("authorization_code"),
      code: z.string().trim().min(1),
      redirect_uri: z.string().url(),
      code_verifier: z.string().trim().min(43).max(128),
      client_id: z.string().trim().min(1),
      client_secret: z.string().trim().optional(),
    }),
    z.object({
      grant_type: z.literal("refresh_token"),
      refresh_token: z.string().trim().min(1),
      client_id: z.string().trim().min(1),
      client_secret: z.string().trim().optional(),
    }),
  ])
  .transform((input) => ({
    ...input,
    client_secret: input.client_secret?.trim() || undefined,
  }))

export const appCredentialRevocationSchema = z
  .object({
    installationId: z.string().trim().min(1),
    actorId: z.string().trim().min(1),
  })
  .strict()

const sessionTokenEntitySchema = z
  .object({
    type: z.string().trim().min(1).max(80),
    id: z.string().trim().min(1).max(200),
  })
  .strict()

export const appSessionTokenIssueSchema = z
  .object({
    entity: sessionTokenEntitySchema.optional(),
    slot: z.string().trim().min(1).max(80).optional(),
  })
  .strict()

export const appSessionTokenExchangeSchema = z
  .object({
    session_token: z.string().trim().min(1),
    client_id: z.string().trim().min(1),
    client_secret: z.string().trim().optional(),
    viewer_scopes: z.array(scopeSchema).default([]),
    contextual_scopes: z.array(scopeSchema).optional(),
  })
  .strict()
  .transform((input) => ({
    ...input,
    client_secret: input.client_secret?.trim() || undefined,
  }))

export type CreateCustomAppRegistrationInput = z.infer<typeof createCustomAppRegistrationSchema>
export type ReleaseManifestUploadInput = z.infer<typeof releaseManifestUploadSchema>
export type ReleaseManifestFetchInput = z.infer<typeof releaseManifestFetchSchema>
export type AppListQuery = z.infer<typeof appListQuerySchema>
export type AppInstallationListQuery = z.infer<typeof appInstallationListQuerySchema>
export type AppInstallationAuditQuery = z.infer<typeof appInstallationAuditQuerySchema>
export type InstallAppRequest = z.infer<typeof installAppSchema>
export type LifecycleActionBody = z.infer<typeof lifecycleActionBodySchema>
export type ActivateInstallationBody = z.infer<typeof activateInstallationBodySchema>
export type AppWebhookReplayInput = z.infer<typeof appWebhookReplaySchema>
export type AppOAuthAuthorizeQuery = z.infer<typeof appOAuthAuthorizeQuerySchema>
export type AppOAuthTokenInput = z.infer<typeof appOAuthTokenSchema>
export type AppSessionTokenIssueInput = z.infer<typeof appSessionTokenIssueSchema>
export type AppSessionTokenExchangeInput = z.infer<typeof appSessionTokenExchangeSchema>
