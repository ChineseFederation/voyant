import { ADMIN_UI_EXTENSION_SLOTS } from "@voyant-travel/admin-extension-sdk/types"
import { customFieldDefinitionInputSchema } from "@voyant-travel/custom-fields-contracts"
import { assertOutboundWebhookEndpointUrl } from "@voyant-travel/webhook-delivery-contracts"
import { z } from "zod"
import {
  dataClassificationSchema,
  httpsUrlSchema,
  localeSchema,
  scopeSchema,
  semverLikeSchema,
} from "./primitives.js"

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

export type AppManifest = z.infer<typeof appManifestSchema>
