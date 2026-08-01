import { ADMIN_UI_EXTENSION_SLOTS } from "@voyant-travel/admin-extension-sdk/types"
import { customFieldDefinitionInputSchema } from "@voyant-travel/custom-fields/contracts"
import { assertOutboundWebhookEndpointUrl } from "@voyant-travel/webhook-delivery"
import { z } from "zod"

export const APP_MANIFEST_SCHEMA_VERSION = "voyant.app-manifest.v1" as const

/**
 * What a published manifest may target, taken from the contract package rather
 * than restated here. A manifest that validates must be renderable by the
 * shell, so the schema and the host have to read one list.
 */
export const APP_ADMIN_EXTENSION_SLOTS = ADMIN_UI_EXTENSION_SLOTS

const disallowedManifestKeys = {
  schemas: "Database schemas are deployment-package authority and cannot appear in app manifests.",
  migrations:
    "Database migrations are deployment-package authority and cannot appear in app manifests.",
  hostRoutes: "Host routes cannot be declared by remote app manifests.",
  routes: "Host routes cannot be declared by remote app manifests.",
  runtimeFactories: "Runtime factories cannot be declared by remote app manifests.",
  subscribers: "Subscribers cannot be declared by remote app manifests.",
  providers: "Infrastructure providers cannot be declared by remote app manifests.",
  scripts: "Package or lifecycle scripts are forbidden in app release manifests.",
  dependencies: "Dependency declarations are forbidden in app release manifests.",
  optionalDependencies: "Dependency declarations are forbidden in app release manifests.",
  peerDependencies: "Dependency declarations are forbidden in app release manifests.",
  bundledDependencies: "Dependency declarations are forbidden in app release manifests.",
  binaries: "Binary declarations are forbidden in app release manifests.",
  bin: "Binary declarations are forbidden in app release manifests.",
  exports: "Executable package exports are forbidden in app release manifests.",
  files: "Undeclared file inventories are forbidden in app release manifests.",
} as const

export const manifestDisallowedKeySchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, context) => {
    for (const [key, message] of Object.entries(disallowedManifestKeys)) {
      if (Object.hasOwn(value, key)) {
        context.addIssue({
          code: "custom",
          path: [key],
          message,
        })
      }
    }
  })

const semverLikeSchema = z.string().trim().min(1).max(64)
const scopeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/)
const localeSchema = z.string().trim().min(2).max(35)
const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "URL must use https.",
  })
const webhookEndpointUrlSchema = httpsUrlSchema.refine(
  (value) => {
    try {
      assertOutboundWebhookEndpointUrl(value)
      return true
    } catch {
      return false
    }
  },
  { message: "Webhook endpoint URL must be HTTPS and must not target local or private hosts." },
)
const extensionSlotSchema = z.enum(APP_ADMIN_EXTENSION_SLOTS)
const dataClassificationSchema = z.enum([
  "public",
  "internal",
  "confidential",
  "restricted",
  "personal",
  "financial",
])

const localizedHostMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    summary: z.string().trim().min(1).max(280),
    navigation: z.record(z.string(), z.string().trim().min(1).max(80)).default({}),
    extensions: z.record(z.string(), z.string().trim().min(1).max(80)).default({}),
    setup: z.record(z.string(), z.string().trim().min(1).max(80)).default({}),
  })
  .strict()

const adminPageSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    titleKey: z.string().trim().min(1).max(120),
    path: z
      .string()
      .trim()
      .regex(/^\/[a-z0-9-_/]*$/),
    entryUrl: httpsUrlSchema,
    /**
     * App-declared nav icon rendered as a remote `<img>` in admin chrome.
     * HTTPS-only; the app-level {@link appManifestSchema} `icon` is the
     * fallback when a page omits its own. Absent/invalid → generic app icon.
     */
    icon: httpsUrlSchema.optional(),
    /** Lower values appear first. Omitted pages use the deterministic default `0`. */
    order: z.number().int().min(-10_000).max(10_000).optional(),
    /**
     * Installation-local navigation group key. Pages with the same key render
     * beneath one structural nav item; its label is resolved from the
     * manifest's localized `navigation` messages using this key.
     */
    group: z.string().trim().min(1).max(80).optional(),
    /** Existing host navigation item id after which this page or group is inserted. */
    insertAfter: z.string().trim().min(1).max(120).optional(),
  })
  .strict()

const slotExtensionSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    titleKey: z.string().trim().min(1).max(120),
    version: semverLikeSchema,
    extensionApi: semverLikeSchema,
    entryUrl: httpsUrlSchema,
    slots: z.array(extensionSlotSchema).min(1),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

const webhookSubscriptionSchema = z
  .object({
    eventType: z.string().trim().min(1).max(160),
    eventVersion: semverLikeSchema,
    endpointUrl: webhookEndpointUrlSchema,
  })
  .strict()

export const appOwnedCustomFieldDeclarationSchema = customFieldDefinitionInputSchema
  .extend({
    logicalNamespace: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]*$/)
      .optional(),
    dataClassification: dataClassificationSchema.default("internal"),
  })
  .strict()

export const appManifestSchema = manifestDisallowedKeySchema.pipe(
  z
    .object({
      schemaVersion: z.literal(APP_MANIFEST_SCHEMA_VERSION),
      releaseVersion: semverLikeSchema,
      apiCompatibility: z.object({ min: semverLikeSchema, max: semverLikeSchema }).strict(),
      /**
       * App-level default nav icon (HTTPS remote asset). Applied at normalize
       * time to any admin page that omits its own `icon`.
       */
      icon: httpsUrlSchema.optional(),
      scopes: z
        .object({
          requested: z.array(scopeSchema).default([]),
          optional: z.array(scopeSchema).default([]),
        })
        .strict(),
      admin: z
        .object({
          pages: z.array(adminPageSchema).default([]),
          slotExtensions: z.array(slotExtensionSchema).default([]),
        })
        .strict()
        .default({ pages: [], slotExtensions: [] }),
      webhooks: z.array(webhookSubscriptionSchema).default([]),
      customFields: z.array(appOwnedCustomFieldDeclarationSchema).default([]),
      locales: z
        .object({
          default: localeSchema,
          supported: z.array(localeSchema).min(1),
          host: z.record(localeSchema, localizedHostMetadataSchema),
        })
        .strict(),
      urls: z
        .object({
          setup: httpsUrlSchema.optional(),
          lifecycle: httpsUrlSchema.optional(),
          health: httpsUrlSchema,
          launch: httpsUrlSchema,
          privacy: httpsUrlSchema,
          support: httpsUrlSchema,
        })
        .strict(),
      data: z
        .object({
          classifications: z.array(dataClassificationSchema).min(1),
          retention: z.string().trim().min(1).max(280),
          storesSecrets: z.boolean().default(false),
        })
        .strict(),
    })
    .strict()
    .superRefine((manifest, context) => {
      if (!manifest.locales.supported.includes(manifest.locales.default)) {
        context.addIssue({
          code: "custom",
          path: ["locales", "default"],
          message: "The default locale must be present in supported locales.",
        })
      }
      if (!manifest.locales.host[manifest.locales.default]) {
        context.addIssue({
          code: "custom",
          path: ["locales", "host", manifest.locales.default],
          message: "Host-rendered metadata is required for the default locale.",
        })
      }
      const groupAnchors = new Map<string, string | undefined>()
      for (const [index, page] of manifest.admin.pages.entries()) {
        if (!page.group) continue
        if (!groupAnchors.has(page.group)) {
          groupAnchors.set(page.group, page.insertAfter)
          continue
        }
        if (groupAnchors.get(page.group) !== page.insertAfter) {
          context.addIssue({
            code: "custom",
            path: ["admin", "pages", index, "insertAfter"],
            message: `All pages in navigation group '${page.group}' must use the same insertAfter value.`,
          })
        }
      }
    }),
)

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

export type AppManifest = z.infer<typeof appManifestSchema>
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
